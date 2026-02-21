// src/components/StudyPlanner.js
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../api/supabaseClient";
import { Button } from "./ui/button";
import {
  BookOpen, ExternalLink, FileText, GraduationCap,
  ChevronDown, ChevronUp, Star, TrendingUp, Plus,
  RefreshCw, Sparkles, Target, Layers,
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

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  // Load ALL cached plans on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) { setLoadingCache(false); return; }
        const res = await fetch(
          "http://localhost:8000/api/v1/resume/study-materials-cache",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.cached && data.plans?.length > 0) {
          const plans = {};
          for (const p of data.plans) {
            plans[p.target_career] = {
              skill_gap_report: p.skill_gap_report,
              study_plan: p.study_plan,
              cached_at: p.cached_at,
            };
          }
          setAllPlans(plans);
          setActiveCareer(data.plans[0].target_career);
          setExpandedSkills({ 0: true });
        }
      } catch (err) {
        console.warn("Could not load cached study materials:", err);
      } finally {
        if (!cancelled) setLoadingCache(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch suggested roles (re-runs when activeStack changes)
  const fetchSuggestedRoles = useCallback(async (stackOverride) => {
    try {
      setLoadingRoles(true);
      const token = await getAuthToken();
      if (!token) { setLoadingRoles(false); return; }
      const stackParam = stackOverride !== undefined ? stackOverride : activeStack;
      const url = new URL("http://localhost:8000/api/v1/resume/suggested-roles");
      if (stackParam) url.searchParams.set("stack", stackParam);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        setSuggestedRoles(data.suggested_roles || []);
        setInterestedRoles(data.interested_roles || []);
        if (data.detected_stacks) setDetectedStacks(data.detected_stacks);
        if (data.available_stacks) setAvailableStacks(data.available_stacks);
        if (data.active_stack && activeStack === null) setActiveStack(data.active_stack);
      }
    } catch (err) {
      console.warn("Could not load suggested roles:", err);
    } finally {
      setLoadingRoles(false);
    }
  }, [activeStack]);

  // Load suggested roles on mount
  useEffect(() => {
    fetchSuggestedRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Career metadata lookup
  const getCareerMeta = useCallback((careerName) => {
    const sr = suggestedRoles.find((r) => r.career === careerName);
    if (sr && sr.missing_skills?.length > 0) return sr;
    if (resumeData?.careerAnalysis) {
      const all = resumeData.careerAnalysis.career_matches || resumeData.careerAnalysis.top_3_careers || [];
      const found = all.find((c) => c.career === careerName);
      if (found) return found;
    }
    return null;
  }, [suggestedRoles, resumeData]);

  // Generate study plan for a career
  const generateForCareer = useCallback(async (careerName) => {
    const meta = getCareerMeta(careerName);
    if (!meta || !meta.missing_skills?.length) {
      setError(`No skill gaps found for "${careerName}". Analyze your resume first.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("target_career", careerName);
      formData.append("missing_skills", JSON.stringify(meta.missing_skills.slice(0, 7)));
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const response = await fetch(
        "http://localhost:8000/api/v1/resume/generate-study-materials-simple",
        { method: "POST", body: formData, headers }
      );
      const data = await response.json();
      if (data.success) {
        setAllPlans((prev) => ({
          ...prev,
          [careerName]: {
            skill_gap_report: data.skill_gap_report,
            study_plan: data.study_plan,
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
  }, [getCareerMeta]);

  // Seed from resumeData prop if no cached plans loaded
  useEffect(() => {
    if (Object.keys(allPlans).length > 0) return;
    if (resumeData?.studyMaterials) {
      const sm = resumeData.studyMaterials;
      if (sm.target_career && sm.skill_gap_report?.length > 0) {
        setAllPlans({ [sm.target_career]: sm });
        setActiveCareer(sm.target_career);
        setExpandedSkills({ 0: true });
      }
    }
  }, [resumeData, allPlans]);

  const toggleSkill = (idx) => setExpandedSkills((p) => ({ ...p, [idx]: !p[idx] }));
  const expandAll = () => {
    const plan = allPlans[activeCareer];
    if (!plan) return;
    const all = {};
    plan.skill_gap_report?.forEach((_, i) => { all[i] = true; });
    setExpandedSkills(all);
  };
  const collapseAll = () => setExpandedSkills({});

  // Handle tech-stack change — re-fetch roles with new filter
  const handleStackChange = useCallback((newStack) => {
    const next = newStack === activeStack ? null : newStack;  // toggle off if same
    setActiveStack(next);
    fetchSuggestedRoles(next || "");
  }, [activeStack, fetchSuggestedRoles]);

  // Stack selector component (reused in both empty & main views)
  const StackSelector = () => {
    if (availableStacks.length === 0 && detectedStacks.length === 0) return null;
    const stacks = availableStacks.length > 0 ? availableStacks : detectedStacks.map((d) => d.stack);
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
    const remaining = suggestedRoles.filter((r) => !allPlans[r.career] && r.missing_skills?.length > 0);
    const interested = remaining.filter((r) => r.is_interested);
    const others = remaining.filter((r) => !r.is_interested);
    return [...interested, ...others];
  }, [suggestedRoles, allPlans]);

  const careerNames = Object.keys(allPlans);

  // Style helpers
  const getStepIcon = (type) => {
    switch (type) {
      case "Documentation": return <FileText className="w-4 h-4" />;
      case "YouTube": return <BookOpen className="w-4 h-4" />;
      case "Course": return <GraduationCap className="w-4 h-4" />;
      default: return <BookOpen className="w-4 h-4" />;
    }
  };
  const getTypeBadgeColor = (type) => {
    switch (type) {
      case "Documentation": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "YouTube": return "bg-red-500/10 text-red-600 border-red-500/20";
      case "Course": return "bg-green-500/10 text-green-600 border-green-500/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  // ── RENDER: loading cache ──
  if (loadingCache) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Loading Study Plans...</h2>
          <p className="text-muted-foreground">Checking for saved learning paths</p>
        </div>
      </div>
    );
  }

  // ── RENDER: no plans yet ──
  if (careerNames.length === 0 && !loading) {
    const hasRoles = suggestedRoles.length > 0;
    const fallbackCareer = resumeData?.careerAnalysis?.top_3_careers?.[0];
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
              Select a role below, then generate a personalized study plan. You can add more paths later.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {suggestedRoles.slice(0, 8).map((role) => (
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
                    <div className="font-medium text-sm truncate">{role.career}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, role.boosted_score)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{role.boosted_score}% match</span>
                    </div>
                    {role.missing_skills?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{role.missing_skills.length} skills to learn</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {selectedNewRole && (
              <div className="mt-4 flex justify-center">
                <Button onClick={() => generateForCareer(selectedNewRole)} disabled={loading}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Study Plan for {selectedNewRole}
                </Button>
              </div>
            )}
          </div>
        )}
        {!hasRoles && !loadingRoles && fallbackCareer && (
          <div
            className="bg-card border border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all"
            onClick={() => generateForCareer(fallbackCareer.career)}
          >
            <BookOpen className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Generate Study Materials</h2>
            <p className="text-muted-foreground mb-2">
              For <strong className="text-foreground">{fallbackCareer.career}</strong>
            </p>
            <p className="text-sm text-muted-foreground/70">{fallbackCareer.missing_skills?.length || 0} skills to learn</p>
            <Button className="mt-4"><BookOpen className="w-4 h-4 mr-2" /> Generate</Button>
          </div>
        )}
        {!hasRoles && !loadingRoles && !fallbackCareer && (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">No Study Plan Available</h2>
            <p className="text-muted-foreground mb-2">Upload your resume in Resume Optimizer first to identify skill gaps</p>
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
          <h2 className="text-xl font-bold mb-2">Generating Study Materials...</h2>
          <p className="text-muted-foreground mb-2">Searching for the best learning resources...</p>
          <p className="text-sm text-muted-foreground/70">This may take 5-10 seconds</p>
        </div>
      </div>
    );
  }

  // ── RENDER: main view ──
  const activePlan = allPlans[activeCareer];
  const skillReport = activePlan?.skill_gap_report || [];
  const totalResources = skillReport.reduce((s, sk) => s + (sk.learning_path?.length || 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Tech Stack Selector */}
      <StackSelector />

      {/* Career Path Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {careerNames.map((name) => (
          <button
            key={name}
            onClick={() => { setActiveCareer(name); setExpandedSkills({ 0: true }); setError(null); }}
            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium whitespace-nowrap transition-all ${
              activeCareer === name
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-primary/40 text-muted-foreground"
            }`}
          >
            <Target className="w-4 h-4" />
            {name}
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
            <p className="text-sm text-muted-foreground">No additional roles available. Analyze your resume to discover more paths.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableNewRoles.slice(0, 6).map((role) => (
                <button
                  key={role.career}
                  onClick={() => generateForCareer(role.career)}
                  disabled={loading}
                  className="relative flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 text-left transition-all disabled:opacity-50"
                >
                  {role.is_interested && <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 absolute top-2 right-2" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{role.career}</div>
                    <p className="text-xs text-muted-foreground">{role.missing_skills?.length} skills &middot; {role.boosted_score}% match</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {loading && <p className="text-sm text-primary mt-3 animate-pulse">Generating plan...</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {/* Header */}
      {activePlan && (
        <div className="bg-primary/10 border border-border rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GraduationCap className="w-6 h-6 text-primary" />
              <div>
                <h2 className="text-xl font-bold">{activeCareer}</h2>
                <p className="text-sm text-muted-foreground">Your personalized learning roadmap</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {activePlan.cached_at && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded hidden sm:inline">
                  Saved {new Date(activePlan.cached_at).toLocaleDateString()}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => generateForCareer(activeCareer)} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {activePlan && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-primary">{skillReport.length}</div>
            <div className="text-sm text-muted-foreground">Skills to Learn</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-primary">{totalResources}</div>
            <div className="text-sm text-muted-foreground">Resources</div>
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
            <div key={skillIdx} className="bg-card border border-border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                onClick={() => toggleSkill(skillIdx)}
              >
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {skillIdx + 1}
                  </span>
                  <h4 className="font-semibold text-lg">{skillData.skill}</h4>
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
                      {resIdx < (skillData.learning_path.length - 1) && (
                        <div className="absolute left-[18px] top-10 bottom-0 w-0.5 bg-border" />
                      )}
                      <div className="flex-shrink-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 ${getTypeBadgeColor(resource.type)}`}>
                          {resource.step || resIdx + 1}
                        </div>
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${getTypeBadgeColor(resource.type)}`}>
                            {getStepIcon(resource.type)}
                            {resource.type}
                          </span>
                          {resource.label && (
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{resource.label}</span>
                          )}
                        </div>
                        <h5 className="font-medium text-sm mb-2">{resource.title}</h5>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {resource.platform && (
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{resource.platform}</span>
                          )}
                          {resource.est_time && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{resource.est_time}</span>
                          )}
                          {resource.cost && (
                            <span className={`text-xs px-2 py-0.5 rounded ${resource.cost === "Free" ? "bg-green-500/10 text-green-600" : "bg-orange-500/10 text-orange-600"}`}>
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
          <h2 className="text-lg font-semibold mb-1">No resources found</h2>
          <p className="text-muted-foreground text-sm">Try refreshing or analyzing your skill gaps first</p>
        </div>
      ) : null}
    </div>
  );
}

export default StudyPlanner;
