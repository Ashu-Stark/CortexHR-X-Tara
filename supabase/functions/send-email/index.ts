import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  emailType: string;
  candidateId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, subject, html, emailType, candidateId }: EmailRequest = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending ${emailType} email to ${to}`);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    let emailSent = false;
    let emailError = null;

    if (resendApiKey) {
      // Send via Resend if API key is configured
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: 'CortexHR <noreply@cortexhr.com>',
          to: [to],
          subject,
          html,
        }),
      });

      if (resendResponse.ok) {
        emailSent = true;
        console.log('Email sent successfully via Resend');
      } else {
        const errorData = await resendResponse.text();
        emailError = errorData;
        console.error('Resend error:', errorData);
      }
    } else {
      console.log('RESEND_API_KEY not configured, logging email instead');
      emailError = 'Email service not configured';
    }

    // Log the email attempt in the database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: logError } = await supabase
      .from('email_logs')
      .insert({
        recipient_email: to,
        subject,
        email_type: emailType,
        status: emailSent ? 'sent' : 'failed',
        candidate_id: candidateId || null,
      });

    if (logError) {
      console.error('Error logging email:', logError);
    }

    return new Response(
      JSON.stringify({ 
        success: emailSent,
        message: emailSent ? 'Email sent successfully' : 'Email logged (service not configured)',
        logged: !logError,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in send-email function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
