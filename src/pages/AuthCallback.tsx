import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the session from URL hash
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session?.user) {
          throw new Error('No session found');
        }

        setMessage('Verifying HR access...');

        // Check if user has HR role
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (roleError) {
          console.error('Role check error:', roleError);
        }

        // If no role exists, create one (auto-assign recruiter role for new Google users)
        if (!roleData) {
          const { error: insertError } = await supabase
            .from('user_roles')
            .insert({ user_id: session.user.id, role: 'recruiter' });

          if (insertError) {
            console.error('Failed to assign role:', insertError);
            throw new Error('Failed to set up account. Please contact support.');
          }
        }

        setMessage('Connecting Google services...');

        // Check if we have Google tokens from OAuth (they come with the session)
        const providerToken = session.provider_token;
        const providerRefreshToken = session.provider_refresh_token;

        if (providerToken) {
          // Store Google tokens for Calendar/Meet/Gmail access
          const { error: tokenError } = await supabase
            .from('hr_google_tokens')
            .upsert({
              user_id: session.user.id,
              access_token: providerToken,
              refresh_token: providerRefreshToken || '',
              token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour
            }, { onConflict: 'user_id' });

          if (tokenError) {
            console.error('Failed to store Google tokens:', tokenError);
          } else {
            setMessage('Google Calendar & Meet connected!');
          }
        }

        setStatus('success');
        setMessage('Welcome to CortexHR!');
        
        toast.success('Successfully logged in!');
        
        // Redirect to dashboard after short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);

      } catch (error: any) {
        console.error('Auth callback error:', error);
        setStatus('error');
        setMessage(error.message || 'Authentication failed');
        
        toast.error(error.message || 'Authentication failed');
        
        // Redirect to login after delay
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md p-8">
        <div className="flex justify-center">
          {status === 'loading' && (
            <div className="w-20 h-20 bg-gradient-to-tr from-primary to-accent rounded-2xl flex items-center justify-center animate-pulse">
              <Sparkles className="w-10 h-10 text-primary-foreground" />
            </div>
          )}
          {status === 'success' && (
            <div className="w-20 h-20 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
          )}
          {status === 'error' && (
            <div className="w-20 h-20 bg-destructive/20 rounded-2xl flex items-center justify-center">
              <XCircle className="w-10 h-10 text-destructive" />
            </div>
          )}
        </div>
        
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">
            {status === 'loading' && 'Signing you in...'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Authentication Failed'}
          </h1>
          <p className="text-muted-foreground flex items-center justify-center gap-2">
            {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
            {message}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
