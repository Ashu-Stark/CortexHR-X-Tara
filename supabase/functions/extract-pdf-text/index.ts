import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Fetch the PDF file
    const pdfResponse = await fetch(resumeUrl);
    if (!pdfResponse.ok) {
      throw new Error('Failed to fetch resume file');
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    // Use Aiapi AI with vision to extract text from the PDF
    const aiapiApiKey = Deno.env.get('AIAPI_API_KEY');
    if (!aiapiApiKey) {
      throw new Error('AIAPI_API_KEY not configured');
    }

    // For PDFs, we'll ask the AI to extract text by analyzing it
    // Since we can't directly parse PDFs in Deno easily, we'll use AI
    const prompt = `Please extract and return ALL text content from this document. 
Return the complete text as-is, preserving structure and formatting where possible.
Include all sections: personal info, work experience, education, skills, etc.
Just return the extracted text, no commentary.`;

    const aiResponse = await fetch('https://ai.gateway.aiapi.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiapiApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`
                }
              }
            ]
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`Text extraction failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const extractedText = aiData.choices?.[0]?.message?.content;

    if (!extractedText) {
      throw new Error('No text extracted from document');
    }

    console.log('Extracted text length:', extractedText.length);

    // Update the candidate with the extracted resume text
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
