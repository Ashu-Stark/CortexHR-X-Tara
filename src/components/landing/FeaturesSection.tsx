import { Sparkles, Clock, Shield } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: Sparkles,
    title: "AI Resume Screening",
    description: "Instantly parse and score thousands of resumes. Our agents identify top talent based on skills, not keywords.",
    color: "primary",
  },
  {
    icon: Clock,
    title: "Smart Scheduling",
    description: "Autonomous agents negotiate interview slots with candidates, syncing directly with your Google or Outlook calendar.",
    color: "accent",
  },
  {
    icon: Shield,
    title: "Automated Offers",
    description: "Generate compliant offer letters and contracts with one click. Secure, fast, and error-free execution.",
    color: "emerald",
  },
];

const FeaturesSection = () => {
  const getColorClasses = (color: string) => {
    switch (color) {
      case "primary":
        return {
          bg: "bg-primary/10",
          hoverBg: "group-hover:bg-primary/20",
          border: "hover:border-primary/30",
          icon: "text-primary",
        };
      case "accent":
        return {
          bg: "bg-accent/10",
          hoverBg: "group-hover:bg-accent/20",
          border: "hover:border-accent/30",
          icon: "text-accent",
        };
      case "emerald":
        return {
          bg: "bg-emerald-500/10",
          hoverBg: "group-hover:bg-emerald-500/20",
          border: "hover:border-emerald-500/30",
          icon: "text-emerald-500",
        };
      default:
        return {
          bg: "bg-primary/10",
          hoverBg: "group-hover:bg-primary/20",
          border: "hover:border-primary/30",
          icon: "text-primary",
        };
    }
  };

  return (
    <section className="py-24 bg-secondary/30 border-t border-border/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const colors = getColorClasses(feature.color);
            const Icon = feature.icon;
            
            return (
              <motion.div 
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className={`p-8 rounded-2xl bg-card border border-border/50 ${colors.border} transition-all duration-300 group cursor-default hover:shadow-lg hover:shadow-primary/5`}
              >
                <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center mb-6 ${colors.hoverBg} transition-colors`}>
                  <Icon className={`w-6 h-6 ${colors.icon}`} />
                </div>
                <h3 className="text-xl font-display font-semibold mb-3 text-foreground">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
