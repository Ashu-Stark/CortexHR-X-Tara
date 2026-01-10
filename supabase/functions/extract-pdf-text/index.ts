import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import pdf from "npm:pdf-parse@1.1.1";
import { Buffer } from "node:buffer";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resumeUrl, candidateId } = await req.json();

    if (!resumeUrl || !candidateId) {
      return new Response(
        JSON.stringify({ error: 'Resume URL and candidate ID are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracting text from resume for candidate:', candidateId);



    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let pdfArrayBuffer: ArrayBuffer;

    // Helper to extract storage path from Supabase URL
    const extractStoragePathFromUrl = (url: string): string | null => {
      try {
        const u = new URL(url);
        const pathname = u.pathname;
        const markers = [
          '/storage/v1/object/public/resumes/',
          '/storage/v1/object/sign/resumes/',
          '/storage/v1/object/resumes/',
        ];
        for (const marker of markers) {
          const idx = pathname.indexOf(marker);
          if (idx !== -1) {
            return decodeURIComponent(pathname.slice(idx + marker.length));
          }
        }
        return null;
      } catch {
        return null;
      }
    };

    const storagePath = extractStoragePathFromUrl(resumeUrl);

    if (storagePath) {
      console.log('Detected Supabase Storage URL, downloading via Admin Client:', storagePath);
      const { data, error } = await supabase.storage.from('resumes').download(storagePath);
      if (error) {
        console.error('Storage download error:', error);
        throw new Error(`Failed to download resume from storage: ${error.message}`);
      }
      if (!data) {
        throw new Error('Storage returned no data');
      }
      pdfArrayBuffer = await data.arrayBuffer();
    } else if (resumeUrl.startsWith('http') || resumeUrl.startsWith('https')) {
      const pdfResponse = await fetch(resumeUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch resume file from URL: ${pdfResponse.statusText}`);
      }
      pdfArrayBuffer = await pdfResponse.arrayBuffer();
    } else {
      // Direct path fallback
      console.log('Downloading from storage bucket "resumes" (assumed path):', resumeUrl);
      const { data, error } = await supabase.storage.from('resumes').download(resumeUrl);

      if (error) {
        console.error('Storage download error:', error);
        throw new Error(`Failed to download resume from storage: ${error.message}`);
      }
      if (!data) {
        throw new Error('Storage returned no data');
      }
      pdfArrayBuffer = await data.arrayBuffer();
    }

    // Strategy: Try Gemini Vision FIRST (most robust for Edge/Deno), then fallback to basic parsing
    let extractedText = "";

    // 1. Attempt Gemini Vision Extraction
    console.log('Attempting PDF text extraction via Gemini Vision (Primary Strategy)...');
    const envKeys = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || '';
    const apiKeys = envKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length > 0) {
      // Convert buffer to base64 ONCE
      const base64Data = btoa(new Uint8Array(pdfArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

      for (const apiKey of apiKeys) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "Extract all text from this PDF document verbatim. Return ONLY the extracted text." },
                  { inline_data: { mime_type: "application/pdf", data: base64Data } }
                ]
              }]
            })
          });

          if (response.ok) {
            const data = await response.json();
            const visionText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (visionText && visionText.length > 50) {
              console.log('Gemini Vision extraction successful with key ' + apiKey.substr(0, 5) + '..., length:', visionText.length);
              extractedText = visionText;
              break; // Success, exit loop
            }
          } else {
            console.warn(`Gemini Vision failed with key ${apiKey.substr(0, 5)}...: ${await response.text()}`);
          }
        } catch (visionError) {
          console.error(`Gemini Vision error with key ${apiKey.substr(0, 5)}...:`, visionError);
        }
      }
    } else {
      console.warn('No Google API key available for Vision extraction.');
    }

    // 2. Fallback to pdf-parse if Vision failed
    if (!extractedText || extractedText.trim().length < 50) {
      console.log('Gemini Vision yielded no results, falling back to npm:pdf-parse...');
      try {
        const pdfBuffer = Buffer.from(pdfArrayBuffer);
        const data = await pdf(pdfBuffer);
        if (data.text && data.text.length > 50) {
          extractedText = data.text;
          console.log('pdf-parse successful, length:', extractedText.length);
        }
      } catch (parseError: any) {
        console.error("pdf-parse error:", parseError);
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text extracted from document (PDF Parse failed and Vision fallback failed/skipped)');
    }

    // Clean extracted text (normalize whitespace, but keep structure)
    extractedText = extractedText
      .replace(/\r\n/g, '\n') // Normalize newlines
      .replace(/[ \t]+/g, ' ') // Collapse multiple spaces (but NOT newlines) to single space
      .replace(/\n\s*\n/g, '\n\n') // Collapse multiple newlines to max 2
      .trim();

    console.log('Extracted text length (cleaned):', extractedText.length);

    // Update the candidate with the extracted resume text
    const { error: updateError } = await supabase
      .from('candidates')
      .update({ resume_text: extractedText })
      .eq('id', candidateId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw updateError;
    }

    console.log('Successfully extracted and stored resume text');

    return new Response(
      JSON.stringify({
        success: true,
        textLength: extractedText.length,
        message: 'Resume text extracted successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in extract-pdf-text function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
