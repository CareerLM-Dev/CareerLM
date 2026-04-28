// src/components/StudyPlanner.js
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../api/supabaseClient";
import { generateQuickPlan as apiGenerateQuickPlan } from "../api/supabaseClient";
import { Button } from "./ui/button";
import GoogleCalendarSync from "./GoogleCalendarSync";
import NativeCalendar, { buildStandardDayEntries } from "./NativeCalendar";
import {
  BookOpen,
  ExternalLink,
  FileText,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Star,
  TrendingUp,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Layers,
  Map as MapIcon,
  Clock,
  CalendarDays,
  X,
  Zap,
  Calendar as CalIcon,
  Trash2,
  AlertTriangle,
} from "lucide-react";

function StudyPlanner({ resumeData }) {
  const [allPlans, setAllPlans] = useState({});
  const [activeCareer, setActiveCareer] = useState(null);
  const [expandedSkills, setExpandedSkills] = useState({});

  const [suggestedRoles, setSuggestedRoles] = useState([]);
  const [interestedRoles, setInterestedRoles] = useState([]);

  // Tech stack state
  const [detectedStacks, setDetectedStacks] = useState([]);
  const [availableStacks, setAvailableStacks] = useState([]);
  const [activeStack, setActiveStack] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingCache, setLoadingCache] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [error, setError] = useState(null);
  const [showNewPathPicker, setShowNewPathPicker] = useState(false);
  const [selectedNewRole, setSelectedNewRole] = useState(null);
  const [deletingCareer, setDeletingCareer] = useState(null);

  // ── Quick Plan state ──
  const [activePlanType, setActivePlanType] = useState({});
  const [allQuickPlans, setAllQuickPlans] = useState({});
  // Quick Prep form is now a standalone top-level card, not tied to a career path
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [quickGoal, setQuickGoal] = useState("");
  const [quickRequirements, setQuickRequirements] = useState("");
  const [quickDeadline, setQuickDeadline] = useState("");
  const [quickTargetCareer, setQuickTargetCareer] = useState(""); // free-text or from dropdown
  const [quickTopic, setQuickTopic] = useState("");
  const [quickSubtopic, setQuickSubtopic] = useState("");
  const [preferredResourceType, setPreferredResourceType] = useState("mixed");
  const [enableExternalContext, setEnableExternalContext] = useState(false);
  const [enableFeedbackSignals, setEnableFeedbackSignals] = useState(false);
  const [generatingQuick, setGeneratingQuick] = useState(false);
  const [quickError, setQuickError] = useState(null);
  const [activeQuickPlan, setActiveQuickPlan] = useState(null); // currently displayed quick plan
  // Calendar is always visible on right column
  const [calendarPlanType, setCalendarPlanType] = useState("standard"); // 'standard' | 'quick_prep'

  const getAuthToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }, []);

  // Load ALL cached plans on mount (standard + quick_prep)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          setLoadingCache(false);
          return;
        }
        const res = await fetch(
          "http://localhost:8000/api/v1/orchestrator/study-materials-cache",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.cached && data.plans?.length > 0) {
          const standardPlans = {};
          const quickPlans = {};
          for (const p of data.plans) {
            if (p.plan_type === "quick_prep") {
              quickPlans[p.target_career] = {
                quick_plan_days: p.quick_plan_days || [],
                goal_description: p.goal_description,
                deadline: p.deadline,
                cached_at: p.cached_at,
              };
            } else {
              standardPlans[p.target_career] = {
                skill_gap_report: p.skill_gap_report,
                study_plan: p.study_plan,
                schedule_summary: p.schedule_summary || null,
                cached_at: p.cached_at,
              };
            }
          }
          setAllPlans(standardPlans);
          setAllQuickPlans(quickPlans);
          const firstCareer =
            data.plans.find((p) => p.plan_type === "standard")?.target_career ||
            data.plans[0].target_career;
          setActiveCareer(firstCareer);
          setExpandedSkills({ 0: true });
        }
      } catch (err) {
        console.warn("Could not load cached study materials:", err);
      } finally {
        if (!cancelled) setLoadingCache(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAuthToken]);

  // Fetch suggested roles (re-runs when activeStack changes)
  const fetchSuggestedRoles = useCallback(
    async (stackOverride) => {
      try {
        setLoadingRoles(true);
        const token = await getAuthToken();
        if (!token) {
          setLoadingRoles(false);
          return;
        }
        const stackParam =
          stackOverride !== undefined ? stackOverride : activeStack;
        const url = new URL(
          "http://localhost:8000/api/v1/orchestrator/suggested-roles",
        );
        if (stackParam) url.searchParams.set("stack", stackParam);
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setSuggestedRoles(data.suggested_roles || []);
          setInterestedRoles(data.interested_roles || []);
          if (data.detected_stacks) setDetectedStacks(data.detected_stacks);
          if (data.available_stacks) setAvailableStacks(data.available_stacks);
          if (data.active_stack && activeStack === null)
            setActiveStack(data.active_stack);
        }
      } catch (err) {
        console.warn("Could not load suggested roles:", err);
      } finally {
        setLoadingRoles(false);
      }
    },
    [activeStack, getAuthToken],
  );

  // Load suggested roles on mount
  useEffect(() => {
    fetchSuggestedRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Career metadata lookup
  const skillGapCareers = useMemo(() => {
    const analysis = resumeData?.careerAnalysis;
    if (!analysis) return [];

    const candidates =
      Array.isArray(analysis.career_matches) &&
      analysis.career_matches.length > 0
        ? analysis.career_matches
        : Array.isArray(analysis.top_3_careers)
          ? analysis.top_3_careers
          : [];

    return candidates.filter(
      (career) => career?.career && Array.isArray(career?.missing_skills),
    );
  }, [resumeData]);

  const availableCareerOptions = useMemo(() => {
    const merged = new Map();

    skillGapCareers.forEach((career, index) => {
      merged.set(career.career, {
        ...career,
        boosted_score: career.probability || 0,
        base_score: career.probability || 0,
        is_interested: false,
        source: "skill_gap",
        sort_rank: index,
      });
    });

    suggestedRoles.forEach((role, index) => {
      const existing = merged.get(role.career);
      merged.set(role.career, {
        ...(existing || {}),
        ...role,
        missing_skills:
          role.missing_skills?.length > 0
            ? role.missing_skills
            : existing?.missing_skills || [],
        missing_skills_metadata:
          existing?.missing_skills_metadata || role.missing_skills_metadata,
        source: existing ? "skill_gap+suggested" : "suggested",
        sort_rank: existing?.sort_rank ?? skillGapCareers.length + index,
      });
    });

    return Array.from(merged.values()).sort((left, right) => {
      const rightScore = right.boosted_score ?? right.probability ?? 0;
      const leftScore = left.boosted_score ?? left.probability ?? 0;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return (left.sort_rank ?? 0) - (right.sort_rank ?? 0);
    });
  }, [skillGapCareers, suggestedRoles]);

  const getCareerMeta = useCallback(
    (careerName) => {
      const found = availableCareerOptions.find((c) => c.career === careerName);
      if (found?.missing_skills?.length > 0) return found;
      return null;
    },
    [availableCareerOptions],
  );

  // Generate study plan for a career
  const generateForCareer = useCallback(
    async (careerName) => {
      const meta = getCareerMeta(careerName);
      if (!meta || !meta.missing_skills?.length) {
        setError(
          `No skill gaps found for "${careerName}". Analyze your resume first.`,
        );
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const token = await getAuthToken();
        const formData = new FormData();
        formData.append("target_career", careerName);
        formData.append(
          "missing_skills",
          JSON.stringify(meta.missing_skills.slice(0, 7)),
        );
        const headers = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const response = await fetch(
          "http://localhost:8000/api/v1/orchestrator/generate-study-materials-simple",
          { method: "POST", body: formData, headers },
        );
        const data = await response.json();
        if (data.success) {
          setAllPlans((prev) => ({
            ...prev,
            [careerName]: {
              skill_gap_report: data.skill_gap_report,
              study_plan: data.study_plan,
              schedule_summary: data.schedule_summary || null,
              cached_at: new Date().toISOString(),
            },
          }));
          setActiveCareer(careerName);
          setExpandedSkills({ 0: true });
          setShowNewPathPicker(false);
          setSelectedNewRole(null);
        } else {
          setError(data.error || "Failed to generate study materials");
        }
      } catch (err) {
        console.error("Error generating study materials:", err);
        setError("Error generating study materials. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [getCareerMeta, getAuthToken],
  );

  const deleteCareerPlan = useCallback(
    async (careerName, event) => {
      event.stopPropagation();
      if (!careerName) return;

      setDeletingCareer(careerName);
      setError(null);

      try {
        const token = await getAuthToken();
        if (!token) {
          throw new Error("Please login again to delete this plan.");
        }

        const response = await fetch(
          `http://localhost:8000/api/v1/orchestrator/study-materials-cache/${encodeURIComponent(careerName)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to delete study plan");
        }

        setAllPlans((prev) => {
          const next = { ...prev };
          delete next[careerName];
          return next;
        });

        setActiveCareer((prev) => {
          if (prev !== careerName) return prev;
          const remaining = Object.keys(allPlans).filter(
            (c) => c !== careerName,
          );
          return remaining.length > 0 ? remaining[0] : null;
        });
      } catch (err) {
        console.error("Error deleting study plan:", err);
        setError(err.message || "Failed to delete study plan");
      } finally {
        setDeletingCareer(null);
      }
    },
    [allPlans, getAuthToken],
  );

  // ── Generate a Quick Prep plan (standalone, not tied to a career) ──
  const generateQuickPlanForCareer = useCallback(async () => {
    const targetCareer = quickTargetCareer.trim() || activeCareer || "General";
    if (!quickGoal.trim() || !quickDeadline) return;
    const today = new Date();
    const deadline = new Date(quickDeadline);
    const deadlineDays = Math.ceil((deadline - today) / 86400000);
    if (deadlineDays < 1 || deadlineDays > 31) {
      setQuickError("Deadline must be 1–31 days from today.");
      return;
    }
    setGeneratingQuick(true);
    setQuickError(null);
    try {
      const token = await getAuthToken();
      const data = await apiGenerateQuickPlan(token, {
        targetCareer,
        quickGoal: quickGoal.trim(),
        deadlineDays,
        specificRequirements: quickRequirements,
        quickTopic: quickTopic.trim(),
        quickSubtopic: quickSubtopic.trim(),
        preferredResourceType,
        enableExternalContext,
        enableFeedbackSignals,
      });
      if (!data.success)
        throw new Error(data.error || "Failed to generate quick plan");
      const newPlan = {
        quick_plan_days: data.quick_plan_days || [],
        goal_description: data.quick_goal,
        deadline: data.deadline,
        detected_skills: data.detected_skills || [],
        cached_at: new Date().toISOString(),
      };
      setAllQuickPlans((prev) => ({ ...prev, [targetCareer]: newPlan }));
      setActiveQuickPlan(newPlan);
      setCalendarPlanType("quick_prep");
      setShowQuickForm(false);
    } catch (err) {
      setQuickError(err.message || "Failed to generate quick plan");
    } finally {
      setGeneratingQuick(false);
    }
  }, [
    activeCareer,
    quickGoal,
    quickDeadline,
    quickRequirements,
    quickTargetCareer,
    quickTopic,
    quickSubtopic,
    preferredResourceType,
    enableExternalContext,
    enableFeedbackSignals,
    getAuthToken,
  ]);

  const cancelQuickPlan = useCallback(() => {
    setActiveQuickPlan(null);
    setCalendarPlanType("standard");
    setQuickGoal("");
    setQuickRequirements("");
    setQuickDeadline("");
    setQuickTargetCareer("");
    setQuickTopic("");
    setQuickSubtopic("");
    setPreferredResourceType("mixed");
    setEnableExternalContext(false);
    setEnableFeedbackSignals(false);
  }, []);

  // When a quick plan loads from cache, make the most recent one active
  useEffect(() => {
    const keys = Object.keys(allQuickPlans);
    if (keys.length > 0 && !activeQuickPlan) {
      const first = allQuickPlans[keys[0]];
      setActiveQuickPlan(first);
    }
  }, [allQuickPlans]); // eslint-disable-line

  const toggleSkill = (idx) =>
    setExpandedSkills((p) => ({ ...p, [idx]: !p[idx] }));
  const expandAll = () => {
    const plan = allPlans[activeCareer];
    if (!plan) return;
    const all = {};
    plan.skill_gap_report?.forEach((_, i) => {
      all[i] = true;
    });
    setExpandedSkills(all);
  };
  const collapseAll = () => setExpandedSkills({});

  // Handle tech-stack change — re-fetch roles with new filter
  const handleStackChange = useCallback(
    (newStack) => {
      const next = newStack === activeStack ? null : newStack; // toggle off if same
      setActiveStack(next);
      fetchSuggestedRoles(next || "");
    },
    [activeStack, fetchSuggestedRoles],
  );

  // Stack selector component (reused in both empty & main views)
  const StackSelector = () => {
    if (availableStacks.length === 0 && detectedStacks.length === 0)
      return null;
    const stacks =
      availableStacks.length > 0
        ? availableStacks
        : detectedStacks.map((d) => d.stack);
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Your Tech Stack</h3>
          {detectedStacks.length > 0 && activeStack && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-auto">
              Auto-detected from resume
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {stacks.map((s) => {
            const isActive = activeStack === s;
            const isDetected = detectedStacks.some((d) => d.stack === s);
            return (
              <button
                key={s}
                onClick={() => handleStackChange(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : isDetected
                      ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {s}
              </button>
            );
          })}
          {activeStack && (
            <button
              onClick={() => handleStackChange(activeStack)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-border text-muted-foreground hover:text-foreground transition-all"
            >
              Show All
            </button>
          )}
        </div>
      </div>
    );
  };

  // Show interested roles first, then remaining suggested roles
  const availableNewRoles = useMemo(() => {
    const remaining = availableCareerOptions.filter(
      (r) => !allPlans[r.career] && r.missing_skills?.length > 0,
    );
    const interested = remaining.filter((r) => r.is_interested);
    const others = remaining.filter((r) => !r.is_interested);
    return [...interested, ...others];
  }, [availableCareerOptions, allPlans]);

  const careerNames = Object.keys(allPlans);

  // Style helpers
  const getStepIcon = (type) => {
    switch (type) {
      case "Documentation":
        return <FileText className="w-4 h-4" />;
      case "YouTube":
        return <BookOpen className="w-4 h-4" />;
      case "Course":
        return <GraduationCap className="w-4 h-4" />;
      default:
        return <BookOpen className="w-4 h-4" />;
    }
  };
  const getTypeBadgeColor = (type) => {
    switch (type) {
      case "Documentation":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "YouTube":
        return "bg-red-500/10 text-red-600 border-red-500/20";
      case "Course":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  // ── RENDER: loading cache ──
  if (loadingCache) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Loading Study Plans...</h2>
          <p className="text-muted-foreground">
            Checking for saved learning paths
          </p>
        </div>
      </div>
    );
  }

  // ── RENDER: no plans yet ──
  if (careerNames.length === 0 && !loading) {
    const hasRoles = availableCareerOptions.length > 0;
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Tech Stack Selector */}
        <StackSelector />

        {(hasRoles || loadingRoles) && (
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Choose a Career Path</h3>
              {interestedRoles.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-auto">
                  Roles you picked during onboarding are boosted
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Select a role below, then generate a personalized study plan. You
              can add more paths later.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableCareerOptions.map((role) => (
                <button
                  key={role.career}
                  onClick={() => setSelectedNewRole(role.career)}
                  className={`relative flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                    selectedNewRole === role.career
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border hover:border-primary/40 hover:bg-muted/50"
                  }`}
                >
                  {role.is_interested && (
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 absolute top-2 right-2" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {role.career}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, role.boosted_score)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {Math.round(
                          role.boosted_score ?? role.probability ?? 0,
                        )}
                        % match
                      </span>
                    </div>
                    {role.missing_skills?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {role.missing_skills.length} skills to learn
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {selectedNewRole && (
              <div className="mt-4 flex justify-center">
                <Button
                  onClick={() => generateForCareer(selectedNewRole)}
                  disabled={loading}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Study Plan for {selectedNewRole}
                </Button>
              </div>
            )}
          </div>
        )}
        {!hasRoles && !loadingRoles && (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">No Study Plan Available</h2>
            <p className="text-muted-foreground mb-2">
              Run Skill Gap Analyzer or upload your resume in Resume Optimizer
              to identify career-specific skill gaps first.
            </p>
          </div>
        )}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ── RENDER: generating (no plans yet) ──
  if (loading && careerNames.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">
            Generating Study Materials...
          </h2>
          <p className="text-muted-foreground mb-2">
            Searching for the best learning resources...
          </p>
          <p className="text-sm text-muted-foreground/70">
            This may take 5-10 seconds
          </p>
        </div>
      </div>
    );
  }

  // ── RENDER: main view ──
  const activePlan = allPlans[activeCareer];
  const skillReport = activePlan?.skill_gap_report || [];
  const totalResources = skillReport.reduce(
    (s, sk) => s + (sk.learning_path?.length || 0),
    0,
  );

  // Calendar entries for the right-column
  const calendarDayEntries =
    calendarPlanType === "quick_prep" && activeQuickPlan
      ? activeQuickPlan.quick_plan_days
      : buildStandardDayEntries(
          activePlan?.skill_gap_report,
          activePlan?.schedule_summary,
        );

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 space-y-6">
      {/* Tech Stack Selector */}
      <StackSelector />

      {/* ── Quick Prep Hero Banner (standalone, top-level) ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-orange-400/5 to-transparent border border-amber-400/30 rounded-2xl p-5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(251,191,36,0.08),transparent)] pointer-events-none" />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-bold text-base text-foreground">
                ⚡ Quick Prep Plan
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeQuickPlan
                  ? `Active: "${activeQuickPlan.goal_description}" · Deadline ${new Date(activeQuickPlan.deadline).toLocaleDateString()}`
                  : "Nail your next interview or exam with a focused day-by-day study plan. Up to 31 days."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {activeQuickPlan && (
              <button
                onClick={() => {
                  setCalendarPlanType((p) =>
                    p === "quick_prep" ? "standard" : "quick_prep",
                  );
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  calendarPlanType === "quick_prep"
                    ? "bg-amber-500 text-white border-amber-500"
                    : "border-amber-400/40 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                }`}
              >
                <CalIcon className="w-3 h-3" />
                {calendarPlanType === "quick_prep"
                  ? "Showing in Calendar"
                  : "Show in Calendar"}
              </button>
            )}
            {activeQuickPlan && (
              <button
                onClick={cancelQuickPlan}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-destructive/30 text-xs text-destructive hover:bg-destructive/5 transition-all"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
            <button
              onClick={() => {
                setShowQuickForm((p) => !p);
                setQuickError(null);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-sm shadow-amber-500/25 transition-all"
            >
              <Zap className="w-3.5 h-3.5" />
              {activeQuickPlan ? "New Plan" : "Generate Plan"}
            </button>
          </div>
        </div>

        {/* Quick Prep detected skills pills */}
        {activeQuickPlan?.detected_skills?.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
              Skills:
            </span>
            {activeQuickPlan.detected_skills.map((s, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-400/20"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Quick Plan Form (inline expand) */}
        <AnimatePresence>
          {showQuickForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-amber-400/20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium mb-1">
                    Your goal <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={quickGoal}
                    onChange={(e) => setQuickGoal(e.target.value)}
                    placeholder='e.g. "System design interview next week"'
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Career / Topic
                  </label>
                  <input
                    type="text"
                    value={quickTargetCareer}
                    onChange={(e) => setQuickTargetCareer(e.target.value)}
                    placeholder={activeCareer || "e.g. Software Engineer"}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Quick topic
                  </label>
                  <input
                    type="text"
                    value={quickTopic}
                    onChange={(e) => setQuickTopic(e.target.value)}
                    placeholder="e.g. System Design"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Deadline <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="date"
                    value={quickDeadline}
                    min={
                      new Date(Date.now() + 86400000)
                        .toISOString()
                        .split("T")[0]
                    }
                    max={
                      new Date(Date.now() + 31 * 86400000)
                        .toISOString()
                        .split("T")[0]
                    }
                    onChange={(e) => setQuickDeadline(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Quick subtopic
                  </label>
                  <input
                    type="text"
                    value={quickSubtopic}
                    onChange={(e) => setQuickSubtopic(e.target.value)}
                    placeholder="e.g. Caching and load balancing"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Preferred resource type
                  </label>
                  <select
                    value={preferredResourceType}
                    onChange={(e) => setPreferredResourceType(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  >
                    <option value="mixed">Mixed</option>
                    <option value="video">Video</option>
                    <option value="articles">Articles</option>
                    <option value="docs">Docs</option>
                    <option value="practice">Practice</option>
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-xs font-medium mb-1">
                    Specific requirements (optional)
                  </label>
                  <textarea
                    value={quickRequirements}
                    onChange={(e) => setQuickRequirements(e.target.value)}
                    rows={2}
                    placeholder="e.g. Focus on React hooks and system design patterns"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-start gap-2 p-2 rounded-lg border border-border bg-background/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableExternalContext}
                      onChange={(e) =>
                        setEnableExternalContext(e.target.checked)
                      }
                      className="mt-0.5"
                    />
                    <span className="text-xs text-muted-foreground">
                      Enable external context (profile/onboarding signals)
                    </span>
                  </label>
                  <label className="flex items-start gap-2 p-2 rounded-lg border border-border bg-background/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableFeedbackSignals}
                      onChange={(e) =>
                        setEnableFeedbackSignals(e.target.checked)
                      }
                      className="mt-0.5"
                    />
                    <span className="text-xs text-muted-foreground">
                      Enable feedback signals (historical quick prep feedback)
                    </span>
                  </label>
                </div>
                {quickError && (
                  <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 text-destructive text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {quickError}
                  </div>
                )}
                <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
                  <Button
                    onClick={generateQuickPlanForCareer}
                    disabled={
                      generatingQuick || !quickGoal.trim() || !quickDeadline
                    }
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold flex-1"
                  >
                    {generatingQuick ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2" />
                        Generating… (~10s)
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Generate Quick Plan
                      </>
                    )}
                  </Button>
                  <button
                    onClick={() => setShowQuickForm(false)}
                    className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Career Path Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {careerNames.map((name) => (
          <button
            key={name}
            onClick={() => {
              setActiveCareer(name);
              setExpandedSkills({ 0: true });
              setError(null);
            }}
            disabled={deletingCareer === name}
            className={`relative flex items-center gap-2 px-4 py-2.5 pr-8 rounded-lg border-2 text-sm font-medium whitespace-nowrap transition-all group ${
              activeCareer === name
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-primary/40 text-muted-foreground"
            } ${deletingCareer === name ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Target className="w-4 h-4" />
            {name}
            {careerNames.length > 1 && (
              <button
                onClick={(e) => deleteCareerPlan(name, e)}
                disabled={deletingCareer === name}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                title={`Delete ${name} study plan`}
              >
                {deletingCareer === name ? (
                  <div className="w-3 h-3 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </button>
            )}
          </button>
        ))}
        <button
          onClick={() => setShowNewPathPicker((p) => !p)}
          className="flex items-center gap-1 px-4 py-2.5 rounded-lg border-2 border-dashed border-border hover:border-primary/40 text-sm font-medium text-muted-foreground hover:text-primary transition-all whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          New Path
        </button>
      </div>

      {/* New Path Picker */}
      {showNewPathPicker && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-semibold mb-3">Select a career to add</h3>
          {availableNewRoles.length === 0 && !loadingRoles ? (
            <p className="text-sm text-muted-foreground">
              No additional roles available. Analyze your resume to discover
              more paths.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableNewRoles.map((role) => (
                <button
                  key={role.career}
                  onClick={() => generateForCareer(role.career)}
                  disabled={loading}
                  className="relative flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 text-left transition-all disabled:opacity-50"
                >
                  {role.is_interested && (
                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 absolute top-2 right-2" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {role.career}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {role.missing_skills?.length} skills &middot;{" "}
                      {Math.round(role.boosted_score ?? role.probability ?? 0)}%
                      match
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {loading && (
            <p className="text-sm text-primary mt-3 animate-pulse">
              Generating plan...
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {/* ── Two-column layout: LEFT = plan content, RIGHT = compact calendar ── */}
      {activePlan && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
          {/* ── LEFT COLUMN ── */}
          <div className="space-y-6 min-w-0">
            {/* Header */}
            <div className="bg-primary/10 border border-border rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GraduationCap className="w-6 h-6 text-primary" />
                  <div>
                    <h2 className="text-xl font-bold">{activeCareer}</h2>
                    <p className="text-sm text-muted-foreground">
                      Your personalized learning roadmap
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {activePlan.cached_at && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded hidden sm:inline">
                      Saved{" "}
                      {new Date(activePlan.cached_at).toLocaleDateString()}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateForCareer(activeCareer)}
                    disabled={loading}
                  >
                    <RefreshCw
                      className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`}
                    />
                    {loading ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-primary">
                  {skillReport.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Skills to Learn
                </div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-primary">
                  {totalResources}
                </div>
                <div className="text-sm text-muted-foreground">Resources</div>
              </div>
              {activePlan.schedule_summary && (
                <>
                  <div className="bg-card border border-border rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-primary flex items-center justify-center gap-1">
                      <Clock className="w-5 h-5" />
                      {activePlan.schedule_summary.total_hours}h
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total Hours
                    </div>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-primary flex items-center justify-center gap-1">
                      <CalendarDays className="w-5 h-5" />
                      {activePlan.schedule_summary.total_weeks}w
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Est. Duration
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Schedule Summary & Google Calendar */}
            {activePlan?.schedule_summary && (
              <div className="bg-card border border-border rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Study Schedule</h3>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {activePlan.schedule_summary.hours_per_week}h/week
                    </span>
                    {activePlan.schedule_summary.parallel_tracks > 1 && (
                      <span className="text-xs bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">
                        {activePlan.schedule_summary.parallel_tracks} parallel
                        tracks
                      </span>
                    )}
                  </div>
                </div>

                {activePlan.schedule_summary.note && (
                  <p className="text-sm text-muted-foreground">
                    {activePlan.schedule_summary.note}
                  </p>
                )}

                {/* Per-skill breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activePlan.schedule_summary.skills?.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 border border-border"
                    >
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {s.skill}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.hours}h &middot; {s.sessions} session
                          {s.sessions !== 1 ? "s" : ""}
                        </div>
                        {(s.track ||
                          s.start_week !== undefined ||
                          s.end_week !== undefined) && (
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {s.track ? `Track ${s.track}` : "Planned"}
                            {s.start_week !== undefined &&
                            s.end_week !== undefined
                              ? ` • Week ${s.start_week}-${s.end_week}`
                              : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Google Calendar Sync */}
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-3">
                    Add your study sessions directly to Google Calendar. Events
                    are spread across weekdays based on your time commitment.
                  </p>
                  <GoogleCalendarSync
                    targetCareer={activeCareer}
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {/* Controls */}
            {skillReport.length > 0 && (
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={expandAll}>
                  <ChevronDown className="w-4 h-4 mr-1" /> Expand All
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>
                  <ChevronUp className="w-4 h-4 mr-1" /> Collapse All
                </Button>
              </div>
            )}

            {/* Skill Roadmaps */}
            {skillReport.length > 0 ? (
              <div className="space-y-4">
                {skillReport.map((skillData, skillIdx) => (
                  <div
                    key={skillIdx}
                    className="bg-card border border-border rounded-lg overflow-hidden"
                  >
                    <button
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => toggleSkill(skillIdx)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                          {skillIdx + 1}
                        </span>
                        <h4 className="font-semibold text-lg">
                          {skillData.skill}
                        </h4>
                        {skillData.roadmap_url && (
                          <a
                            href={skillData.roadmap_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
                          >
                            <MapIcon className="w-3 h-3" />
                            roadmap.sh
                          </a>
                        )}
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                          {skillData.learning_path?.length || 0} steps
                        </span>
                      </div>
                      {expandedSkills[skillIdx] ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>

                    {expandedSkills[skillIdx] && (
                      <div className="border-t border-border p-4 space-y-3">
                        {skillData.learning_path?.map((resource, resIdx) => (
                          <div key={resIdx} className="flex gap-4 relative">
                            {resIdx < skillData.learning_path.length - 1 && (
                              <div className="absolute left-[18px] top-10 bottom-0 w-0.5 bg-border" />
                            )}
                            <div className="flex-shrink-0">
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 ${getTypeBadgeColor(resource.type)}`}
                              >
                                {resource.step || resIdx + 1}
                              </div>
                            </div>
                            <div className="flex-1 pb-3">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span
                                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${getTypeBadgeColor(resource.type)}`}
                                >
                                  {getStepIcon(resource.type)}
                                  {resource.type}
                                </span>
                                {resource.label && (
                                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                    {resource.label}
                                  </span>
                                )}
                              </div>
                              <h5 className="font-medium text-sm mb-2">
                                {resource.title}
                              </h5>
                              <div className="flex flex-wrap gap-2 mb-2">
                                {resource.platform && (
                                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                    {resource.platform}
                                  </span>
                                )}
                                {resource.est_time && (
                                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                                    {resource.est_time}
                                  </span>
                                )}
                                {resource.cost && (
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded ${resource.cost === "Free" ? "bg-green-500/10 text-green-600" : "bg-orange-500/10 text-orange-600"}`}
                                  >
                                    {resource.cost}
                                  </span>
                                )}
                              </div>
                              {resource.url && (
                                <a
                                  href={resource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                >
                                  Open Resource
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              {/* Alternative platform links */}
                              {resource.alt_platforms?.length > 0 && (
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <span className="text-xs text-muted-foreground">
                                    Also on:
                                  </span>
                                  {resource.alt_platforms.map((alt, altIdx) => (
                                    <a
                                      key={altIdx}
                                      href={alt.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                                    >
                                      {alt.name}
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : activePlan ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h2 className="text-lg font-semibold mb-1">
                  No resources found
                </h2>
                <p className="text-muted-foreground text-sm">
                  Try refreshing or analyzing your skill gaps first
                </p>
              </div>
            ) : null}
          </div>
          {/* end LEFT COLUMN */}

          {/* ── RIGHT COLUMN: Compact Calendar (always visible, sticky) ── */}
          <div className="hidden xl:block">
            <div className="sticky top-6 space-y-3">
              {/* Calendar type switcher */}
              {activeQuickPlan && (
                <div className="flex gap-1 p-1 bg-muted/40 rounded-xl border border-border">
                  <button
                    onClick={() => setCalendarPlanType("standard")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      calendarPlanType === "standard"
                        ? "bg-background shadow-sm text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <CalIcon className="w-3 h-3" /> Roadmap
                  </button>
                  <button
                    onClick={() => setCalendarPlanType("quick_prep")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      calendarPlanType === "quick_prep"
                        ? "bg-amber-500 shadow-sm text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Zap className="w-3 h-3" /> Quick Prep
                  </button>
                </div>
              )}

              {/* Calendar card */}
              <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <CalIcon className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">
                    {calendarPlanType === "quick_prep" && activeQuickPlan
                      ? "Quick Prep"
                      : "Study Calendar"}
                  </h3>
                  {calendarPlanType === "quick_prep" &&
                    activeQuickPlan?.deadline && (
                      <span className="ml-auto text-[10px] text-orange-500 font-medium">
                        Due{" "}
                        {new Date(activeQuickPlan.deadline).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                      </span>
                    )}
                </div>
                <NativeCalendar
                  dayEntries={calendarDayEntries}
                  planType={
                    calendarPlanType === "quick_prep" && activeQuickPlan
                      ? "quick_prep"
                      : "standard"
                  }
                  deadline={
                    calendarPlanType === "quick_prep"
                      ? activeQuickPlan?.deadline
                      : undefined
                  }
                />
              </div>

              {/* Google Calendar sync (compact row) */}
              {activePlan?.schedule_summary &&
                calendarPlanType === "standard" && (
                  <div className="bg-card border border-border rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Sync to Google Calendar
                    </p>
                    <GoogleCalendarSync
                      targetCareer={activeCareer}
                      disabled={loading}
                    />
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudyPlanner;
