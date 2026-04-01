import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";

/**
 * OAuth callback page.
 * Supabase appends tokens as URL hash fragments after the OAuth redirect.
 * `detectSessionInUrl: true` (already configured) picks them up automatically.
 *
 * This component is the SINGLE OWNER of OAuth user-row creation.
 * It runs the upsert BEFORE reading questionnaire_answered, making the
 * entire flow sequential and eliminating the race condition that existed
 * when UserContext owned the insert via a deferred setTimeout.
 *
 * Flow:
 *   1. Get session from Supabase (tokens already parsed from URL hash)
 *   2. Upsert public.user row — insert-if-not-exists, no-op if already there
 *   3. Read questionnaire_answered from the now-guaranteed row
 *   4. Route → /onboarding (new / incomplete) or /home (returning)
 */
function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (!session) {
          // No session — tokens missing or expired, send back to auth
          navigate("/auth", { replace: true });
          return;
        }

        // ── Step 1: Ensure public.user row exists ──────────────────────────
        // ignoreDuplicates: true  →  inserts only when no row with this id
        // exists yet. Returning users' rows are left completely untouched.
        const meta = session.user.user_metadata || {};
        const { error: upsertError } = await supabase.from("user").upsert(
          [
            {
              id: session.user.id,
              name:
                meta.full_name ||
                meta.name ||
                meta.preferred_username ||
                session.user.email?.split("@")[0] ||
                "User",
              email: session.user.email,
              password: null,          // OAuth users have no password (column is nullable)
              status: "student",
              current_company: null,
              questionnaire_answered: false,
              questionnaire_answers: null,
            },
          ],
          { onConflict: "id", ignoreDuplicates: true }
        );

        if (upsertError) {
          // Log but don't abort — row likely already exists
          console.error("AuthCallback upsert error:", upsertError);
        }

        // ── Step 2: Read questionnaire status ──────────────────────────────
        // The upsert above has already completed (awaited), so this read is
        // guaranteed to see the row — no race condition possible.
        const { data: userRow } = await supabase
          .from("user")
          .select("questionnaire_answered")
          .eq("id", session.user.id)
          .single();

        // ── Step 3: Route ──────────────────────────────────────────────────
        // !userRow                    → upsert failed for an unexpected reason
        // questionnaire_answered false/null → new or incomplete user
        // questionnaire_answered true       → returning user, go to home
        if (!userRow || !userRow.questionnaire_answered) {
          navigate(`/onboarding/${session.user.id}`, { replace: true });
        } else {
          navigate("/home", { replace: true });
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
