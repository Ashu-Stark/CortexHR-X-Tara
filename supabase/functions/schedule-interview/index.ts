import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduleRequest {
  applicationId: string;
  scheduledAt: string;
  durationMinutes: number;
  interviewType: string;
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  meetingUrl?: string;
  meetingId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      applicationId, 
      scheduledAt, 
      durationMinutes, 
      interviewType,
      candidateEmail,
      candidateName,
      jobTitle,
      meetingUrl: providedMeetingUrl,
      meetingId: providedMeetingId
    }: ScheduleRequest = await req.json();

    if (!applicationId || !scheduledAt) {
      return new Response(
        JSON.stringify({ error: 'Application ID and scheduled time are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scheduling interview for application:', applicationId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let meetingUrl = providedMeetingUrl || null;
    let meetingId = providedMeetingId || null;

    // If no meeting URL provided, try Microsoft Teams
    if (!meetingUrl) {
      const msClientId = Deno.env.get('MS_CLIENT_ID');
      const msClientSecret = Deno.env.get('MS_CLIENT_SECRET');
      const msTenantId = Deno.env.get('MS_TENANT_ID');

      if (msClientId && msClientSecret && msTenantId) {
        console.log('Creating Microsoft Teams meeting...');
        try {
          const tokenResponse = await fetch(
            `https://login.microsoftonline.com/${msTenantId}/oauth2/v2.0/token`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: msClientId,
                client_secret: msClientSecret,
                scope: 'https://graph.microsoft.com/.default',
                grant_type: 'client_credentials',
              }),
            }
          );

          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            const startTime = new Date(scheduledAt);
            const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

            const meetingResponse = await fetch(
              'https://graph.microsoft.com/v1.0/users/me/onlineMeetings',
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${tokenData.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  startDateTime: startTime.toISOString(),
                  endDateTime: endTime.toISOString(),
                  subject: `Interview: ${candidateName} - ${jobTitle}`,
                }),
              }
            );

            if (meetingResponse.ok) {
              const meetingData = await meetingResponse.json();
              meetingUrl = meetingData.joinWebUrl;
              meetingId = meetingData.id;
              console.log('Teams meeting created');
            }
          }
        } catch (msError) {
          console.error('Microsoft Teams error:', msError);
        }
      }
    }

    // Create interview record
    const { data: interview, error: interviewError } = await supabase
      .from('interviews')
      .insert({
        application_id: applicationId,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes || 60,
        interview_type: interviewType || 'Technical',
        meeting_url: meetingUrl,
        meeting_id: meetingId,
        status: 'scheduled',
      })
      .select()
      .single();

    if (interviewError) {
      console.error('Error creating interview:', interviewError);
      throw interviewError;
    }

    // Update application status
    const { error: updateError } = await supabase
      .from('applications')
      .update({ status: 'interview' })
      .eq('id', applicationId);

    if (updateError) {
      console.error('Error updating application status:', updateError);
    }

    // Format date for email
    const interviewDate = new Date(scheduledAt);
    const formattedDate = interviewDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = interviewDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    // Send confirmation email
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Interview Scheduled! 🎉</h1>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="color: #4a5568; margin-top: 0;">Dear <strong>${candidateName}</strong>,</p>
    
    <p style="color: #4a5568;">Great news! Your interview for the <strong>${jobTitle}</strong> position has been scheduled.</p>
    
    <div style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #718096; font-size: 14px;">📅 Date</td>
          <td style="padding: 8px 0; color: #2d3748; font-weight: 600; text-align: right;">${formattedDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #718096; font-size: 14px;">🕐 Time</td>
          <td style="padding: 8px 0; color: #2d3748; font-weight: 600; text-align: right;">${formattedTime}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #718096; font-size: 14px;">⏱️ Duration</td>
          <td style="padding: 8px 0; color: #2d3748; font-weight: 600; text-align: right;">${durationMinutes} minutes</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #718096; font-size: 14px;">📋 Type</td>
          <td style="padding: 8px 0; color: #2d3748; font-weight: 600; text-align: right;">${interviewType}</td>
        </tr>
      </table>
    </div>
    
    ${meetingUrl ? `
    <div style="text-align: center; margin: 25px 0;">
      <a href="${meetingUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        🎥 Join Video Meeting
      </a>
      <p style="color: #718096; font-size: 12px; margin-top: 10px;">Or copy this link: <a href="${meetingUrl}" style="color: #667eea;">${meetingUrl}</a></p>
    </div>
    ` : `
    <p style="color: #718096; background: #fff8e1; padding: 15px; border-radius: 8px; text-align: center;">
      📌 Meeting details will be shared separately by the hiring team.
    </p>
    `}
    
    <div style="border-top: 1px solid #e2e8f0; margin-top: 25px; padding-top: 20px;">
      <h3 style="color: #2d3748; font-size: 16px; margin-bottom: 10px;">Tips for your interview:</h3>
      <ul style="color: #4a5568; padding-left: 20px; margin: 0;">
        <li>Test your audio and video 10 minutes before</li>
        <li>Find a quiet, well-lit space</li>
        <li>Have a copy of your resume ready</li>
        <li>Prepare questions about the role</li>
      </ul>
    </div>
    
    <p style="color: #4a5568; margin-top: 25px;">Best of luck!</p>
    <p style="color: #4a5568; margin-bottom: 0;"><strong>The CortexHR Team</strong></p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #a0aec0; font-size: 12px;">
    <p>This is an automated message from CortexHR</p>
  </div>
</body>
</html>
    `;

    // Send email notification
    try {
      await supabase.functions.invoke('send-email', {
        body: {
          to: candidateEmail,
          subject: `Interview Confirmed: ${jobTitle} - ${formattedDate}`,
          html: emailHtml,
          emailType: 'interview_scheduled',
        },
      });
      console.log('Interview confirmation email sent');
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
    }

    // Send Slack notification if configured
    try {
      await supabase.functions.invoke('slack-notify', {
        body: {
          type: 'interview_scheduled',
          candidateName,
          jobTitle,
          details: {
            date: formattedDate,
            time: formattedTime,
            duration: `${durationMinutes} min`,
            type: interviewType,
            meetingUrl: meetingUrl || 'TBD',
          },
        },
      });
      console.log('Slack notification sent');
    } catch (slackError) {
      console.log('Slack notification skipped (not configured)');
    }

    console.log('Interview scheduled successfully:', interview.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        interview,
        meetingUrl,
        message: meetingUrl 
          ? 'Interview scheduled with video meeting link' 
          : 'Interview scheduled (add meeting link manually)'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in schedule-interview function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
