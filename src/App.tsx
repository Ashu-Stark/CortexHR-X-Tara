import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Careers from "./pages/Careers";
import Dashboard from "./pages/Dashboard";
import Candidates from "./pages/Candidates";
import Chat from "./pages/Chat";
import Interviews from "./pages/Interviews";
import OfferLetters from "./pages/OfferLetters";
import EmailTemplates from "./pages/EmailTemplates";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CandidatePortal from "./pages/CandidatePortal";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/apply" element={<CandidatePortal />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/candidates" element={<Candidates />} />
          <Route path="/dashboard/chat" element={<Chat />} />
          <Route path="/dashboard/interviews" element={<Interviews />} />
          <Route path="/dashboard/offers" element={<OfferLetters />} />
          <Route path="/dashboard/templates" element={<EmailTemplates />} />
          <Route path="/dashboard/settings" element={<Settings />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
