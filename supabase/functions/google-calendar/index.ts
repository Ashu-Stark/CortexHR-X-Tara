import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarRequest {
  action: 'get-free-busy' | 'create-event' | 'check-connection';
  timeMin?: string;
  timeMax?: string;
  event?: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendees?: string[];
    createMeet?: boolean;
  };
}

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string | null> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    console.error('Token refresh failed:', await response.text());
    return null;
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    // Get user from JWT
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, timeMin, timeMax, event }: CalendarRequest = await req.json();

    // Get user's Google tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('hr_google_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (action === 'check-connection') {
      return new Response(
        JSON.stringify({ 
          connected: !!tokenData && !tokenError,
          configured: !!clientId && !!clientSecret
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: 'Google Calendar not connected', code: 'NOT_CONNECTED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token needs refresh
    let accessToken = tokenData.access_token;
    const expiryDate = new Date(tokenData.token_expiry);
    
    if (expiryDate < new Date()) {
      console.log('Token expired, refreshing...');
      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({ error: 'OAuth not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const newToken = await refreshAccessToken(tokenData.refresh_token, clientId, clientSecret);
      if (!newToken) {
        // Token refresh failed, user needs to reconnect
        await supabase.from('hr_google_tokens').delete().eq('user_id', user.id);
        return new Response(
          JSON.stringify({ error: 'Token expired, please reconnect Google Calendar', code: 'TOKEN_EXPIRED' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      accessToken = newToken;
      const newExpiry = new Date();
      newExpiry.setHours(newExpiry.getHours() + 1);
      await supabase.from('hr_google_tokens')
        .update({ access_token: newToken, token_expiry: newExpiry.toISOString() })
        .eq('user_id', user.id);
    }

    switch (action) {
      case 'get-free-busy': {
        if (!timeMin || !timeMax) {
          return new Response(
            JSON.stringify({ error: 'timeMin and timeMax required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get calendar list first
        const calendarsResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        const calendars = await calendarsResponse.json();
        const calendarIds = calendars.items?.map((c: any) => ({ id: c.id })) || [{ id: 'primary' }];

        // Get free/busy info
        const freeBusyResponse = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeMin,
            timeMax,
            items: calendarIds,
          }),
        });

        if (!freeBusyResponse.ok) {
          const errorText = await freeBusyResponse.text();
          console.error('Free/busy request failed:', errorText);
          return new Response(
            JSON.stringify({ error: 'Failed to get calendar availability' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const freeBusyData = await freeBusyResponse.json();
        
        // Combine all busy times
        const allBusySlots: { start: string; end: string }[] = [];
        for (const calendar of Object.values(freeBusyData.calendars || {})) {
          const calendarData = calendar as { busy?: Array<{ start: string; end: string }> };
          if (calendarData.busy) {
            allBusySlots.push(...calendarData.busy);
          }
        }

        return new Response(
          JSON.stringify({ busySlots: allBusySlots }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create-event': {
        if (!event) {
          return new Response(
            JSON.stringify({ error: 'Event details required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const calendarEvent: any = {
          summary: event.summary,
          description: event.description || '',
          start: {
            dateTime: event.startTime,
            timeZone: 'UTC',
          },
          end: {
            dateTime: event.endTime,
            timeZone: 'UTC',
          },
        };

        if (event.attendees && event.attendees.length > 0) {
          calendarEvent.attendees = event.attendees.map(email => ({ email }));
        }

        if (event.createMeet) {
          calendarEvent.conferenceData = {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          };
        }

        const createResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events${event.createMeet ? '?conferenceDataVersion=1' : ''}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(calendarEvent),
          }
        );

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.error('Event creation failed:', errorText);
          return new Response(
            JSON.stringify({ error: 'Failed to create calendar event' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const createdEvent = await createResponse.json();
        
        return new Response(
          JSON.stringify({
            eventId: createdEvent.id,
            htmlLink: createdEvent.htmlLink,
            meetLink: createdEvent.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error: unknown) {
    console.error('Error in google-calendar:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
