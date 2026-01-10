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
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // Contains user_id
    const error = url.searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      return new Response(
        `<html><body><script>window.close(); window.opener?.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: '${error}' }, '*');</script>Error: ${error}</body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    if (!code || !state) {
      return new Response('Missing code or state', { status: 400, headers: corsHeaders });
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!clientId || !clientSecret) {
      console.error('Google OAuth credentials not configured');
      return new Response(
        `<html><body><script>window.close(); window.opener?.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: 'OAuth not configured' }, '*');</script>Error: OAuth not configured</body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${supabaseUrl}/functions/v1/google-auth-callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return new Response(
        `<html><body><script>window.close(); window.opener?.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: 'Token exchange failed' }, '*');</script>Error: Token exchange failed</body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    const tokens = await tokenResponse.json();
    console.log('Tokens received successfully');

    // Store tokens in database
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + tokens.expires_in);

    const { error: dbError } = await supabase
      .from('hr_google_tokens')
      .upsert({
        user_id: state,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || '',
        token_expiry: expiryDate.toISOString(),
      }, { onConflict: 'user_id' });

    if (dbError) {
      console.error('Failed to store tokens:', dbError);
      return new Response(
        `<html><body><script>window.close(); window.opener?.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: 'Failed to store tokens' }, '*');</script>Error: Failed to store tokens</body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Success - close popup and notify parent
    return new Response(
      `<html>
        <body>
          <script>
            window.opener?.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
            window.close();
          </script>
          <p>Connected successfully! You can close this window.</p>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );

  } catch (error: unknown) {
    console.error('Error in google-auth-callback:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      `<html><body><script>window.close(); window.opener?.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: '${message}' }, '*');</script>Error: ${message}</body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
});
