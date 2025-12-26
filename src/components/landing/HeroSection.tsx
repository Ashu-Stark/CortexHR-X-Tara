import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const HeroSection = () => {
  return (
    <div className="relative pt-32 pb-20 sm:pt-40 sm:pb-24 overflow-hidden">
      {/* Abstract Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary/20 rounded-full blur-[100px] mix-blend-screen animate-blob" />
        <div className="absolute top-40 right-20 w-72 h-72 bg-accent/20 rounded-full blur-[100px] mix-blend-screen animate-blob animation-delay-2000" />
        <div className="absolute bottom-20 left-1/2 w-96 h-96 bg-emerald-glow/10 rounded-full blur-[120px] mix-blend-screen animate-blob animation-delay-4000" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-8"
        >
          <span className="flex w-2 h-2 bg-primary rounded-full mr-2 animate-pulse" />
          V2.0 is Live: AI-Powered Scheduling
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl sm:text-7xl font-display font-bold tracking-tight mb-8 text-gradient"
        >
          The Future of Hiring <br /> is <span className="text-primary">Autonomous</span>.
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-2xl mx-auto text-lg text-muted-foreground mb-10 leading-relaxed"
        >
          Replace manual screening with intelligent agents. CortexHR automates sourcing,
          interviewing, and documentation so you can focus on people, not paperwork.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4"
        >
          <Button asChild variant="hero" size="xl">
            <Link to="/careers" className="flex items-center">
              Browse Open Roles
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
          <Button asChild variant="hero-outline" size="xl">
            <Link to="/dashboard">
              HR Dashboard
            </Link>
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default HeroSection;
