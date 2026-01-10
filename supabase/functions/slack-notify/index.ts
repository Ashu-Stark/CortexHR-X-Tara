import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlackMessage {
  type: 'new_application' | 'interview_scheduled' | 'candidate_status' | 'custom';
  candidateName?: string;
  jobTitle?: string;
  details?: Record<string, string | number>;
  customMessage?: string;
  channel?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    
    if (!webhookUrl) {
      console.log('Slack webhook not configured, skipping notification');
      return new Response(
        JSON.stringify({ success: false, message: 'Slack webhook not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: SlackMessage = await req.json();
    console.log('Sending Slack notification:', payload.type);

    let slackMessage: Record<string, unknown>;

    switch (payload.type) {
      case 'new_application':
        slackMessage = {
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: "📋 New Application Received",
                emoji: true
              }
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Candidate:*\n${payload.candidateName || 'Unknown'}`
                },
                {
                  type: "mrkdwn",
                  text: `*Position:*\n${payload.jobTitle || 'Unknown'}`
                }
              ]
            },
            {
              type: "section",
              fields: Object.entries(payload.details || {}).map(([key, value]) => ({
                type: "mrkdwn",
                text: `*${key}:*\n${value}`
              }))
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Received at ${new Date().toLocaleString()}`
                }
              ]
            }
          ]
        };
        break;

      case 'interview_scheduled':
        slackMessage = {
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: "📅 Interview Scheduled",
                emoji: true
              }
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Candidate:*\n${payload.candidateName || 'Unknown'}`
                },
                {
                  type: "mrkdwn",
                  text: `*Position:*\n${payload.jobTitle || 'Unknown'}`
                }
              ]
            },
            {
              type: "section",
              fields: Object.entries(payload.details || {}).map(([key, value]) => ({
                type: "mrkdwn",
                text: `*${key}:*\n${value}`
              }))
            },
            {
              type: "actions",
              elements: payload.details?.meetingUrl ? [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "Join Meeting",
                    emoji: true
                  },
                  url: String(payload.details.meetingUrl),
                  style: "primary"
                }
              ] : []
            }
          ]
        };
        break;

      case 'candidate_status':
        const statusEmoji: Record<string, string> = {
          screening: '🔍',
          interview: '🎤',
          offer: '💼',
          hired: '🎉',
          rejected: '❌'
        };
        const status = String(payload.details?.status || 'unknown');
        slackMessage = {
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `${statusEmoji[status] || '📌'} Candidate Status Updated`,
                emoji: true
              }
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Candidate:*\n${payload.candidateName || 'Unknown'}`
                },
                {
                  type: "mrkdwn",
                  text: `*New Status:*\n${status.charAt(0).toUpperCase() + status.slice(1)}`
                }
              ]
            }
          ]
        };
        break;

      case 'custom':
      default:
        slackMessage = {
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: payload.customMessage || 'Notification from CortexHR'
              }
            }
          ]
        };
    }

    // Send to Slack
    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      console.error('Slack API error:', errorText);
      throw new Error(`Slack notification failed: ${errorText}`);
    }

    console.log('Slack notification sent successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Notification sent to Slack' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in slack-notify function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
