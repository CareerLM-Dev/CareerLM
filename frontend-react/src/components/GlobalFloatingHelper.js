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
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Get user profile from Supabase
        const { data: profileData, error } = await supabase
          .from("user")
          .select("questionnaire_answers, user_profile_onboarding_complete")
          .eq("id", session.user.id)
          .single();

        if (error) throw error;
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
          console.log("No workflow state yet:", err.message);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [session]);

  // Refresh workflow state on route change (user might have completed an action)
  useEffect(() => {
    const refreshWorkflowState = async () => {
      if (!session) return;

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
          console.log("[FloatingHelper] Refreshed workflow state:", workflowResponse.data.data);
        }
      } catch (err) {
        console.log("Could not refresh workflow state:", err.message);
      }
    };

    refreshWorkflowState();
  }, [location.pathname, session]);

  const getUserStatus = () => {
    console.log("[GlobalFloatingHelper] Getting user status from:", userProfile);
    const answers = userProfile?.questionnaire_answers;
    if (!answers) return "exploring";
    
    // Map from onboarding answers to status
    if (answers.career_phase?.[0] === "have_interviews") return "interview_upcoming";
    if (answers.career_phase?.[0] === "actively_applying") return "applying";
    if (answers.career_phase?.[0] === "building_skills") return "building";
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

  if (!shouldShow || loading) {
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
