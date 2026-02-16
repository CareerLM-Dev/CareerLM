// src/components/StudyPlanner.js
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabaseClient";
import { Button } from "./ui/button";
import { BookOpen, ExternalLink, Youtube, FileText, GraduationCap, ChevronDown, ChevronUp } from "lucide-react";


function StudyPlanner({ resumeData }) {
  const [studyMaterials, setStudyMaterials] = useState(null);
  const [expandedSkills, setExpandedSkills] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingCache, setLoadingCache] = useState(true);
  const [error, setError] = useState(null);
  const [cachedAt, setCachedAt] = useState(null);

  // Helper: get auth token
  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  // On mount: try loading cached study materials from Supabase
  useEffect(() => {
    let cancelled = false;
    const loadCache = async () => {
      try {
        const token = await getAuthToken();
        if (!token) { setLoadingCache(false); return; }

        const res = await fetch(
          "http://localhost:8000/api/v1/resume/study-materials-cache",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();

        if (!cancelled && data.success && data.cached) {
          setStudyMaterials(data);
          setCachedAt(data.cached_at);
          if (data.skill_gap_report?.length > 0) {
            setExpandedSkills({ 0: true });
          }
        }
      } catch (err) {
        console.warn("Could not load cached study materials:", err);
      } finally {
        if (!cancelled) setLoadingCache(false);
      }
    };
    loadCache();
    return () => { cancelled = true; };
  }, []);

  const fetchStudyMaterials = useCallback(async () => {
    if (!resumeData?.careerAnalysis) {
      setError("No career analysis data available. Please run Skill Gap Analyzer first.");
      return;
    }

    const careerData = resumeData.careerAnalysis;
    const topCareer = careerData.top_3_careers?.[0];

    if (!topCareer || !topCareer.missing_skills?.length) {
      setError("No skill gaps found. Please ensure your resume has been analyzed.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getAuthToken();

      const formData = new FormData();
      formData.append("target_career", topCareer.career);
      formData.append(
        "missing_skills",
        JSON.stringify(topCareer.missing_skills.slice(0, 7))
      );

      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(
        "http://localhost:8000/api/v1/resume/generate-study-materials-simple",
        { method: "POST", body: formData, headers }
      );

      const data = await response.json();

      if (data.success) {
        setStudyMaterials(data);
        setCachedAt(new Date().toISOString());
        if (data.skill_gap_report?.length > 0) {
          setExpandedSkills({ 0: true });
        }
      } else {
        setError(data.error || "Failed to load study materials");
      }
    } catch (err) {
      console.error("Error loading study materials:", err);
      setError("Error loading study materials. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [resumeData]);

  useEffect(() => {
    if (studyMaterials) return;
    if (resumeData?.studyMaterials) {
      setStudyMaterials(resumeData.studyMaterials);
      if (resumeData.studyMaterials.skill_gap_report?.length > 0) {
        setExpandedSkills({ 0: true });
      }
    }
  }, [resumeData, studyMaterials]);

  const toggleSkill = (idx) => {
    setExpandedSkills((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const expandAll = () => {
    const all = {};
    studyMaterials?.skill_gap_report?.forEach((_, i) => { all[i] = true; });
    setExpandedSkills(all);
  };

  const collapseAll = () => setExpandedSkills({});

  // ---------- EMPTY / LOADING / ERROR STATES ----------

  if (loadingCache) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Loading Saved Study Plan...</h2>
          <p className="text-muted-foreground">Checking for cached materials</p>
        </div>
      </div>
    );
  }

  if (!resumeData && !studyMaterials) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">No Study Plan Available</h2>
          <p className="text-muted-foreground mb-2">Please upload your resume and job description in Resume Optimizer first</p>
          <p className="text-sm text-muted-foreground/70">The system will automatically generate personalized learning materials for you</p>
        </div>
      </div>
    );
  }

  if (!studyMaterials) {
    if (loading) {
      return (
        <div className="max-w-4xl mx-auto">
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Generating Study Materials...</h2>
            <p className="text-muted-foreground mb-2">Searching for the best learning resources with Google Search Grounding...</p>
            <p className="text-sm text-muted-foreground/70">This may take 5-10 seconds</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="max-w-4xl mx-auto">
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-8 text-center">
            <h2 className="text-xl font-bold text-destructive mb-2">Error</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={fetchStudyMaterials} variant="outline">Try Again</Button>
          </div>
        </div>
      );
    }

    const topCareer = resumeData?.careerAnalysis?.top_3_careers?.[0];

    return (
      <div className="max-w-4xl mx-auto">
        <div
          className="bg-card border border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all"
          onClick={fetchStudyMaterials}
        >
          <BookOpen className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Generate Study Materials</h2>
          {topCareer ? (
            <>
              <p className="text-muted-foreground mb-2">
                Click to generate learning resources for <strong className="text-foreground">{topCareer.career}</strong>
              </p>
              <p className="text-sm text-muted-foreground/70">
                {topCareer.missing_skills?.length || 0} skills to learn:{" "}
                {topCareer.missing_skills?.slice(0, 3).join(", ")}
                {topCareer.missing_skills?.length > 3 ? "..." : ""}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Click to search for learning resources based on your skill gaps</p>
          )}
          <Button onClick={fetchStudyMaterials} className="mt-4">
            <BookOpen className="w-4 h-4 mr-2" />
            Load Study Materials
          </Button>
        </div>
      </div>
    );
  }

  // ---------- RENDER STUDY PLAN ----------

  const { target_career, skill_gap_report } = studyMaterials;

  const totalResources = skill_gap_report?.reduce(
    (sum, s) => sum + (s.learning_path?.length || 0), 0
  ) || 0;

  const getStepIcon = (type) => {
    switch (type) {
      case "Documentation": return <FileText className="w-4 h-4" />;
      case "YouTube": return <Youtube className="w-4 h-4" />;
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-primary/10 border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-bold">Personalized Study Plan</h2>
          </div>
          <div className="flex items-center gap-3">
            {cachedAt && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                Saved {new Date(cachedAt).toLocaleDateString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStudyMaterials}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground">
          Your customized learning roadmap for {target_career || "career development"}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-primary">{skill_gap_report?.length || 0}</div>
          <div className="text-sm text-muted-foreground">Skills to Learn</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-primary">{totalResources}</div>
          <div className="text-sm text-muted-foreground">Live Resources</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-500">
            {skill_gap_report?.reduce(
              (sum, s) => sum + (s.learning_path?.filter((r) => r.type === "YouTube").length || 0), 0
            ) || 0}
          </div>
          <div className="text-sm text-muted-foreground">Video Courses</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-500">
            {skill_gap_report?.reduce(
              (sum, s) => sum + (s.learning_path?.filter((r) => r.type === "Course").length || 0), 0
            ) || 0}
          </div>
          <div className="text-sm text-muted-foreground">Platform Courses</div>
        </div>
      </div>

      {/* Expand / Collapse Controls */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={expandAll}>
          <ChevronDown className="w-4 h-4 mr-1" /> Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          <ChevronUp className="w-4 h-4 mr-1" /> Collapse All
        </Button>
      </div>

      {/* Skill Roadmap Cards */}
      {skill_gap_report && skill_gap_report.length > 0 ? (
        <div className="space-y-4">
          {skill_gap_report.map((skillData, skillIdx) => (
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
      ) : (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">No resources found</h2>
          <p className="text-muted-foreground text-sm">Try analyzing your skill gaps first</p>
        </div>
      )}
    </div>
  );
}

export default StudyPlanner;
