// src/components/SkillGapAnalyzer.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cleanMarkdown } from "../utils/textFormatter";
import { Button } from "./ui/button";
import {
 
  TrendingUp,
  Target,
  Briefcase,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Zap,
  Clock,
  BookOpen,
  Star,
  X,
  Info,
  Upload,
} from "lucide-react";
import axios from "axios";
import { supabase } from "../api/supabaseClient";

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

/** Single skill chip with confidence-aware coloring */
function SkillChip({ skill, level = "low", score, onClick, isSelected, isButton = false }) {
  const colorMap = {
    high: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20",
    low: "bg-slate-500/10 text-slate-600 border-slate-500/30 hover:bg-slate-500/20",
    missing: "bg-red-500/10 text-red-700 border-red-500/30 hover:bg-red-500/20",
    improve: "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20",
  };
  const selectedMap = {
    missing: "bg-red-600 text-white border-red-600",
    improve: "bg-amber-500 text-white border-amber-500",
  };

  const baseClass = "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const activeClass = isSelected && selectedMap[level] ? selectedMap[level] : (colorMap[level] || colorMap.low);

  const Tag = isButton ? "button" : "span";

  return (
    <Tag
      type={isButton ? "button" : undefined}
      onClick={onClick}
      className={`${baseClass} ${activeClass} ${isButton ? "cursor-pointer" : "cursor-default"}`}
    >
      {cleanMarkdown(skill)}
      {score !== undefined && (
        <span className="opacity-60 text-[10px]">· {score}</span>
      )}
    </Tag>
  );
}

/** Collapsible skill list with "+N more" behaviour */
function SkillListSection({ skills = [], defaultVisible = 6, level = "low", onSkillClick, selectedSkill }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? skills : skills.slice(0, defaultVisible);
  const extra = skills.length - defaultVisible;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((s, i) => (
          <SkillChip
            key={i}
            skill={s}
            level={level}
            isButton={!!onSkillClick}
            isSelected={selectedSkill === s}
            onClick={onSkillClick ? () => onSkillClick(s) : undefined}
          />
        ))}
        {!expanded && extra > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{extra} more
          </button>
        )}
        {expanded && extra > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show less
          </button>
        )}
      </div>
      {skills.length === 0 && (
        <p className="text-xs text-muted-foreground italic">None identified</p>
      )}
    </div>
  );
}

/** Horizontal legend strip */
function StatusLegend() {
  const items = [
    { color: "bg-emerald-500", label: "Matched / Strong" },
    { color: "bg-amber-500", label: "Needs strengthening" },
    { color: "bg-red-500", label: "Missing / Critical" },
    { color: "bg-slate-400", label: "Low exposure" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {items.map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${color}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Empty / placeholder states */
function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-4">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Animated progress bar */
function ProgressBar({ value = 0, color }) {
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

function SkillGapAnalyzer({ resumeData }) {
  const navigate = useNavigate();
  const [analysisResult, setAnalysisResult] = useState(null);
  const [selectedCareer, setSelectedCareer] = useState(null);
  const [showAllCareers, setShowAllCareers] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [userId, setUserId] = useState(null);
  const [selectedMissingSkill, setSelectedMissingSkill] = useState(null);
  const [activeTab, setActiveTab] = useState("matched");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);

  // ── Helpers (preserved exactly) ──────────────

  const normalizeRole = (value) =>
    (value || "")
      .toLowerCase()
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const roleMatches = (careerName, interestedRoles) => {
    const career = normalizeRole(careerName);
    return (interestedRoles || []).some((role) => {
      const target = normalizeRole(role);
      return (
        target &&
        (target === career ||
          target.includes(career) ||
          career.includes(target))
      );
    });
  };

  const getInterestedRoleFilteredCareers = (payload) => {
    const roles = Array.isArray(payload?.interested_roles)
      ? payload.interested_roles
      : [];
    const matches = payload?.career_matches || [];
    if (!roles.length) return matches;
    const filtered = matches.filter((career) =>
      roleMatches(career?.career, roles),
    );
    return filtered.length ? filtered : matches;
  };

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (resumeData?.careerAnalysis) {
      const careerData = resumeData.careerAnalysis;
      if (careerData.career_matches && careerData.career_matches.length > 0) {
        setAnalysisResult(careerData);
        const roles = Array.isArray(careerData?.interested_roles) ? careerData.interested_roles : [];
        const matches = careerData?.career_matches || [];
        const filtered = roles.length
          ? matches.filter((career) => {
              const careerNorm = normalizeRole(career?.career);
              return roles.some((role) => {
                const roleNorm = normalizeRole(role);
                return roleNorm && (roleNorm === careerNorm || roleNorm.includes(careerNorm) || careerNorm.includes(roleNorm));
              });
            })
          : matches;
        setSelectedCareer((filtered.length ? filtered : matches)[0] || null);
      } else {
        setAnalysisResult(null);
      }
    } else {
      setAnalysisResult(null);
    }
  }, [resumeData]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) { setResumeFile(file); setError(null); }
  };

  const handleAnalyze = async () => {
    const hasResume = resumeFile || resumeData;
    if (!hasResume) { setError("Please upload a resume first"); return; }
    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    setSelectedCareer(null);
    setSelectedMissingSkill(null);
    try {
      const formData = new FormData();
      if (resumeFile) {
        formData.append("resume", resumeFile);
      } else if (resumeData?.file) {
        formData.append("resume", resumeData.file);
      } else if (resumeData) {
        setError("Original resume file not available. Please re-upload your resume to run a fresh analysis.");
        setLoading(false);
        return;
      } else {
        throw new Error("No resume file available");
      }
      if (userId) formData.append("user_id", userId);
      const result = await axios.post(
        "http://localhost:8000/api/v1/orchestrator/skill-gap-analysis",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setAnalysisResult(result.data);
      const filtered = getInterestedRoleFilteredCareers(result.data);
      setSelectedCareer(filtered.length > 0 ? filtered[0] : null);
      setSelectedMissingSkill(null);
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Analysis failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Skill helpers (preserved exactly) ────────

  const getProbabilityColor = (p) => {
    if (p >= 70) return "#10b981";
    if (p >= 50) return "#f59e0b";
    if (p >= 30) return "#ef4444";
    return "#6b7280";
  };

  const getProbabilityLabel = (p) => {
    if (p >= 70) return "Excellent Match";
    if (p >= 50) return "Good Match";
    if (p >= 30) return "Fair Match";
    return "Needs Development";
  };

  const skillConfidenceLevels = analysisResult?.skill_confidence_levels || {
    high_confidence: [],
    medium_confidence: [],
    low_confidence: [],
  };
  const skillConfidenceDetails = analysisResult?.skill_confidence_details || [];

  const getSkillDetail = (skill) => {
    const key = (skill || "").toLowerCase();
    return skillConfidenceDetails.find((item) => (item.skill || "").toLowerCase() === key);
  };

  const getSkillConfidenceLevel = (skill) => {
    const s = (skill || "").toLowerCase();
    if (skillConfidenceLevels.high_confidence.some((it) => it.toLowerCase() === s)) return "high";
    if (skillConfidenceLevels.medium_confidence.some((it) => it.toLowerCase() === s)) return "medium";
    return "low";
  };

  const getSkillEvidenceText = (skill) => {
    const detail = getSkillDetail(skill);
    if (!detail) return "No confidence evidence found for this skill.";
    const evidence = Array.isArray(detail.evidence) ? detail.evidence.join(", ") : "No evidence listed";
    return `Confidence: ${detail.level || "unknown"} · Score: ${detail.score ?? 0} · Found in: ${evidence}`;
  };

  const getSkillLearningInfo = (skill) =>
    selectedCareer?.missing_skills_metadata?.find((m) => m.skill === skill) || null;

  const getMissingSkillReason = (skill) => {
    const meta = getSkillLearningInfo(skill);
    if (meta?.reason) return meta.reason;
    return "Learning this skill closes a high-impact gap and directly improves your fit for this career path.";
  };

  const toggleMissingSkillDetails = (skill, group = "missing") => {
    const key = `${group}::${skill}`;
    setSelectedMissingSkill((prev) => (prev === key ? null : key));
  };

  const getSelectedGapSkillName = () => {
    if (!selectedMissingSkill) return null;
    const parts = selectedMissingSkill.split("::");
    return parts.length === 2 ? parts[1] : selectedMissingSkill;
  };

  const getSelectedGapSkillGroup = () => {
    if (!selectedMissingSkill) return null;
    const parts = selectedMissingSkill.split("::");
    return parts.length === 2 ? parts[0] : null;
  };

  // ── Derived values ────────────────────────────

  const interestedRoleFilteredCareers = getInterestedRoleFilteredCareers(analysisResult);
  const careersToDisplay = showAllCareers
    ? interestedRoleFilteredCareers
    : interestedRoleFilteredCareers.slice(0, 3);

  const bestMatch = analysisResult?.analysis_summary?.best_match || null;
  const bestScore = analysisResult?.analysis_summary?.best_match_probability || 0;
  const totalSkills = analysisResult?.total_skills_found || 0;
  const totalMissing = selectedCareer?.missing_skills?.length || 0;

  // ── Next steps generator ──────────────────────

  const getNextSteps = (career) => {
    if (!career) return [];
    const steps = [];
    const quickFixes = (career.missing_skills_metadata || []).filter((m) => m.is_quick_fix);
    const topMissing = (career.missing_skills || []).slice(0, 2);

    if (quickFixes.length > 0) {
      steps.push({
        icon: Zap,
        color: "text-emerald-600",
        bg: "bg-emerald-500/10",
        label: `Start with quick wins: ${quickFixes.slice(0, 2).map((m) => m.skill).join(", ")}`,
        sub: "These take less than a week to demonstrate.",
      });
    }
    if (topMissing.length > 0) {
      steps.push({
        icon: BookOpen,
        color: "text-blue-600",
        bg: "bg-blue-500/10",
        label: `Build your core gaps: ${topMissing.map((s) => cleanMarkdown(s)).join(", ")}`,
        sub: "Add these to your projects or take a focused course.",
      });
    }
    if ((career.needs_improvement_skills || []).length > 0) {
      steps.push({
        icon: TrendingUp,
        color: "text-amber-600",
        bg: "bg-amber-500/10",
        label: `Deepen existing exposure: ${(career.needs_improvement_skills || []).slice(0, 2).map((s) => cleanMarkdown(s)).join(", ")}`,
        sub: "You already have some exposure — strengthen with real examples.",
      });
    }
    if (steps.length === 0) {
      steps.push({
        icon: Star,
        color: "text-primary",
        bg: "bg-primary/10",
        label: "You're a strong match — apply now or review your resume.",
        sub: "Highlight matched skills prominently on your resume.",
      });
    }
    return steps.slice(0, 3);
  };

  // ─────────────────────────────────────────────
  // Handle loading state
  // ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-2xl p-12 flex flex-col items-center justify-center gap-6 text-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Target className="absolute inset-0 m-auto w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-lg font-semibold">Analyzing your career profile…</p>
            <p className="text-sm text-muted-foreground mt-1">
              We're mapping your skills to hundreds of career paths. This takes 15–30 seconds.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground w-full max-w-xs">
            {["Extracting skills from resume", "Mapping to career roles", "Calculating fit scores", "Generating recommendations"].map((step, i) => (
              <div key={i} className="flex items-center gap-2 w-full">
                <div className="w-4 h-4 rounded-full border border-primary/30 flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
                </div>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Upload / pre-analysis state
  // ─────────────────────────────────────────────
  if (!analysisResult && !loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <Target className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Skill Gap Analyzer</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Discover which career paths fit you best — and get a clear, prioritized plan to close any gaps.
          </p>
        </div>

        {/* Action card */}
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Resume Ready</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              We found your resume <strong>{resumeData?.filename || "on file"}</strong>. 
              Click below to map your extracted skills to hundreds of industry career paths.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Something went wrong</p>
                <p className="text-destructive/80 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <Button
            onClick={handleAnalyze}
            disabled={!resumeFile && !resumeData}
            className="w-full"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Analyze My Career Fit
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Your data is processed securely and never shared.
          </p>
        </div>

        {/* What to expect */}
        <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
          {[
            { icon: Briefcase, label: "Career path matches" },
            { icon: CheckCircle, label: "Skills you already have" },
            { icon: BookOpen, label: "What to learn next" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 p-3 bg-muted/50 rounded-xl">
              <Icon className="w-5 h-5 text-primary" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Results view
  // ─────────────────────────────────────────────
  const nextSteps = getNextSteps(selectedCareer);

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* ── HERO SUMMARY BAR ───────────────────── */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Best Match */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Best match</p>
              <p className="font-bold text-foreground text-base leading-tight truncate">{bestMatch || "—"}</p>
            </div>
            <div
              className="flex-shrink-0 text-center px-3 py-1.5 rounded-xl font-bold text-sm text-white"
              style={{ backgroundColor: getProbabilityColor(bestScore) }}
            >
              {bestScore}%
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-10 bg-border" />

          {/* Stats row */}
          <div className="flex items-center gap-4 text-sm flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowSkillsModal(true)}
              className="flex items-center gap-1.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label="View all detected skills"
            >
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold">{totalSkills}</span>
              <span className="text-muted-foreground group-hover:text-foreground transition-colors">skills detected</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
            <div className="flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="font-semibold">{totalMissing}</span>
              <span className="text-muted-foreground">gaps</span>
            </div>
          </div>

          {/* CTA */}
          {nextSteps[0] && (
            <>
              <div className="hidden sm:block w-px h-10 bg-border" />
              <div className="flex items-start gap-2 flex-shrink-0 max-w-[220px]">
                <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-snug">
                  <span className="font-semibold text-foreground">Next: </span>
                  {nextSteps[0].label}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Interested roles tag */}
        {Array.isArray(analysisResult?.interested_roles) && analysisResult.interested_roles.length > 0 && (
          <div className="mt-3 pt-3 border-t border-primary/10 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Showing results for:</span>
            {analysisResult.interested_roles.map((r, i) => (
              <span key={i} className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── SKILLS SNAPSHOT ─────────────────────── */}
      <SkillsSnapshot
        confidenceLevels={skillConfidenceLevels}
        userSkills={analysisResult?.user_skills || []}
        totalSkillsFound={analysisResult?.total_skills_found || 0}
        onViewAll={() => setShowSkillsModal(true)}
      />

      {/* ── CAREER CARDS ─────────────────────────── */}
      <section aria-labelledby="career-heading">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 id="career-heading" className="text-base font-semibold">Career Path Recommendations</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Click a career to see your full gap breakdown.</p>
          </div>
          {interestedRoleFilteredCareers.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllCareers(!showAllCareers)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {showAllCareers ? "Show top 3" : `Show all ${interestedRoleFilteredCareers.length}`}
              {showAllCareers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {careersToDisplay.map((career, idx) => {
            const isSelected = selectedCareer?.career === career.career;
            const scoreColor = getProbabilityColor(career.probability);
            return (
              <button
                type="button"
                key={idx}
                onClick={() => {
                  setSelectedCareer(career);
                  setSelectedMissingSkill(null);
                  setActiveTab("matched");
                }}
                className={`text-left rounded-xl border p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border hover:border-primary/40 hover:shadow-sm bg-card"
                }`}
                aria-pressed={isSelected}
                aria-label={`Select ${career.career}, ${career.probability}% match`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold text-sm leading-snug flex-1">{career.career}</h4>
                  <span
                    className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: scoreColor }}
                  >
                    {career.probability}%
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mb-3">{getProbabilityLabel(career.probability)}</p>

                <div className="flex gap-3 mb-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span className="font-medium">{career.matched_skills_count}</span> matched
                  </span>
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="w-3.5 h-3.5" />
                    <span className="font-medium">{career.missing_skills?.length || 0}</span> missing
                  </span>
                  {(career.needs_improvement_skills?.length || 0) > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="font-medium">{career.needs_improvement_skills.length}</span> to strengthen
                    </span>
                  )}
                </div>

                <ProgressBar value={career.probability} color={scoreColor} />
              </button>
            );
          })}
        </div>
      </section>

      {/* ── SELECTED CAREER DETAIL ───────────────── */}
      {selectedCareer && (
        <section
          aria-labelledby="detail-heading"
          className="bg-card border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 pt-5 pb-0">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Selected Career</p>
                <h3 id="detail-heading" className="text-lg font-bold">{selectedCareer.career}</h3>
              </div>
              <div className="text-right flex-shrink-0">
                <div
                  className="text-2xl font-black"
                  style={{ color: getProbabilityColor(selectedCareer.probability) }}
                >
                  {selectedCareer.probability}%
                </div>
                <div className="text-xs text-muted-foreground">{getProbabilityLabel(selectedCareer.probability)}</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-border -mx-5 px-5" role="tablist">
              {[
                { id: "matched", Icon: CheckCircle, label: "Matched", count: selectedCareer?.matched_skills?.length || 0 },
                { id: "missing", Icon: XCircle, label: "Missing", count: selectedCareer?.missing_skills?.length || 0 },
                { id: "strengthen", Icon: AlertCircle, label: "Strengthen", count: selectedCareer?.needs_improvement_skills?.length || 0 },
                { id: "why", Icon: TrendingUp, label: "Why this score", count: null },
                { id: "nextsteps", Icon: ArrowRight, label: "Next Steps", count: null },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs font-medium border-b-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  aria-selected={activeTab === tab.id}
                  role="tab"
                >
                  <tab.Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.count !== null && tab.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      activeTab === tab.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab panels */}
          <div className="p-5" role="tabpanel">
            {/* ── Matched Skills ── */}
            {activeTab === "matched" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-sm">Skills you already have</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      These were found in your resume with the following confidence levels.
                    </p>
                  </div>
                  <StatusLegend />
                </div>

                {(selectedCareer?.matched_skills?.length || 0) > 0 ? (
                  <div className="space-y-4">
                    {/* Group by confidence */}
                    {["high", "medium", "low"].map((level) => {
                      const skillsInLevel = (selectedCareer.matched_skills || []).filter(
                        (s) => getSkillConfidenceLevel(s) === level
                      );
                      if (!skillsInLevel.length) return null;
                      const labels = { high: "Strong evidence", medium: "Some evidence", low: "Weak evidence" };
                      const levelMap = { high: "high", medium: "medium", low: "low" };
                      return (
                        <div key={level}>
                          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                            {labels[level]} ({skillsInLevel.length})
                          </p>
                          <SkillListSection
                            skills={skillsInLevel}
                            level={levelMap[level]}
                            defaultVisible={8}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={Target}
                    title="No matched skills found"
                    description="Your resume may not contain enough detail. Try adding specific tools, technologies, and projects."
                  />
                )}

                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    Hover over any skill to see where we found evidence of it in your resume.
                  </p>
                </div>
              </div>
            )}

            {/* ── Missing Skills ── */}
            {activeTab === "missing" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm">Skills to learn</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    These are required for the role but not found in your resume. Click any skill for learning details.
                  </p>
                </div>

                {(selectedCareer?.missing_skills?.length || 0) > 0 ? (
                  <div className="space-y-1.5">
                    {selectedCareer.missing_skills.map((skill, idx) => {
                      const meta = getSkillLearningInfo(skill);
                      const key = `missing::${skill}`;
                      const isOpen = selectedMissingSkill === key;
                      return (
                        <div key={idx} className="rounded-xl border border-border overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleMissingSkillDetails(skill, "missing")}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-expanded={isOpen}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                              <span className="text-sm font-medium truncate">{cleanMarkdown(skill)}</span>
                              {meta?.is_quick_fix && (
                                <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded uppercase">
                                  <Zap className="w-2.5 h-2.5" /> Quick win
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {meta?.learning_time_label && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  {meta.learning_time_label}
                                </span>
                              )}
                              {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="px-4 pb-4 border-t border-border bg-muted/30 space-y-2">
                              <p className="text-sm text-foreground pt-3 leading-relaxed">
                                {getMissingSkillReason(skill)}
                              </p>
                              {meta?.bucket && (
                                <p className="text-xs text-muted-foreground">
                                  Gap type: <span className="font-medium">{meta.bucket.replace(/_/g, " ")}</span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={CheckCircle}
                    title="No critical gaps found"
                    description="Great news — you have all the core skills for this role. Focus on strengthening existing skills and applying."
                  />
                )}

                {/* Learning timeline summary */}
                {(selectedCareer?.missing_skills_metadata?.length || 0) > 0 && (
                  <LearningTimeline metadata={selectedCareer.missing_skills_metadata} />
                )}
              </div>
            )}

            {/* ── Strengthen ── */}
            {activeTab === "strengthen" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm">Skills to strengthen</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    You have some exposure to these — but strengthening them with real project examples will significantly improve your fit.
                  </p>
                </div>

                {(selectedCareer?.needs_improvement_skills?.length || 0) > 0 ? (
                  <div className="space-y-1.5">
                    {selectedCareer.needs_improvement_skills.map((skill, idx) => {
                      const meta = getSkillLearningInfo(skill);
                      const key = `improve::${skill}`;
                      const isOpen = selectedMissingSkill === key;
                      return (
                        <div key={idx} className="rounded-xl border border-amber-500/20 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleMissingSkillDetails(skill, "improve")}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-amber-500/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-expanded={isOpen}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                              <span className="text-sm font-medium truncate">{cleanMarkdown(skill)}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {meta?.learning_time_label && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />{meta.learning_time_label}
                                </span>
                              )}
                              {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="px-4 pb-4 border-t border-amber-500/10 bg-amber-500/5 space-y-2">
                              <p className="text-sm text-foreground pt-3 leading-relaxed">
                                {getMissingSkillReason(skill)}
                              </p>
                              {meta?.bucket && (
                                <p className="text-xs text-muted-foreground">
                                  Gap type: <span className="font-medium">{meta.bucket.replace(/_/g, " ")}</span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={Star}
                    title="Nothing to improve here"
                    description="All your existing skills are at a strong enough level for this role."
                  />
                )}
              </div>
            )}

            {/* ── Why this score ── */}
            {activeTab === "why" && (
              <div className="space-y-4">
                <h4 className="font-semibold text-sm">How your score is calculated</h4>

                {/* Score bars */}
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Skill match rate</span>
                      <span className="font-semibold">{selectedCareer?.skill_match_percentage || 0}%</span>
                    </div>
                    <ProgressBar value={selectedCareer?.skill_match_percentage || 0} color="#6366f1" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Overall fit probability</span>
                      <span className="font-semibold" style={{ color: getProbabilityColor(selectedCareer?.probability || 0) }}>
                        {selectedCareer?.probability || 0}%
                      </span>
                    </div>
                    <ProgressBar
                      value={selectedCareer?.probability || 0}
                      color={getProbabilityColor(selectedCareer?.probability || 0)}
                    />
                  </div>
                </div>

                {selectedCareer?.score_summary && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Scoring rationale</p>
                    <p className="text-sm leading-relaxed text-foreground">{cleanMarkdown(selectedCareer.score_summary)}</p>
                  </div>
                )}

                {/* Confidence evidence table */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    How strong your current evidence is
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    This shows how well each matched skill is evidenced in your resume — stronger evidence = higher score.
                  </p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="max-h-52 overflow-y-auto divide-y divide-border">
                      {(selectedCareer?.matched_skills || []).length > 0 ? (
                        selectedCareer.matched_skills.map((skill, idx) => {
                          const detail = getSkillDetail(skill);
                          const level = detail?.level || getSkillConfidenceLevel(skill);
                          const evidence = detail?.evidence?.length ? detail.evidence.join(", ") : "Not explicitly evidenced";
                          const levelColor = level === "high" ? "text-emerald-600" : level === "medium" ? "text-amber-600" : "text-slate-500";
                          return (
                            <div key={idx} className="p-3 text-xs hover:bg-muted/30 transition-colors">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="font-medium text-foreground">{cleanMarkdown(skill)}</span>
                                <span className={`font-semibold capitalize ${levelColor}`}>{level}</span>
                              </div>
                              <p className="text-muted-foreground truncate">{evidence}</p>
                            </div>
                          );
                        })
                      ) : (
                        <p className="p-4 text-xs text-muted-foreground">No evidence data available.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Next Steps ── */}
            {activeTab === "nextsteps" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm">Your recommended next steps</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Based on your gaps and quick wins, here's what we recommend you do first.
                  </p>
                </div>

                <div className="space-y-3">
                  {nextSteps.map((step, idx) => (
                    <div key={idx} className={`flex gap-3 p-4 rounded-xl border border-border ${step.bg}`}>
                      <div className="flex-shrink-0 mt-0.5">
                        <step.icon className={`w-5 h-5 ${step.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{step.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Re-analyze CTA */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={!resumeFile && !resumeData?.file}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    <ArrowRight className="w-3 h-3" /> Run a new analysis
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── SKILLS MODAL ─────────────────────────── */}
      {showSkillsModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={() => setShowSkillsModal(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowSkillsModal(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 id="modal-title" className="text-lg font-bold flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Your Detected Skills ({analysisResult?.total_skills_found || 0})
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Skills extracted from your resume, grouped by how strongly they're evidenced.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSkillsModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close skills panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Legend */}
            <div className="mb-4 pb-4 border-b border-border">
              <StatusLegend />
            </div>

            {(() => {
              const hasBuckets =
                (skillConfidenceLevels.high_confidence?.length || 0) +
                (skillConfidenceLevels.medium_confidence?.length || 0) +
                (skillConfidenceLevels.low_confidence?.length || 0) > 0;
              const hasUserSkills = (analysisResult?.user_skills?.length || 0) > 0;

              if (!hasUserSkills && !hasBuckets) {
                return (
                  <EmptyState
                    icon={Target}
                    title="No skills detected"
                    description="We couldn't parse specific skills from your resume. Try using a clearly formatted PDF with distinct skills, experience, and project sections."
                  />
                );
              }

              if (hasBuckets) {
                return (
                  <div className="space-y-6">
                    {[
                      { key: "high_confidence", label: "Strong evidence", sub: "Found in projects, experience, or certifications", level: "high" },
                      { key: "medium_confidence", label: "Some evidence", sub: "Listed but with limited demonstrated context", level: "medium" },
                      { key: "low_confidence", label: "Weak / mention-only", sub: "Appeared briefly — worth strengthening on your resume", level: "low" },
                    ].map(({ key, label, sub, level }) => {
                      const skills = skillConfidenceLevels[key] || [];
                      if (!skills.length) return null;
                      return (
                        <div key={key}>
                          <div className="mb-2">
                            <h4 className="text-sm font-semibold">{label} ({skills.length})</h4>
                            <p className="text-xs text-muted-foreground">{sub}</p>
                          </div>
                          <SkillListSection skills={skills} level={level} defaultVisible={12} />
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // Fallback: confidence buckets are empty but user_skills list exists
              return (
                <div>
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold">All detected skills ({analysisResult.user_skills.length})</h4>
                    <p className="text-xs text-muted-foreground">Confidence breakdown was not available for this analysis.</p>
                  </div>
                  <SkillListSection
                    skills={analysisResult.user_skills}
                    level="low"
                    defaultVisible={20}
                  />
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SkillsSnapshot — extracted for readability
// ─────────────────────────────────────────────

function SkillsSnapshot({ confidenceLevels, userSkills = [], totalSkillsFound = 0, onViewAll }) {
  const [open, setOpen] = useState(false);
  const high = confidenceLevels?.high_confidence?.length || 0;
  const medium = confidenceLevels?.medium_confidence?.length || 0;
  const low = confidenceLevels?.low_confidence?.length || 0;
  const bucketTotal = high + medium + low;
  // Use API's total_skills_found if confidence buckets are not populated
  const total = bucketTotal > 0 ? bucketTotal : (totalSkillsFound || userSkills.length);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <Target className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">How strong your current evidence is</span>
          <span className="text-xs text-muted-foreground">({total} skills total)</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-border space-y-4 pt-4">
          <p className="text-xs text-muted-foreground">
            This shows the breakdown of how confidently we can confirm each skill from your resume.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { count: high, label: "Strong", sub: "Well evidenced", color: "text-emerald-700", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { count: medium, label: "Moderate", sub: "Some evidence", color: "text-amber-700", bg: "bg-amber-500/10 border-amber-500/20" },
              { count: low, label: "Low exposure", sub: "Weak evidence", color: "text-slate-600", bg: "bg-slate-500/10 border-slate-500/20" },
            ].map(({ count, label, sub, color, bg }) => (
              <div key={label} className={`rounded-xl border p-3 text-center ${bg}`}>
                <div className={`text-xl font-bold ${color}`}>{count}</div>
                <div className="text-xs font-medium text-foreground mt-0.5">{label}</div>
                <div className="text-[11px] text-muted-foreground">{sub}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onViewAll}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            View all skills <ArrowRight className="w-3 h-3" />
          </button>
          <StatusLegend />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// LearningTimeline
// ─────────────────────────────────────────────

function LearningTimeline({ metadata = [] }) {
  const quickFixes = metadata.filter((m) => m.is_quick_fix);
  const shortTerm = metadata.filter((m) => !m.is_quick_fix && m.learning_days <= 30);
  const mediumTerm = metadata.filter((m) => m.learning_days > 30 && m.learning_days <= 90);
  const longTerm = metadata.filter((m) => m.learning_days > 90);
  const totalDays = metadata.reduce((s, m) => s + (m.learning_days || 0), 0);
  const totalMonths = Math.ceil(totalDays / 30);

  const tiers = [
    { items: quickFixes, label: "Quick wins (< 1 week)", color: "bg-emerald-500", icon: "⚡" },
    { items: shortTerm, label: "Short-term (1–4 weeks)", color: "bg-blue-500", icon: "📘" },
    { items: mediumTerm, label: "Medium-term (1–3 months)", color: "bg-amber-500", icon: "📚" },
    { items: longTerm, label: "Long-term (3+ months)", color: "bg-red-500", icon: "🎓" },
  ].filter((t) => t.items.length > 0);

  if (!tiers.length) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estimated learning timeline</p>
      <div className="flex flex-wrap gap-2">
        {tiers.map(({ items, label, color, icon }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${color} text-white font-bold rounded-full`}>
              {icon} {items.length}
            </span>
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-foreground font-medium">
        Total sequential time: ~{totalMonths} month{totalMonths !== 1 ? "s" : ""}
        <span className="text-muted-foreground font-normal"> (parallel learning may be faster)</span>
      </p>
    </div>
  );
}

export default SkillGapAnalyzer;
