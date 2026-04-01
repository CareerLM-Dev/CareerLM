import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { supabase } from "../api/supabaseClient";
import axios from "axios";
import FloatingHelper from "./FloatingHelper";

/**
 * GlobalFloatingHelper - Wraps FloatingHelper with global state management
 * Shows on all authenticated pages, tracks workflow state
 */
function GlobalFloatingHelper() {
  const { session, isAuthenticated } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [userProfile, setUserProfile] = useState(null);
  const [workflowState, setWorkflowState] = useState(null);
  const [loading, setLoading] = useState(true);

  // Don't show on public routes, auth pages, or onboarding
  const publicRoutes = ["/", "/auth", "/auth/callback"];
  const isOnboardingPage = location.pathname.startsWith("/onboarding/") || 
                          location.pathname.startsWith("/skip-complete/");
  const shouldShow = isAuthenticated && 
                    !publicRoutes.includes(location.pathname) && 
                    !isOnboardingPage;

  // Fetch user profile and workflow state
  useEffect(() => {
    const fetchUserData = async () => {
      if (!session) {
        console.log("[FloatingHelper] No session found");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log("[FloatingHelper] Fetching user profile for:", session.user.id);

        // Get user profile from Supabase
        const { data: profileData, error } = await supabase
          .from("user")
          .select("questionnaire_answers, questionnaire_answered")
          .eq("id", session.user.id)
          .single();

        if (error) {
          console.error("[FloatingHelper] Error fetching profile:", error);
          throw error;
        }
        
        console.log("[FloatingHelper] Profile data fetched:", profileData);
        setUserProfile(profileData);

        // Get workflow state from orchestrator
        try {
          const workflowResponse = await axios.get(
            "http://localhost:8000/api/v1/orchestrator/state",
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            }
          );

          if (workflowResponse.data.success) {
            setWorkflowState(workflowResponse.data.data);
            console.log("[FloatingHelper] Workflow state:", workflowResponse.data.data);
          }
        } catch (err) {
          console.log("[FloatingHelper] No workflow state yet:", err.message);
        }
      } catch (error) {
        console.error("[FloatingHelper] Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [session]);

  // Refresh user profile and workflow state on route change (user might have completed an action)
  useEffect(() => {
    const refreshData = async () => {
      if (!session) return;

      try {
        console.log("[FloatingHelper] Refreshing data on route change:", location.pathname);
        
        // Refresh user profile (to get latest questionnaire answers)
        const { data: profileData, error: profileError } = await supabase
          .from("user")
          .select("questionnaire_answers")
          .eq("id", session.user.id)
          .single();

        if (profileError) {
          console.error("[FloatingHelper] Error refreshing profile:", profileError);
        } else if (profileData) {
          setUserProfile(profileData);
          console.log("[FloatingHelper] Refreshed user profile:", profileData);
        } else {
          console.warn("[FloatingHelper] No profile data returned");
        }

        // Refresh workflow state
        const workflowResponse = await axios.get(
          "http://localhost:8000/api/v1/orchestrator/state",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (workflowResponse.data.success) {
          setWorkflowState(workflowResponse.data.data);
          console.log("[FloatingHelper] Refreshed workflow state:", workflowResponse.data.data);
        }
      } catch (err) {
        console.log("[FloatingHelper] Could not refresh data:", err.message);
      }
    };

    refreshData();
  }, [location.pathname, session]);

  const getUserStatus = () => {
    console.log("[GlobalFloatingHelper] Getting user status from:", userProfile);
    const answers = userProfile?.questionnaire_answers;
    console.log("[GlobalFloatingHelper] Questionnaire answers:", answers);
    console.log("[GlobalFloatingHelper] Status value:", answers?.status);
    
    if (!answers) {
      console.log("[GlobalFloatingHelper] No answers found, defaulting to exploring");
      return "exploring";
    }
    
    // Map from onboarding answers to status
    if (answers.status === "interview_upcoming") {
      console.log("[GlobalFloatingHelper] Status matched: interview_upcoming");
      return "interview_upcoming";
    }
    if (answers.status === "applying") {
      console.log("[GlobalFloatingHelper] Status matched: applying");
      return "applying";
    }
    if (answers.status === "building") {
      console.log("[GlobalFloatingHelper] Status matched: building");
      return "building";
    }
    
    console.log("[GlobalFloatingHelper] No status match, defaulting to exploring");
    return "exploring";
  };

  const handleNavigate = (page) => {
    // If it's a dashboard sub-page, navigate with state
    if (["resume_optimizer", "skill_gap", "mock_interview", "cold_email", "study_planner", "job_matcher", "history"].includes(page)) {
      navigate("/dashboard", { state: { initialPage: page } });
    } else {
      // Otherwise navigate to the route directly
      navigate(`/${page}`);
    }
  };

  // Don't show if on wrong page, still loading, or no profile data yet
  if (!shouldShow || loading || !userProfile) {
    console.log("[FloatingHelper] Not showing:", { shouldShow, loading, hasProfile: !!userProfile });
    return null;
  }

  const status = getUserStatus();
  const currentPhaseValue = workflowState?.current_phase;
  const supervisorDecisionValue = workflowState?.supervisor_decision;
  
  console.log("[GlobalFloatingHelper] Rendering with:", {
    currentPhase: currentPhaseValue,
    supervisorDecision: supervisorDecisionValue,
    userStatus: status
  });

  return (
    <FloatingHelper
      currentPhase={currentPhaseValue}
      supervisorDecision={supervisorDecisionValue}
      userStatus={status}
      onNavigate={handleNavigate}
    />
  );
}

export default GlobalFloatingHelper;
