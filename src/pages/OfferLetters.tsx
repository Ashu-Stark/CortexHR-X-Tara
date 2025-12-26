import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { 
  FileText, 
  Search, 
  Filter, 
  Send, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  Mail,
  Calendar,
  DollarSign,
  Building,
  User
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { toast } from "sonner";
import { OfferLetterDialog } from "@/components/OfferLetterDialog";

interface OfferLetter {
  id: string;
  position_title: string;
  department: string;
  salary_amount: number;
  salary_currency: string;
  salary_frequency: string;
  proposed_start_date: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  application_id: string;
  applications: {
    candidates: {
      full_name: string;
      email: string;
    };
    jobs: {
      title: string;
    };
  };
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  draft: { icon: <Clock className="w-4 h-4" />, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", label: "Draft" },
  sent: { icon: <Send className="w-4 h-4" />, color: "bg-blue-500/10 text-blue-600 border-blue-500/20", label: "Sent" },
  accepted: { icon: <CheckCircle className="w-4 h-4" />, color: "bg-green-500/10 text-green-600 border-green-500/20", label: "Accepted" },
  rejected: { icon: <XCircle className="w-4 h-4" />, color: "bg-red-500/10 text-red-600 border-red-500/20", label: "Rejected" },
  expired: { icon: <Clock className="w-4 h-4" />, color: "bg-muted text-muted-foreground border-border", label: "Expired" },
};

const OfferLetters = () => {
  const { loading: authLoading } = useAuth(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOffer, setSelectedOffer] = useState<OfferLetter | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: offers, isLoading, refetch } = useQuery({
    queryKey: ["offer-letters", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("offer_letters")
        .select(`
          *,
          applications!inner(
            candidates!inner(full_name, email),
            jobs!inner(title)
          )
        `)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OfferLetter[];
    },
  });

  const filteredOffers = offers?.filter((offer) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      offer.position_title.toLowerCase().includes(searchLower) ||
      offer.applications.candidates.full_name.toLowerCase().includes(searchLower) ||
      offer.applications.candidates.email.toLowerCase().includes(searchLower) ||
      offer.department.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: offers?.length || 0,
    drafts: offers?.filter((o) => o.status === "draft").length || 0,
    sent: offers?.filter((o) => o.status === "sent").length || 0,
    accepted: offers?.filter((o) => o.status === "accepted").length || 0,
  };

  const handleSendOffer = async (offerId: string) => {
    try {
      const { error } = await supabase.functions.invoke("send-offer-letter", {
        body: { offerLetterId: offerId },
      });

      if (error) throw error;
      toast.success("Offer letter sent successfully!");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to send offer letter");
    }
  };

  const formatSalary = (amount: number, currency: string, frequency: string) => {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 0,
    }).format(amount);
    return `${formatted}/${frequency === "yearly" ? "yr" : frequency === "monthly" ? "mo" : "hr"}`;
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
                <FileText className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
                  Offer Letters
                </h1>
                <p className="text-muted-foreground text-sm">
                  Manage and track all offer letters
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                </div>
                <FileText className="w-8 h-8 text-primary/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Drafts</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.drafts}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Sent</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.sent}</p>
                </div>
                <Send className="w-8 h-8 text-blue-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Accepted</p>
                  <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, position, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Offer Letters List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredOffers?.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                No offer letters found
              </h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Create offer letters from the Candidates page"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredOffers?.map((offer, index) => {
              const status = statusConfig[offer.status] || statusConfig.draft;
              
              return (
                <motion.div
                  key={offer.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="bg-card border-border hover:border-primary/30 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                        {/* Candidate Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <User className="w-6 h-6 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-foreground truncate">
                                {offer.applications.candidates.full_name}
                              </h3>
                              <p className="text-sm text-muted-foreground truncate">
                                {offer.applications.candidates.email}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <Badge variant="secondary" className={status.color}>
                                  {status.icon}
                                  <span className="ml-1">{status.label}</span>
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Offer Details */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">Position</p>
                              <p className="text-sm font-medium text-foreground truncate">
                                {offer.position_title}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">Salary</p>
                              <p className="text-sm font-medium text-foreground">
                                {formatSalary(offer.salary_amount, offer.salary_currency, offer.salary_frequency)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">Start Date</p>
                              <p className="text-sm font-medium text-foreground">
                                {format(new Date(offer.proposed_start_date), "MMM d, yyyy")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">
                                {offer.sent_at ? "Sent" : "Created"}
                              </p>
                              <p className="text-sm font-medium text-foreground">
                                {format(
                                  new Date(offer.sent_at || offer.created_at),
                                  "MMM d, yyyy"
                                )}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 lg:ml-4">
                          {offer.status === "draft" && (
                            <Button
                              size="sm"
                              onClick={() => handleSendOffer(offer.id)}
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Send
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedOffer(offer);
                              setIsDialogOpen(true);
                            }}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* View/Edit Dialog */}
      {selectedOffer && (
        <OfferLetterDialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setSelectedOffer(null);
          }}
          applicationId={selectedOffer.application_id}
          candidateName={selectedOffer.applications.candidates.full_name}
          jobTitle={selectedOffer.applications.jobs.title}
          onSuccess={() => {
            refetch();
            setIsDialogOpen(false);
            setSelectedOffer(null);
          }}
        />
      )}
    </DashboardLayout>
  );
};

export default OfferLetters;
