import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { 
  Mail, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Loader2,
  Save,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

interface EmailTemplate {
  id: string;
  name: string;
  email_type: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const emailTypes = [
  { value: "interview_invite", label: "Interview Invitation" },
  { value: "rejection", label: "Rejection" },
  { value: "offer", label: "Offer Letter" },
  { value: "follow_up", label: "Follow Up" },
  { value: "welcome", label: "Welcome" },
  { value: "custom", label: "Custom" },
];

const EmailTemplates = () => {
  const { loading: authLoading } = useAuth(true);
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email_type: "",
    subject: "",
    body: "",
    is_default: false,
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates", typeFilter],
    queryFn: async () => {
      let query = supabase
        .from("email_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (typeFilter !== "all") {
        query = query.eq("email_type", typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            name: data.name,
            email_type: data.email_type,
            subject: data.subject,
            body: data.body,
            is_default: data.is_default,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("email_templates")
          .insert({
            name: data.name,
            email_type: data.email_type,
            subject: data.subject,
            body: data.body,
            is_default: data.is_default,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success(editingTemplate ? "Template updated" : "Template created");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save template");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success("Template deleted");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete template");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email_type: "",
      subject: "",
      body: "",
      is_default: false,
    });
    setEditingTemplate(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      email_type: template.email_type,
      subject: template.subject,
      body: template.body,
      is_default: template.is_default,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      ...formData,
      id: editingTemplate?.id,
    });
  };

  const filteredTemplates = templates?.filter((template) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      template.name.toLowerCase().includes(searchLower) ||
      template.subject.toLowerCase().includes(searchLower)
    );
  });

  const getTypeLabel = (type: string) => {
    return emailTypes.find((t) => t.value === type)?.label || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      interview_invite: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      rejection: "bg-red-500/10 text-red-600 border-red-500/20",
      offer: "bg-green-500/10 text-green-600 border-green-500/20",
      follow_up: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      welcome: "bg-purple-500/10 text-purple-600 border-purple-500/20",
      custom: "bg-muted text-muted-foreground border-border",
    };
    return colors[type] || colors.custom;
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
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
                  Email Templates
                </h1>
                <p className="text-muted-foreground text-sm">
                  Create and manage reusable email templates
                </p>
              </div>
            </div>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {emailTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Templates List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredTemplates?.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Mail className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                No templates found
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || typeFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Create your first email template to get started"}
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates?.map((template, index) => (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="bg-card border-border hover:border-primary/30 transition-colors h-full">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className={getTypeColor(template.email_type)}>
                          {getTypeLabel(template.email_type)}
                        </Badge>
                        {template.is_default && (
                          <Badge variant="outline" className="border-primary/50 text-primary">
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(template)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(template.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <h3 className="font-semibold text-foreground mb-1 truncate">
                      {template.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3 truncate">
                      Subject: {template.subject}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
                      {template.body}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update your email template"
                : "Create a reusable email template for your HR communications"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Interview Invitation"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email_type">Email Type</Label>
                <Select
                  value={formData.email_type}
                  onValueChange={(value) => setFormData({ ...formData, email_type: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {emailTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="e.g., Interview Invitation - {{position}}"
                required
              />
              <p className="text-xs text-muted-foreground">
                Use {`{{candidateName}}`}, {`{{position}}`}, {`{{company}}`} as placeholders
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Email Body</Label>
              <Textarea
                id="body"
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="Write your email template here..."
                rows={10}
                required
              />
              <p className="text-xs text-muted-foreground">
                Available placeholders: {`{{candidateName}}`}, {`{{position}}`}, {`{{company}}`}, {`{{date}}`}, {`{{time}}`}, {`{{interviewerName}}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
              />
              <Label htmlFor="is_default">Set as default template for this type</Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {editingTemplate ? "Update" : "Create"} Template
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default EmailTemplates;
