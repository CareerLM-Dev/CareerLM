import { useState, useEffect, useRef } from "react";
import { Sparkles, X, ChevronUp, ChevronDown, ArrowRight, Zap } from "lucide-react";

/**
 * FloatingHelper — Track-aware Smart Suggestion Bubble
 *
 * Receives the dynamic `recommendations` object from the backend orchestrator
 * (via GlobalFloatingHelper) and renders:
 * - A primary CTA driven by recommendations.primary
 * - Alternative actions driven by recommendations.secondary
 * - Track-specific color themes (applying/building/exploring/interview_upcoming)
 *
 * Falls back to a sensible default if no recommendations are available yet.
 */

// ── Track color themes ───────────────────────────────────────────────────────
const TRACK_THEMES = {
  applying: {
    gradient: "from-blue-600 to-indigo-600",
    accent: "bg-blue-600 hover:bg-blue-700",
    badge: "bg-blue-100 text-blue-700",
    border: "border-blue-400",
    icon: "text-blue-600",
    ring: "ring-blue-200",
    label: "Applying Mode",
  },
  building: {
    gradient: "from-emerald-600 to-teal-600",
    accent: "bg-emerald-600 hover:bg-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    border: "border-emerald-400",
    icon: "text-emerald-600",
    ring: "ring-emerald-200",
    label: "Skill Building",
  },
  exploring: {
    gradient: "from-violet-600 to-purple-600",
    accent: "bg-violet-600 hover:bg-violet-700",
    badge: "bg-violet-100 text-violet-700",
    border: "border-violet-400",
    icon: "text-violet-600",
    ring: "ring-violet-200",
    label: "Exploring",
  },
  interview_upcoming: {
    gradient: "from-orange-500 to-red-600",
    accent: "bg-orange-500 hover:bg-orange-600",
    badge: "bg-orange-100 text-orange-700",
    border: "border-orange-400",
    icon: "text-orange-600",
    ring: "ring-orange-200",
    label: "Interview Prep",
  },
};

// ── Fallback recommendations when backend has no checkpoint yet ───────────────
const FALLBACK_RECOMMENDATIONS = {
  applying: {
    primary: {
      action_id: "resume_optimizer",
      label: "Upload & Score Your Resume",
      description: "Start by getting your baseline ATS score. We'll tailor it to specific jobs from there.",
      page: "resume_optimizer",
      estimated_time: "2 min",
    },
    secondary: [
      { action_id: "cold_email", label: "Draft Cold Email", page: "cold_email" },
      { action_id: "mock_interview", label: "Practice Interview", page: "mock_interview" },
    ],
    reasoning: "Let's get your resume on file first so we can start tailoring it to jobs.",
  },
  building: {
    primary: {
      label: "Analyze Skill Gaps",
      description: "Find out which skills are holding you back from your target role.",
      page: "skill_gap",
      estimated_time: "10 min",
    },
    secondary: [
      { label: "Create Study Plan", page: "study_planner" },
      { label: "Review Resume", page: "resume_optimizer" },
    ],
    reasoning: "Identifying your gaps is the first step to building a targeted learning plan.",
  },
  exploring: {
    primary: {
      label: "Discover Career Matches",
      description: "See which roles your skills are most aligned with right now.",
      page: "skill_gap",
      estimated_time: "10 min",
    },
    secondary: [
      { label: "Upload Resume", page: "resume_optimizer" },
      { label: "Create Study Plan", page: "study_planner" },
    ],
    reasoning: "Explore which career paths match your current skillset.",
  },
  interview_upcoming: {
    primary: {
      label: "Start Mock Interview",
      description: "Practice with AI-generated questions tailored to your role. Repetition builds confidence.",
      page: "mock_interview",
      estimated_time: "15 min",
    },
    secondary: [
      { label: "Improve Resume", page: "resume_optimizer" },
      { label: "Review Key Topics", page: "study_planner" },
    ],
    reasoning: "Your interview is coming up — mock practice is the highest-leverage activity right now.",
  },
};


function FloatingHelper({ recommendations, userStatus, onNavigate }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showNewBadge, setShowNewBadge] = useState(false);
  const lastRecsRef = useRef(null);
  const hasCheckedDismissal = useRef(false);

  const track = userStatus || "exploring";
  const theme = TRACK_THEMES[track] || TRACK_THEMES.exploring;

  // Resolve what to display — backend recommendations take priority over fallbacks
  const activeRecs = recommendations || FALLBACK_RECOMMENDATIONS[track];
  const primary = activeRecs?.primary;
  const secondary = activeRecs?.secondary || [];
  const reasoning = activeRecs?.reasoning || "";

  // ── Check initial dismissal in localStorage ───────────────────────────────
  useEffect(() => {
    if (hasCheckedDismissal.current) return;
    hasCheckedDismissal.current = true;
    const dismissed = localStorage.getItem("helper_dismissed");
    if (dismissed) {
      try {
        const { track: dismissedTrack, timestamp } = JSON.parse(dismissed);
        // Stay dismissed if same track and dismissed within last 5 min
        if (dismissedTrack === track && Date.now() - timestamp < 300_000) {
          setIsDismissed(true);
        }
      } catch (_) {}
    }
  }, [track]);

  // ── Re-open when recommendations change (new data from backend) ───────────
  useEffect(() => {
    if (!recommendations) return;
    const recsKey = JSON.stringify(recommendations?.primary?.action_id);
    if (lastRecsRef.current !== null && lastRecsRef.current !== recsKey) {
      // New recommendations from backend — clear dismissal and expand
      localStorage.removeItem("helper_dismissed");
      setIsDismissed(false);
      setIsExpanded(true);
      setShowNewBadge(true);
      setTimeout(() => setShowNewBadge(false), 5_000);
    }
    lastRecsRef.current = recsKey;
  }, [recommendations]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsExpanded(false);
    localStorage.setItem("helper_dismissed", JSON.stringify({
      track,
      timestamp: Date.now(),
    }));
  };

  const handleAction = (page) => {
    onNavigate(page);
    setIsDismissed(true);
  };

  if (isDismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm">

      {/* ── Collapsed bubble ─────────────────────────────────────────────── */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className={`
            bg-gradient-to-r ${theme.gradient} text-white rounded-full px-5 py-3
            shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105
            flex items-center gap-2 group relative
          `}
        >
          {showNewBadge && (
            <>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full" />
            </>
          )}
          <Sparkles className="w-4 h-4 animate-pulse" />
          <span className="text-sm font-semibold">Next Step</span>
          <ChevronUp className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
        </button>
      )}

      {/* ── Expanded card ────────────────────────────────────────────────── */}
      {isExpanded && (
        <div className={`
          bg-white rounded-2xl shadow-2xl border-2 ${theme.border} overflow-hidden
          animate-in slide-in-from-bottom-4 duration-300
        `}>

          {/* Header */}
          <div className={`bg-gradient-to-r ${theme.gradient} px-4 py-3 text-white relative`}>
            {showNewBadge && (
              <div className="absolute -top-2 -right-2 bg-green-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg animate-bounce">
                NEW
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <div>
                  <h3 className="font-semibold text-sm">What's Next?</h3>
                  <p className="text-white/70 text-xs">{theme.label}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Minimize"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDismiss}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">

            {/* Primary recommendation */}
            {primary && (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className={`w-3.5 h-3.5 ${theme.icon}`} />
                    <span className={`text-xs font-bold uppercase tracking-wide ${theme.icon}`}>
                      Recommended
                    </span>
                    {primary.estimated_time && (
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${theme.badge}`}>
                        {primary.estimated_time}
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold text-gray-900 text-sm">{primary.label}</h4>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{reasoning || primary.description}</p>
                </div>

                <button
                  onClick={() => handleAction(primary.page)}
                  className={`
                    w-full ${theme.accent} text-white font-semibold text-sm py-2.5 px-4
                    rounded-xl transition-all flex items-center justify-center gap-2 group
                    shadow-sm hover:shadow-md
                  `}
                >
                  <span>{primary.label}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}

            {/* Divider */}
            {secondary.length > 0 && (
              <div className="border-t border-gray-100" />
            )}

            {/* Secondary actions */}
            {secondary.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Or explore:
                </p>
                {secondary.map((alt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAction(alt.page)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2 group"
                  >
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1">
                      {alt.label}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            )}

            {/* Footer */}
            <p className="text-xs text-gray-400 text-center pt-1 border-t border-gray-100">
              All tools are always available from the nav
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default FloatingHelper;
