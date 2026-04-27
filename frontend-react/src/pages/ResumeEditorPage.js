// src/pages/ResumeEditorPage.js
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Sparkles,
  Check,
  X,
} from "lucide-react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
const RESUME_API = `${API_BASE}/api/v1/orchestrator`;

const SECTION_LABELS = {
  contact: "Contact",
  summary: "Summary / Objective",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  coursework: "Coursework",
  awards: "Awards & Achievements",
  unknown: "General",
  general: "General",
};

function formatSectionLabel(key) {
  if (!key) return "Other";
  return SECTION_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Single bullet rewrite card ──────────────────────────────────────────────
function BulletRewriteCard({ item, versionId, onApplied, onDismiss }) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [applied, setApplied] = useState(false);

  const original = item.original_text || item.before || "";
  const rewrite  = item.rewrite_text  || item.after  || item.bullet_rewrite || "";
  const reason   = item.explanation   || item.reason  || "";

  const handleApply = async () => {
    if (!versionId) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`${RESUME_API}/editor/${versionId}/apply-suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestion_id: item.suggestion_id,
          section_key: item.section_key,
          original_text: original,
          rewrite_text: rewrite,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to apply");
      setApplied(true);
      onApplied(item.suggestion_id, data.new_version_id, data.updated_sections);
    } catch (err) {
      setError(err.message || "Could not apply suggestion.");
    } finally {
      setApplying(false);
    }
  };

  if (applied) return null; // Remove card after successful apply

  return (
    <div className="rounded-xl border border-border bg-card/95 overflow-hidden shadow-sm hover:shadow-md transition-shadow ring-1 ring-border/40">
      {/* Section badge */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-0">
        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
          <Sparkles className="w-3 h-3" />
          {formatSectionLabel(item.section_key)}
        </span>
        <span className="text-xs text-muted-foreground">Bullet Rewrite</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Original */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
            Original
          </p>
          <div className="bg-red-500/5 border border-red-300/40 dark:border-red-800/40 rounded-lg px-3 py-2.5">
            <p className="text-sm text-foreground leading-relaxed">{original || "—"}</p>
          </div>
        </div>

        {/* Divider arrow */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs">AI Rewrite ↓</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Rewrite */}
        <div>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1 uppercase tracking-wide">
            Suggested
          </p>
          <div className="bg-emerald-500/5 border border-emerald-300/40 dark:border-emerald-800/40 rounded-lg px-3 py-2.5">
            <p className="text-sm text-foreground leading-relaxed">{rewrite || "—"}</p>
          </div>
        </div>

        {/* Why */}
        {reason && (
          <p className="text-xs text-muted-foreground italic">
            <span className="font-medium not-italic">Why: </span>{reason}
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleApply}
            disabled={applying}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm"
          >
            {applying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Applying…
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Apply
              </>
            )}
          </button>
          <button
            onClick={() => onDismiss(item.suggestion_id)}
            disabled={applying}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Improvement tip card ──────────────────────────────────────────────────────
function ImprovementCard({ item, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  const title = item.suggestion || item.title || "Improvement";
  const explanation = item.explanation || "";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="bg-blue-500/10 rounded-lg p-1.5 flex-shrink-0 mt-0.5">
          <Lightbulb className="w-4 h-4 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {!expanded && explanation && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{explanation}</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {explanation && <p className="text-sm text-muted-foreground">{explanation}</p>}
          <div className="flex justify-end">
            <button
              onClick={() => onDismiss(item.suggestion_id)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumeEditorSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-background animate-pulse">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card gap-4">
        <div className="flex items-center gap-3">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-px bg-border" />
          <div>
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-3 w-40 bg-muted rounded mt-2" />
          </div>
        </div>
        <div className="h-9 w-28 bg-muted rounded" />
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="w-[420px] flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
            <div className="h-8 w-32 bg-muted rounded" />
            <div className="h-8 w-24 bg-muted rounded" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {[...Array(3)].map((_, idx) => (
              <div key={idx} className="h-36 bg-muted rounded-xl" />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-40 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="h-20 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ResumeEditorPage() {
  const { session } = useUser();
  const user = session?.user;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const versionIdParam = searchParams.get("versionId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [versionId, setVersionId] = useState(
    versionIdParam ? parseInt(versionIdParam) : null
  );
  const [sections, setSections] = useState({});
  const [bulletRewrites, setBulletRewrites] = useState([]);
  const [improvements, setImprovements] = useState([]);
  const [atsScore, setAtsScore] = useState(null);
  const [scoreDelta, setScoreDelta] = useState(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [isRescoring, setIsRescoring] = useState(false);
  const [rescoreError, setRescoreError] = useState(null);
  const [activeTab, setActiveTab] = useState("rewrites"); // "rewrites" | "tips"
  const [expandedSections, setExpandedSections] = useState({});

  // ── Load resume data ──────────────────────────────────────────────────────
  const loadEditorData = useCallback(async (vid) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${RESUME_API}/editor/${vid}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load resume");

      const resolvedSections = (() => {
        const raw = data.sections;
        if (!raw) return {};
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw);
            return typeof parsed === "object" && parsed ? parsed : {};
          } catch (_) {
            return {};
          }
        }
        return typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      })();

      const applied = Array.isArray(data.applied_suggestion_ids)
        ? data.applied_suggestion_ids
        : [];

      const incoming = data.suggestions || { bullet_rewrites: [], improvements: [] };
      setBulletRewrites(
        (incoming.bullet_rewrites || []).filter(
          (s) => !applied.includes(s.suggestion_id)
        )
      );
      setImprovements(
        (incoming.improvements || []).filter(
          (s) => !applied.includes(s.suggestion_id)
        )
      );
      setSections(resolvedSections);
      setAtsScore(data.ats_score ?? null);
      setScoreDelta(data.score_delta ?? null);
      setVersionId(vid);

      // Expand all resume sections by default
      const exp = {};
      Object.keys(data.sections || {}).forEach((k) => { exp[k] = true; });
      setExpandedSections(exp);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLatestVersion = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${RESUME_API}/user/${user.id}/latest-version`);
      const data = await res.json();
      if (data.success && data.version_id) {
        await loadEditorData(data.version_id);
      } else {
        setError("No resume found. Please upload a resume first.");
        setLoading(false);
      }
    } catch (err) {
      setError("Failed to load your resume. Please try again.");
      setLoading(false);
    }
  }, [user?.id, loadEditorData]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setError("Please sign in to load your resume.");
      return;
    }

    if (versionIdParam) {
      loadEditorData(parseInt(versionIdParam));
    } else {
      loadLatestVersion();
    }
  }, [versionIdParam, loadEditorData, loadLatestVersion, user?.id]);

  // ── Apply callback ────────────────────────────────────────────────────────
  const handleApplied = useCallback((appliedId, newVersionId, updatedSections) => {
    setBulletRewrites((prev) => prev.filter((s) => s.suggestion_id !== appliedId));
    if (updatedSections) setSections(updatedSections);
    if (newVersionId) setVersionId(newVersionId);
    setAppliedCount((c) => c + 1);
  }, []);

  const handleDismissRewrite = useCallback((sid) => {
    setBulletRewrites((prev) => prev.filter((s) => s.suggestion_id !== sid));
  }, []);

  const handleDismissImprovement = useCallback((sid) => {
    setImprovements((prev) => prev.filter((s) => s.suggestion_id !== sid));
  }, []);

  // ── Rescore ───────────────────────────────────────────────────────────────
  const handleRescore = useCallback(async () => {
    if (!versionId) return;
    setIsRescoring(true);
    setRescoreError(null);
    try {
      const res = await fetch(`${RESUME_API}/editor/${versionId}/rescore`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to rescore");
      
      setAtsScore(data.ats_score ?? null);
      setScoreDelta(data.score_delta ?? null);

      if (data.new_analysis && data.new_analysis.suggestions) {
        // Reset applied count because these are fresh suggestions based on the new resume state
        setAppliedCount(0);
        
        let allSuggestions = [];
        if (Array.isArray(data.new_analysis.suggestions)) {
          allSuggestions = data.new_analysis.suggestions;
        } else if (typeof data.new_analysis.suggestions === "object") {
          allSuggestions = [
            ...(data.new_analysis.suggestions.bullet_rewrites || []),
            ...(data.new_analysis.suggestions.improvements || [])
          ];
        }

        setBulletRewrites(allSuggestions.filter(s => s.suggestion_id?.startsWith("br_") || !!s.bullet_rewrite));
        setImprovements(allSuggestions.filter(s => s.suggestion_id?.startsWith("impr_") && !s.bullet_rewrite));
      }

    } catch (err) {
      setRescoreError(err.message || "Unable to rescore right now.");
    } finally {
      setIsRescoring(false);
    }
  }, [versionId]);

  // ── Score colour ──────────────────────────────────────────────────────────
  const scoreColor =
    atsScore === null
      ? "text-muted-foreground"
      : atsScore >= 85
      ? "text-emerald-500"
      : atsScore >= 65
      ? "text-amber-500"
      : "text-red-500";

  const previousScore =
    scoreDelta !== null && atsScore !== null
      ? atsScore - scoreDelta
      : null;

  const deltaBadgeClass =
    scoreDelta !== null && scoreDelta >= 0
      ? "bg-emerald-500/10 text-emerald-600"
      : "bg-rose-500/10 text-rose-600";

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return <ResumeEditorSkeleton />;
  }

  // ── Error (no sections loaded) ────────────────────────────────────────────
  if (error && Object.keys(sections).length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="bg-card border border-border rounded-xl p-8 max-w-sm text-center space-y-4">
          <div className="bg-destructive/10 rounded-full p-4 w-fit mx-auto">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Unable to Load Resume</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => navigate("/dashboard")}
              className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80"
            >
              Dashboard
            </button>
            <button
              onClick={loadLatestVersion}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalRewrites = bulletRewrites.length;
  const totalTips = improvements.length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard/resume-analyzer")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="h-4 w-px bg-border" />
          <div>
            <p className="text-sm font-semibold">Resume Editor</p>
            <p className="text-xs text-muted-foreground">
              {appliedCount > 0
                ? `${appliedCount} change${appliedCount !== 1 ? "s" : ""} applied`
                : "Apply AI suggestions to improve your score"}
            </p>
          </div>
        </div>

        {/* Score + Rescore */}
        <div className="flex items-center gap-3">
          {atsScore !== null && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/80 px-3 py-2 shadow-sm">
              <div className="text-right">
                <p className={`text-2xl font-bold ${scoreColor}`}>{atsScore}</p>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Current ATS</p>
              </div>
              {scoreDelta !== null && (
                <div className="border-l border-border pl-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Before</p>
                  <p className="text-sm font-semibold text-foreground">
                    {previousScore ?? "—"}
                  </p>
                  <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${deltaBadgeClass}`}>
                    {scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta} delta
                  </span>
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleRescore}
            disabled={isRescoring || appliedCount === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-primary-foreground bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 transition-all"
          >
            {isRescoring ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Rescore
          </button>
        </div>
      </div>

      {/* rescore error */}
      {rescoreError && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-5 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {rescoreError}
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">

        {/* Left — AI Suggestions ──────────────────────────────────────── */}
        <div className="w-[420px] flex-shrink-0 border-r border-border flex flex-col overflow-hidden">

          {/* Tab switcher */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-border bg-card">
            <button
              onClick={() => setActiveTab("rewrites")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "rewrites"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Bullet Rewrites
              {totalRewrites > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === "rewrites" ? "bg-primary-foreground/20" : "bg-muted"}`}>
                  {totalRewrites}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("tips")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "tips"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              Tips
              {totalTips > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === "tips" ? "bg-primary-foreground/20" : "bg-muted"}`}>
                  {totalTips}
                </span>
              )}
            </button>
          </div>

          {/* Suggestion list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeTab === "rewrites" && (
              <>
                {bulletRewrites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    <div>
                      <p className="text-sm font-semibold">All done!</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        No more bullet rewrites. Rescore to see your updated ATS score.
                      </p>
                    </div>
                  </div>
                ) : (
                  bulletRewrites.map((item) => (
                    <BulletRewriteCard
                      key={item.suggestion_id}
                      item={item}
                      versionId={versionId}
                      onApplied={handleApplied}
                      onDismiss={handleDismissRewrite}
                    />
                  ))
                )}
              </>
            )}

            {activeTab === "tips" && (
              <>
                {improvements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    <p className="text-sm font-semibold">No tips remaining.</p>
                  </div>
                ) : (
                  improvements.map((item) => (
                    <ImprovementCard
                      key={item.suggestion_id || Math.random()}
                      item={item}
                      onDismiss={handleDismissImprovement}
                    />
                  ))
                )}
              </>
            )}
          </div>
        </div>

        {/* Right — Resume Sections preview ────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold">Resume Sections</h2>
            <p className="text-xs text-muted-foreground">
              Sections update live as you apply rewrites
            </p>
          </div>

          {Object.keys(sections).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              No sections found in this resume version.
            </div>
          ) : (
            Object.entries(sections).map(([key, text]) => {
              if (!text || !text.trim()) return null;
              const isExpanded = expandedSections[key] !== false;
              return (
                <div key={key} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 border-l-4 border-primary/30 hover:bg-muted/30 transition-colors"
                    onClick={() =>
                      setExpandedSections((prev) => ({ ...prev, [key]: !isExpanded }))
                    }
                  >
                    <span className="text-sm font-semibold">{formatSectionLabel(key)}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border pt-3">
                      <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                        {text}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
