import { useState, useEffect } from "react";
import { Sparkles, X, ChevronUp, ChevronDown, ArrowRight } from "lucide-react";

/**
 * FloatingHelper - Smart suggestion bubble for next steps
 * Shows contextual guidance based on user's workflow state
 */
function FloatingHelper({ currentPhase, supervisorDecision, userStatus, onNavigate }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastPhase, setLastPhase] = useState(null);
  const [showNewBadge, setShowNewBadge] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log("[FloatingHelper] Props:", { currentPhase, supervisorDecision, userStatus });
  }, [currentPhase, supervisorDecision, userStatus]);

  // Detect phase changes and auto-reopen helper
  useEffect(() => {
    // If phase changed and new phase is active (not idle)
    if (currentPhase && currentPhase !== lastPhase && currentPhase !== "idle") {
      console.log("[FloatingHelper] Phase changed from", lastPhase, "to", currentPhase);
      
      // Clear any previous dismissal for the old phase
      localStorage.removeItem("helper_dismissed");
      
      // Force re-show and expand
      setIsDismissed(false);
      setIsVisible(true);
      setIsExpanded(true);
      
      // Show "NEW" badge for 5 seconds
      setShowNewBadge(true);
      setTimeout(() => setShowNewBadge(false), 5000);
      
      console.log("[FloatingHelper] ✨ Re-opening helper for new phase:", currentPhase);
    }
    
    // Update tracked phase
    setLastPhase(currentPhase);
  }, [currentPhase, lastPhase]);

  // Check if user dismissed this specific phase before (only on initial mount)
  useEffect(() => {
    const dismissed = localStorage.getItem("helper_dismissed");
    if (dismissed && !lastPhase) {  // Only check on first render
      const data = JSON.parse(dismissed);
      // If same phase and dismissed less than 5 minutes ago, keep dismissed
      if (data.phase === currentPhase && Date.now() - data.timestamp < 300000) {
        setIsDismissed(true);
        setIsVisible(false);
        console.log("[FloatingHelper] Same phase dismissed recently, staying hidden");
      }
    }
  }, []);  // Run only once on mount

  // Auto-expand when there's an active workflow phase
  useEffect(() => {
    if (currentPhase && currentPhase !== "idle" && supervisorDecision && !isDismissed) {
      setIsExpanded(true);
      console.log("[FloatingHelper] Auto-expanding for phase:", currentPhase);
    }
  }, [currentPhase, supervisorDecision, isDismissed]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
    // Store dismissal in localStorage with timestamp
    localStorage.setItem("helper_dismissed", JSON.stringify({
      phase: currentPhase,
      timestamp: Date.now()
    }));
  };

  const handleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const getPhaseDetails = (phase, status) => {
    const phaseMap = {
      upload_resume: {
        title: "Upload Resume",
        action: "Upload Your Resume",
        page: "resume_optimizer",
        time: "2 min"
      },
      resume_analysis: {
        title: "Resume Analysis",
        action: "View Analysis Results",
        page: "resume_optimizer",
        time: "Complete"
      },
      fix_resume: {
        title: "Resume Improvements",
        action: "Improve Your Resume",
        page: "resume_optimizer",
        time: "10 min"
      },
      interview_prep: {
        title: "Interview Practice",
        action: "Start Mock Interview",
        page: "mock_interview",
        time: "15 min"
      },
      cold_email: {
        title: "Cold Email",
        action: "Draft Cold Email",
        page: "cold_email",
        time: "5 min"
      },
      study_plan: {
        title: "Learning Plan",
        action: "Create Study Plan",
        page: "study_planner",
        time: "Ongoing"
      },
      skill_gap_analysis: {
        title: "Career Matches",
        action: "Discover Career Paths",
        page: "skill_gap",
        time: "10 min"
      },
      role_suggestion: {
        title: "Career Discovery",
        action: "Explore Career Options",
        page: "skill_gap",
        time: "10 min"
      },
      idle: {
        title: "All Set",
        action: "Explore More Tools",
        page: "home",
        time: "Browse"
      }
    };

    // Default suggestions based on user status when no active phase
    const statusDefaults = {
      applying: {
        title: "Next Step",
        action: "Practice Interviews",
        page: "mock_interview",
        time: "15 min"
      },
      building: {
        title: "Next Step",
        action: "Analyze Skill Gaps",
        page: "skill_gap",
        time: "10 min"
      },
      interview_upcoming: {
        title: "Next Step",
        action: "Practice Mock Interview",
        page: "mock_interview",
        time: "15 min"
      },
      exploring: {
        title: "Next Step",
        action: "Discover Career Matches",
        page: "skill_gap",
        time: "10 min"
      }
    };

    return phaseMap[phase] || statusDefaults[status] || {
      title: "Next Step",
      action: "View Dashboard",
      page: "home",
      time: "Browse"
    };
  };

  const getAlternativeActions = (status) => {
    const alternatives = {
      applying: [
        { label: "Practice Interviews", page: "mock_interview" },
        { label: "Find Jobs", page: "job_matcher" },
        { label: "Draft Cold Email", page: "cold_email" }
      ],
      building: [
        { label: "Create Study Plan", page: "study_planner" },
        { label: "Analyze Skill Gaps", page: "skill_gap" },
        { label: "Find Jobs", page: "job_matcher" }
      ],
      interview_upcoming: [
        { label: "Practice Mock Interview", page: "mock_interview" },
        { label: "Improve Resume", page: "resume_optimizer" },
        { label: "Research Companies", page: "job_matcher" }
      ],
      exploring: [
        { label: "Discover Career Matches", page: "skill_gap" },
        { label: "Find Jobs", page: "job_matcher" },
        { label: "Create Learning Plan", page: "study_planner" }
      ]
    };

    return alternatives[status] || alternatives.exploring;
  };

  if (!isVisible || isDismissed) {
    return null;
  }

  const phaseDetails = getPhaseDetails(currentPhase, userStatus);
  const alternatives = getAlternativeActions(userStatus);
  
  console.log("[FloatingHelper] Displaying phase:", currentPhase);
  console.log("[FloatingHelper] Phase details:", phaseDetails);
  console.log("[FloatingHelper] User status:", userStatus);
  
  // Use default message when no active workflow
  const displayMessage = supervisorDecision || getDefaultMessage(userStatus);
  
  function getDefaultMessage(status) {
    const messages = {
      applying: "Prepare for interviews and reach out to companies",
      building: "Identify skill gaps and create a learning roadmap",
      interview_upcoming: "Practice with mock interviews to build confidence",
      exploring: "Discover career paths that match your skills"
    };
    return messages[status] || "Continue your career journey";
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm">
      {/* Collapsed bubble */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full p-4 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-110 flex items-center gap-2 group relative"
        >
          {/* New badge on collapsed state */}
          {showNewBadge && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
          )}
          {showNewBadge && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>
          )}
          <Sparkles className="w-6 h-6 animate-pulse" />
          <span className="font-medium">Next Step</span>
          <ChevronUp className="w-4 h-4 group-hover:translate-y-[-2px] transition-transform" />
        </button>
      )}

      {/* Expanded card */}
      {isExpanded && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border-2 border-blue-400 dark:border-blue-500 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4 text-white relative">
            {/* New recommendation badge */}
            {showNewBadge && (
              <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg animate-bounce">
                NEW
              </div>
            )}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 animate-pulse" />
                <h3 className="font-semibold">What's Next?</h3>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={handleExpand}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                  aria-label="Minimize"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDismiss}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Primary suggestion */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {currentPhase ? "Recommended: " : ""}{phaseDetails.title}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {displayMessage}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                      {phaseDetails.time}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  onNavigate(phaseDetails.page);
                  setIsDismissed(true);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 group"
              >
                <span>{phaseDetails.action}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-700"></div>

            {/* Alternative actions */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Or choose another path:
              </p>
              <div className="space-y-1.5">
                {alternatives.map((alt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onNavigate(alt.page);
                      setIsDismissed(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 group"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                      {alt.label}
                    </span>
                    <ArrowRight className="w-3 h-3 ml-auto text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 border-t border-gray-100 dark:border-gray-700">
              You can always access all features from the navigation
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FloatingHelper;
