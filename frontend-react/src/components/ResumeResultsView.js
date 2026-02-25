import React, { useState } from "react";
import ResumeReportModal from "./ResumeReportModal";
import {
  Upload, FileText, Zap, AlertTriangle, ChevronRight,
  CheckCircle, XCircle, ArrowRight,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────
const pct = (v) => Math.round(v ?? 0);

function ScoreRing({ score }) {
  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={radius} fill="transparent" stroke="#e5e7eb" strokeWidth="14" />
      <circle
        cx="70" cy="70" r={radius} fill="transparent"
        stroke={color} strokeWidth="14"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 70 70)"
      />
      <text x="50%" y="50%" dy=".35em" textAnchor="middle" fontSize="30" fontWeight="bold" fill={color}>
        {score}
      </text>
    </svg>
  );
}

function DimBar({ label, value }) {
  const v = pct(value);
  const color = v >= 75 ? "bg-green-500" : v >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex text-xs justify-between mb-1 text-muted-foreground">
        <span>{label}</span><span className="font-semibold text-foreground">{v}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────
// Props:
//   resumeData    — the full analysis object
//   onUploadAnother — callback to switch back to the upload view (no navigation)
export default function ResumeResultsView({ resumeData, onUploadAnother }) {
  const [showReport, setShowReport] = useState(false);

  if (!resumeData) {
    return (
      <div className="flex flex-col items-center gap-4 text-center p-12">
        <p className="text-muted-foreground">No analysis data yet. Upload a resume to get started.</p>
        <button
          onClick={onUploadAnother}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Upload className="w-4 h-4" />
          Upload Resume
        </button>
      </div>
    );
  }

  const {
    filename,
    ats_score = 0,
    score_zone,
    structure_score,
    completeness_score,
    relevance_score,
    impact_score,
    ats_analysis = {},
    analysis = {},
    // top-level fields (from API spread)
    structure_suggestions: topLevelStructure = [],
    honest_improvements = [],
    bullet_rewrites = [],
    ready_skills = [],
    critical_gaps = [],
    overall_readiness,
  } = resumeData;

  // structure_suggestions may be top-level OR nested inside analysis/ats_analysis
  const structure_suggestions =
    topLevelStructure.length > 0
      ? topLevelStructure
      : analysis?.structure_suggestions || ats_analysis?.structure_suggestions || [];
  const readability_issues = ats_analysis?.readability_issues || [];
  const topIssues = [...structure_suggestions, ...readability_issues, ...honest_improvements].slice(0, 5);

  const zoneColor =
    score_zone === "Strong, minor refinements needed"
      ? "bg-green-100 text-green-800 border-green-200"
      : score_zone === "Good foundation, clear gaps"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-red-100 text-red-800 border-red-200";

  return (
    <>
      {showReport && (
        <ResumeReportModal resumeData={resumeData} onClose={() => setShowReport(false)} />
      )}

      <div className="space-y-5">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Resume Analysis</h1>
            {filename && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {filename}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onUploadAnother}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Another
            </button>
            <button
              onClick={() => setShowReport(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              View Full Report
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Score card ──────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col sm:flex-row gap-6 items-center sm:items-start">
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <ScoreRing score={pct(ats_score)} />
            {score_zone && (
              <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${zoneColor}`}>
                {score_zone}
              </span>
            )}
          </div>
          <div className="flex-1 w-full space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">Score Breakdown</p>
            <DimBar label="Structure & Formatting" value={structure_score} />
            <DimBar label="Section Completeness" value={completeness_score} />
            <DimBar label="Keyword & Relevance" value={relevance_score} />
            <DimBar label="Impact & Specificity" value={impact_score} />
            <p className="text-xs text-muted-foreground pt-1">
              For keywords, detailed breakdown &amp; learning roadmap,{" "}
              <button
                onClick={() => setShowReport(true)}
                className="text-primary underline underline-offset-2 font-medium hover:opacity-80"
              >
                View Full Report
              </button>.
            </p>
          </div>
        </div>

        {/* ── Top Issues ──────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Top Issues to Fix
            </h2>
            <button onClick={() => setShowReport(true)} className="text-xs text-primary flex items-center gap-1 hover:opacity-80">
              See all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {topIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No issues found.</p>
          ) : (
            <div className="space-y-2">
              {topIssues.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold leading-snug">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Skill & Role Fit ────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            Skill &amp; Role Fit
          </h2>
          {overall_readiness && (
            <p className="text-sm text-muted-foreground italic mb-3 leading-relaxed">{overall_readiness}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Strengths ({ready_skills.length})
              </p>
              {ready_skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {ready_skills.map((s, i) => (
                    <span key={i} className="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs rounded-full border border-green-200">
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">None identified.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                Critical Gaps ({critical_gaps.length})
              </p>
              {critical_gaps.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {critical_gaps.map((s, i) => (
                    <span key={i} className="px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs rounded-full border border-red-200">
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">None identified.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Bullet Rewrites ─────────────────────────────────────────────── */}
        {bullet_rewrites.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
              <FileText className="w-4 h-4 text-blue-500" />
              Bullet Rewrites
            </h2>
            <div className="space-y-4">
              {bullet_rewrites.slice(0, 3).map((item, i) => (
                <div key={i} className="border border-border rounded-lg overflow-hidden text-sm">
                  <div className="bg-muted/50 px-3 py-2">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Original</p>
                    <p className="leading-snug">{item.original}</p>
                  </div>
                  {item.rewrite_question && (
                    <div className="px-3 py-2 border-t border-border bg-blue-50 dark:bg-blue-950/20">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">{item.rewrite_question}</p>
                    </div>
                  )}
                  <div className="bg-green-50 dark:bg-green-950/20 px-3 py-2 border-t border-border">
                    <p className="text-xs text-green-700 dark:text-green-400 font-semibold uppercase tracking-wide mb-1">Rewritten</p>
                    <p className="leading-snug">{item.suggested_rewrite || item.rewritten}</p>
                  </div>
                </div>
              ))}
              {bullet_rewrites.length > 3 && (
                <button
                  onClick={() => setShowReport(true)}
                  className="w-full text-xs text-center text-primary flex items-center justify-center gap-1 hover:opacity-80 py-1"
                >
                  +{bullet_rewrites.length - 3} more in full report <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">Ready for the deep dive?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Full keyword table, skill breakdown, learning roadmap &amp; more.
            </p>
          </div>
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex-shrink-0"
          >
            View Full Report <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
