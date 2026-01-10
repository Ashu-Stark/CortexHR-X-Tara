import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="border-b border-border/50 backdrop-blur-xl fixed w-full z-50 bg-background/80">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-primary to-accent rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            Cortex<span className="text-primary">HR</span>
          </span>
        </Link>
        <div className="flex items-center space-x-6">
          <Link 
            to="/careers" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Careers
          </Link>
          <Link 
            to="/dashboard" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Admin Login
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
