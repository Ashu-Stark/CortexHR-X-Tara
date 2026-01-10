import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
}

const initialMessages: Message[] = [
  {
    id: 1,
    role: 'assistant',
    content: "Hello! I'm your AI HR assistant. I can help you with:\n\n• **Schedule interviews** - Just tell me the candidate name and preferred time\n• **View candidates** - Ask about candidates by status or get top scorers\n• **Check interviews** - See today's or upcoming interviews\n• **Send emails** - Draft and send emails to candidates\n\nHow can I assist you today?",
    timestamp: new Date(),
  },
];

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { loading: authLoading } = useAuth(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Prepare conversation history for AI (excluding timestamps and other metadata)
      const conversationHistory = messages
        .filter(m => m.id !== 1) // Exclude initial greeting
        .concat(userMessage)
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      const { data, error } = await supabase.functions.invoke('hr-chat', {
        body: { messages: conversationHistory }
      });

      if (error) {
        // Check for specific error types
        const status = (error as any)?.context?.status;
        if (status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (status === 402) {
          throw new Error('Usage limit reached. Please check your account settings.');
        }
        throw error;
      }

      const aiMessage: Message = {
        id: Date.now(),
        role: 'assistant',
        content: data.content || 'I apologize, but I could not process that request.',
        timestamp: new Date(),
        toolsUsed: data.toolsUsed
      };

      setMessages(prev => [...prev, aiMessage]);

      // Show toast if tools were used
      if (data.toolsUsed?.length) {
        toast.success(`Action completed: ${data.toolsUsed.join(', ')}`);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      toast.error(error.message || 'Failed to get response');
      
      const errorMessage: Message = {
        id: Date.now(),
        role: 'assistant',
        content: `I'm sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Quick action buttons
  const quickActions = [
    { label: "Today's interviews", message: "What interviews are scheduled for today?" },
    { label: "Top candidates", message: "Show me the top candidates with highest AI scores" },
    { label: "Pending reviews", message: "Which candidates are still in screening status?" },
  ];

  const handleQuickAction = (message: string) => {
    setInput(message);
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="h-[calc(100vh-8rem)] flex flex-col"
      >
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">HR Assistant</h1>
              <p className="text-muted-foreground text-sm">AI-powered scheduling & candidate management</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              size="sm"
              onClick={() => handleQuickAction(action.message)}
              className="text-xs"
            >
              {action.label}
            </Button>
          ))}
        </div>

        {/* Chat Area */}
        <div className="flex-1 bg-card rounded-xl border border-border overflow-hidden flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    message.role === 'assistant' 
                      ? 'bg-gradient-to-br from-primary to-accent' 
                      : 'bg-secondary'
                  }`}>
                    {message.role === 'assistant' ? (
                      <Sparkles className="w-4 h-4 text-primary-foreground" />
                    ) : (
                      <User className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className={`max-w-[70%] ${message.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`rounded-2xl px-4 py-3 ${
                      message.role === 'assistant' 
                        ? 'bg-secondary text-foreground rounded-tl-sm' 
                        : 'bg-primary text-primary-foreground rounded-tr-sm'
                    }`}>
                      <div 
                        className="text-sm leading-relaxed whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ 
                          __html: message.content
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br>')
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {message.toolsUsed && (
                        <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          {message.toolsUsed.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="bg-secondary rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-border">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Ask about candidates, schedule interviews, or send emails..."
                disabled={isLoading}
                className="flex-1 px-4 py-3 rounded-lg bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-foreground placeholder-muted-foreground disabled:opacity-50"
              />
              <Button onClick={handleSend} size="lg" className="px-6" disabled={isLoading || !input.trim()}>
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Chat;
