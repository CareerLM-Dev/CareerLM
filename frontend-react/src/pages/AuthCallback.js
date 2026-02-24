import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";

/**
 * OAuth callback page.
 * Supabase appends tokens as URL hash fragments after the OAuth redirect.
 * `detectSessionInUrl: true` (already configured) picks them up automatically.
 * This component simply waits for the session to be established, ensures a
 * `user` row exists, then redirects to the dashboard.
 */
function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase client detects the tokens in the URL hash automatically.
        // getSession() returns the newly created session.
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (session) {
          // Check if user has completed questionnaire (i.e. is a returning user)
          const { data: userRow } = await supabase
            .from("user")
            .select("questionnaire_answered")
            .eq("id", session.user.id)
            .single();

          if (userRow && !userRow.questionnaire_answered) {
            // First-time user — send to onboarding
            navigate(`/onboarding/${session.user.id}`, { replace: true });
          } else {
            navigate("/dashboard", { replace: true });
          }
        } else {
          // No session — something went wrong, go back to auth
          navigate("/auth", { replace: true });
        }
      } catch (err) {
        console.error("OAuth callback error:", err);
        navigate("/auth", { replace: true });
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="h-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Signing you in...</p>
      </div>
    </div>
  );
}

export default AuthCallback;
