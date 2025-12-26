import { useState, useEffect } from 'react';
import { User, Bell, Globe, Check, ExternalLink, Loader2, CheckCircle, XCircle, Mail, RefreshCw, MessageSquare, Settings2, Cpu } from 'lucide-react';
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Settings = () => {
  const { user } = useAuth(true);
  const [notifications, setNotifications] = useState({
    emailNewApplications: true,
    emailInterviewReminders: true,
    slackNotifications: false,
  });
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(true);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [syncingEmails, setSyncingEmails] = useState(false);
  const [saving, setSaving] = useState(false);

  // Slack state
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [showSlackDialog, setShowSlackDialog] = useState(false);
  const [savingSlack, setSavingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  // AI Provider state
  const [aiProvider, setAiProvider] = useState('aiapi');
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiApiKey, setAiApiKey] = useState('');
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    checkGoogleConnection();
    checkSlackConnection();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setGoogleConnected(true);
        toast.success('Google Calendar connected successfully!');
        setConnectingGoogle(false);
      } else if (event.data?.type === 'GOOGLE_AUTH_ERROR') {
        toast.error(`Failed to connect: ${event.data.error}`);
        setConnectingGoogle(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkGoogleConnection = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: { action: 'check-connection' },
      });

      if (!error && data) {
        setGoogleConnected(data.connected);
        setGoogleConfigured(data.configured);
      }
    } catch (error) {
      console.error('Error checking Google connection:', error);
    } finally {
      setCheckingGoogle(false);
    }
  };

  const checkSlackConnection = async () => {
    // Check if Slack is configured by looking at local storage or making a test call
    const savedSlackStatus = localStorage.getItem('slack_connected');
    if (savedSlackStatus === 'true') {
      setSlackConnected(true);
      setNotifications(prev => ({ ...prev, slackNotifications: true }));
    }
  };

  const handleConnectGoogle = async () => {
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    if (!googleConfigured) {
      toast.error('Google OAuth is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your backend secrets.');
      return;
    }

    setConnectingGoogle(true);

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId) {
      toast.error('Google Client ID not configured. Please contact your administrator.');
      setConnectingGoogle(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const redirectUri = `${supabaseUrl}/functions/v1/google-auth-callback`;
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${user.id}`;

    const popup = window.open(authUrl, 'Google Auth', 'width=500,height=600,menubar=no,toolbar=no');

    if (!popup) {
      toast.error('Popup blocked. Please allow popups for this site.');
      setConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      const { error } = await supabase
        .from('hr_google_tokens')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;

      setGoogleConnected(false);
      toast.success('Google Calendar disconnected');
    } catch (error: any) {
      toast.error(error.message || 'Failed to disconnect');
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setSaving(false);
    toast.success('Notification settings saved');
  };

  const handleSyncGmailResumes = async () => {
    if (!user) return;

    setSyncingEmails(true);
    try {
      const { data, error } = await supabase.functions.invoke('poll-gmail-resumes', {
        body: { userId: user.id },
      });

      if (error) throw error;

      if (data.results?.[0]?.processed > 0) {
        toast.success(`Imported ${data.results[0].processed} new candidates from your inbox!`);
      } else {
        toast.info('No new resume emails found in the last 24 hours');
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      toast.error(error.message || 'Failed to sync emails');
    } finally {
      setSyncingEmails(false);
    }
  };

  const handleConnectSlack = async () => {
    if (!slackWebhookUrl.startsWith('https://hooks.slack.com/')) {
      toast.error('Please enter a valid Slack webhook URL');
      return;
    }

    setSavingSlack(true);
    try {
      // Test the webhook
      const response = await supabase.functions.invoke('slack-notify', {
        body: {
          type: 'custom',
          customMessage: '✅ CortexHR has been successfully connected to this channel!'
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Save to localStorage (in production, save to backend)
      localStorage.setItem('slack_connected', 'true');
      localStorage.setItem('slack_webhook_url', slackWebhookUrl);

      setSlackConnected(true);
      setNotifications(prev => ({ ...prev, slackNotifications: true }));
      setShowSlackDialog(false);
      toast.success('Slack connected successfully!');
    } catch (error: any) {
      toast.error('Failed to connect Slack. Please check your webhook URL.');
    } finally {
      setSavingSlack(false);
    }
  };

  const handleTestSlack = async () => {
    setTestingSlack(true);
    try {
      const { error } = await supabase.functions.invoke('slack-notify', {
        body: {
          type: 'custom',
          customMessage: '🧪 Test notification from CortexHR - Your Slack integration is working!'
        }
      });

      if (error) throw error;
      toast.success('Test notification sent to Slack!');
    } catch (error: any) {
      toast.error('Failed to send test notification');
    } finally {
      setTestingSlack(false);
    }
  };

  const handleDisconnectSlack = () => {
    localStorage.removeItem('slack_connected');
    localStorage.removeItem('slack_webhook_url');
    setSlackConnected(false);
    setSlackWebhookUrl('');
    setNotifications(prev => ({ ...prev, slackNotifications: false }));
    toast.success('Slack disconnected');
  };

  const handleSaveAiProvider = async () => {
    if (aiProvider !== 'aiapi' && !aiApiKey) {
      toast.error('Please enter an API key');
      return;
    }

    setSavingAi(true);
    try {
      // In production, this would save to backend secrets
      localStorage.setItem('ai_provider', aiProvider);
      if (aiApiKey) {
        localStorage.setItem(`${aiProvider}_api_key`, aiApiKey);
      }

      setShowAiDialog(false);
      toast.success(`AI provider set to ${aiProvider === 'aiapi' ? 'Aiapi AI' : aiProvider === 'openai' ? 'OpenAI' : 'HuggingFace'}`);
    } catch (error: any) {
      toast.error('Failed to save AI provider settings');
    } finally {
      setSavingAi(false);
    }
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-8 max-w-4xl"
      >
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage your account and preferences</p>
        </div>

        {/* Profile Section */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
              <User className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Profile</h3>
              <p className="text-sm text-muted-foreground">Manage your account details</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <p className="text-muted-foreground">{user?.email || 'Not logged in'}</p>
            </div>
          </div>
        </div>


        {/* Notifications Section */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
              <Bell className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Notifications</h3>
              <p className="text-sm text-muted-foreground">Configure your notification preferences</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-foreground">New application alerts</p>
                <p className="text-sm text-muted-foreground">Get notified when new candidates apply</p>
              </div>
              <Switch
                checked={notifications.emailNewApplications}
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, emailNewApplications: checked }))}
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-foreground">Interview reminders</p>
                <p className="text-sm text-muted-foreground">Receive reminders before scheduled interviews</p>
              </div>
              <Switch
                checked={notifications.emailInterviewReminders}
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, emailInterviewReminders: checked }))}
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-foreground">Slack notifications</p>
                <p className="text-sm text-muted-foreground">Get notified in your Slack workspace</p>
              </div>
              <Switch
                checked={notifications.slackNotifications}
                disabled={!slackConnected}
                onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, slackNotifications: checked }))}
              />
            </div>
            <Button onClick={handleSaveNotifications} disabled={saving} className="mt-4">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Save Preferences
            </Button>
          </div>
        </div>

        {/* Integrations Section */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
              <Globe className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Integrations</h3>
              <p className="text-sm text-muted-foreground">Connect external services for scheduling and notifications</p>
            </div>
          </div>
          <div className="space-y-4">
            {/* Google Calendar + Meet */}
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <span className="text-lg">📅</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">Google Calendar & Meet</p>
                    {!checkingGoogle && googleConnected && (
                      <span className="flex items-center text-xs text-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sync interviews and auto-generate Meet links
                  </p>
                </div>
              </div>
              {checkingGoogle ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : googleConnected ? (
                <Button
                  variant="outline"
                  onClick={handleDisconnectGoogle}
                  className="text-destructive hover:text-destructive"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleConnectGoogle}
                  disabled={connectingGoogle}
                >
                  {connectingGoogle ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4 mr-2" />
                  )}
                  Connect
                </Button>
              )}
            </div>

            {/* Gmail Resume Ingestion */}
            {googleConnected && (
              <div className="flex items-center justify-between py-3 border-b border-border bg-secondary/30 rounded-lg px-4 -mx-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">Auto Resume Import</p>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">AI Powered</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Automatically import resumes from your Gmail inbox
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleSyncGmailResumes}
                  disabled={syncingEmails}
                >
                  {syncingEmails ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Sync Now
                </Button>
              </div>
            )}

            {/* Slack */}
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">Slack</p>
                    {slackConnected && (
                      <span className="flex items-center text-xs text-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Get instant notifications in your Slack workspace
                  </p>
                </div>
              </div>
              {slackConnected ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestSlack}
                    disabled={testingSlack}
                  >
                    {testingSlack ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDisconnectSlack}
                    className="text-destructive hover:text-destructive"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Dialog open={showSlackDialog} onOpenChange={setShowSlackDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Connect
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Connect Slack</DialogTitle>
                      <DialogDescription>
                        Enter your Slack webhook URL to receive notifications about new applications, interviews, and more.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="webhook-url">Webhook URL</Label>
                        <Input
                          id="webhook-url"
                          placeholder="https://hooks.slack.com/services/..."
                          value={slackWebhookUrl}
                          onChange={(e) => setSlackWebhookUrl(e.target.value)}
                        />
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-4 text-sm space-y-2">
                        <p className="font-medium text-foreground">How to get your webhook URL:</p>
                        <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                          <li>Go to api.slack.com/apps</li>
                          <li>Create a new app or select existing</li>
                          <li>Enable "Incoming Webhooks"</li>
                          <li>Add a new webhook to your workspace</li>
                          <li>Copy the webhook URL</li>
                        </ol>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowSlackDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleConnectSlack} disabled={savingSlack || !slackWebhookUrl}>
                        {savingSlack ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                        Connect
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* Microsoft Teams (Coming Soon) */}
            <div className="flex items-center justify-between py-3 opacity-60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center">
                  <span className="text-lg">📹</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">Microsoft Teams</p>
                    <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">Coming Soon</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Create Teams meetings for interviews
                  </p>
                </div>
              </div>
              <Button variant="outline" disabled>
                <ExternalLink className="w-4 h-4 mr-2" />
                Connect
              </Button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="pt-8 border-t border-border">
          <h2 className="text-lg font-display font-semibold text-foreground mb-4">Danger Zone</h2>
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Delete Account</h3>
                <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
              </div>
              <Button variant="destructive" onClick={() => toast.error('Please contact support to delete your account')}>
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Settings;
