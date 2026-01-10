import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isHrStaff: boolean;
}

export const useAuth = (requireAuth: boolean = true) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isHrStaff: false,
  });
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const checkHrRole = async (userId: string) => {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      return !!roleData;
    };

    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        
        // Synchronous state update only
        setAuthState(prev => ({
          ...prev,
          user: session?.user ?? null,
          session,
        }));

        // Defer role check with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(async () => {
            if (!mounted) return;
            const isHrStaff = await checkHrRole(session.user.id);
            if (!mounted) return;
            
            setAuthState(prev => ({
              ...prev,
              isHrStaff,
              loading: false,
            }));

            if (requireAuth && !isHrStaff) {
              await supabase.auth.signOut();
              navigate("/login");
            }
          }, 0);
        } else {
          setAuthState(prev => ({
            ...prev,
            isHrStaff: false,
            loading: false,
          }));
          
          if (requireAuth && event === "SIGNED_OUT") {
            navigate("/login");
          }
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      
      if (!session?.user) {
        setAuthState({ user: null, session: null, loading: false, isHrStaff: false });
        if (requireAuth) {
          navigate("/login");
        }
        return;
      }

      const isHrStaff = await checkHrRole(session.user.id);
      if (!mounted) return;

      if (requireAuth && !isHrStaff) {
        await supabase.auth.signOut();
        navigate("/login");
        return;
      }

      setAuthState({
        user: session.user,
        session,
        loading: false,
        isHrStaff,
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, requireAuth]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return { ...authState, signOut };
};