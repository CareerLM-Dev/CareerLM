// src/components/ResumeOptimizer.js
import React, { useState } from "react";
import ATSScore from "./ATSScore";
import { formatText } from "../utils/textFormatter";
import {
  FileText, AlertTriangle, Zap, CheckCircle,
  ChevronDown, Download, Share2
} from "lucide-react";

// ── Collapsible section — stays open independently ────────────────────────────
function Section({ id, title, subtitle, icon: Icon, iconBg, iconColor, badge, badgeBg, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div
        className={`flex items-center justify-between p-4 md:p-5 cursor-pointer transition-colors ${iconBg} hover:opacity-90`}
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`${iconBg} rounded-lg p-2 md:p-2.5 flex-shrink-0 bg-opacity-30`}>
            <Icon className={`w-4 h-4 md:w-5 md:h-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-base md:text-lg font-semibold truncate">{title}</h4>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          {badge !== undefined && (
            <span className={`${badgeBg} text-white px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-bold`}>
              {badge}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {open && (
        <div className="p-4 md:p-5 border-t border-border bg-card">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Issue card ────────────────────────────────────────────────────────────────
function IssueCard({ item, accent = "amber" }) {
  const colors = {
    amber: "border-amber-500/20 bg-amber-500/5",
    red:   "border-red-500/20 bg-red-500/5",
    blue:  "border-blue-500/20 bg-blue-500/5",
    slate: "border-slate-500/20 bg-slate-500/5",
  };
  return (
    <div className={`p-4 rounded-lg border ${colors[accent]}`}>
      <h5 className="text-sm font-semibold">{item.title}</h5>
      {item.explanation && <p className="text-xs text-muted-foreground mt-2">{item.explanation}</p>}
      {item.evidence && (
        <p className="text-xs text-foreground mt-2">
          <strong>Evidence:</strong> {item.evidence}
        </p>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function Empty({ message = "Nothing to show here." }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-primary">
      <CheckCircle className="w-5 h-5" />
      <span className="font-medium">{message}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function ResumeOptimizer({ resumeData }) {
  const [showAllIssues, setShowAllIssues] = useState(false);

  if (!resumeData) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="bg-muted rounded-full p-6">
              <FileText className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold">No Resume Analyzed Yet</h3>
            <p className="text-muted-foreground max-w-md">
              Upload a resume to see optimization results and score analysis.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (resumeData.error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-destructive mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-destructive mb-2">Analysis Error</h3>
              <p className="text-sm text-destructive/90">{resumeData.error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Pull data from consolidated summary/detailed or fall back to flat fields ──
  const summary   = resumeData.summary   || {};
  const detailed  = resumeData.detailed  || {};

  const overallScore    = summary.overall_score    ?? resumeData.ats_score;
  const scoreZone       = summary.score_zone       ?? resumeData.score_zone;
  const dimScores       = summary.dimension_scores ?? resumeData.ats_analysis?.component_scores;
  const justification   = detailed.score_justification ?? resumeData.ats_analysis?.justification;
  const weakest         = summary.weakest_dimension;

  // Top issues: use consolidated list or fall back
  const allIssues = detailed.all_issues ?? [
    ...(resumeData.honest_improvements || []).map(i => ({ ...i, dimension: "Impact & Specificity" })),
    ...(resumeData.analysis?.structure_suggestions || []).map(i => ({ ...i, dimension: "Structure" })),
    ...(resumeData.ats_analysis?.readability_issues || []).map(i => ({ ...i, dimension: "Completeness" })),
  ];
  const topIssues     = summary.top_issues ?? allIssues.slice(0, 5);
  const visibleIssues = showAllIssues ? allIssues : topIssues;

  const skillsAnalysis   = resumeData.skills_analysis  || [];
  const keywordGapTable  = detailed.keyword_gap_table  ?? resumeData.keyword_gap_table ?? [];
  const bulletRewrites   = detailed.bullet_rewrites     ?? resumeData.bullet_rewrites  ?? [];
  const learningPriorities = detailed.learning_priorities ?? resumeData.learning_priorities ?? [];
  const hasJD            = summary.has_job_description  ?? resumeData.has_job_description;

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-border rounded-xl p-4 md:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 rounded-lg p-2 md:p-3">
              <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg md:text-xl font-bold">Resume Analysis Results</h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">
                <span className="font-medium text-foreground">{resumeData.filename}</span> • Analyzed successfully
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors">
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* Score — always visible */}
      {overallScore !== null && overallScore !== undefined && (
        <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm">
          <ATSScore
            score={overallScore}
            scoreZone={scoreZone}
            componentScores={dimScores}
            justification={justification}
            weakestDimension={weakest}
          />
        </div>
      )}

      {/* 1 — Top Issues */}
      <Section
        title="Top Issues to Fix"
        subtitle={`${topIssues.length} prioritised actions${allIssues.length > topIssues.length ? ` · ${allIssues.length} total` : ''}`}
        icon={AlertTriangle}
        iconBg="bg-destructive/5"
        iconColor="text-destructive"
        badge={topIssues.length}
        badgeBg="bg-destructive"
      >
        {visibleIssues.length > 0 ? (
          <div className="space-y-3">
            {visibleIssues.map((issue, idx) => (
              <div key={idx} className="p-4 bg-destructive/5 rounded-lg border border-destructive/20">
                <div className="flex items-start gap-3">
                  <span className="text-destructive font-bold text-sm mt-0.5 flex-shrink-0">#{idx + 1}</span>
                  <div className="flex-1">
                    {issue.dimension && (
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {issue.dimension}
                      </span>
                    )}
                    <h5 className="text-sm font-semibold mt-0.5">{issue.title}</h5>
                    {issue.explanation && <p className="text-xs text-muted-foreground mt-1">{issue.explanation}</p>}
                    {issue.evidence && (
                      <p className="text-xs text-foreground mt-1"><strong>Evidence:</strong> {issue.evidence}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {allIssues.length > topIssues.length && (
              <button
                onClick={() => setShowAllIssues(s => !s)}
                className="w-full py-2 text-sm text-primary font-medium hover:underline"
              >
                {showAllIssues ? 'Show less' : `Show all ${allIssues.length} issues`}
              </button>
            )}
          </div>
        ) : (
          <Empty message="No issues found — great resume!" />
        )}
      </Section>

      {/* 2 — Skills Analysis */}
      {skillsAnalysis.length > 0 && (
        <Section
          title="Skills Analysis"
          subtitle="Readiness based on your resume"
          icon={CheckCircle}
          iconBg="bg-emerald-500/5"
          iconColor="text-emerald-600"
          badge={skillsAnalysis.length}
          badgeBg="bg-emerald-600"
        >
          <div className="space-y-3">
            {skillsAnalysis.map((item, idx) => {
              const statusColors = {
                present: "border-green-500/30 bg-green-500/5 text-green-700",
                missing: "border-red-500/30 bg-red-500/5 text-red-700",
                implied: "border-amber-500/30 bg-amber-500/5 text-amber-700",
              };
              return (
                <div key={idx} className={`p-4 rounded-lg border ${statusColors[item.status] || "border-border bg-muted/30 text-foreground"}`}>
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-semibold">{item.skill}</h5>
                    <span className="text-xs font-medium uppercase">{item.status}</span>
                  </div>
                  {item.explanation && <p className="text-xs text-muted-foreground mt-2">{item.explanation}</p>}
                  {item.evidence && (
                    <p className="text-xs mt-2"><strong>Evidence:</strong> {item.evidence}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* 3 — Keyword Alignment */}
      {keywordGapTable.length > 0 && (
        <Section
          title={hasJD ? "JD Keyword Alignment" : "Role Baseline Alignment"}
          subtitle={hasJD ? "Exact gaps vs the job description" : "General baseline for your target role"}
          icon={Zap}
          iconBg="bg-blue-500/5"
          iconColor="text-blue-600"
          badge={`${keywordGapTable.filter(k => k.status === "missing").length} missing`}
          badgeBg="bg-blue-700"
        >
          {!hasJD && (
            <p className="text-xs text-muted-foreground italic mb-3">
              No job description provided. This is a general role baseline, not a specific company's requirements.
            </p>
          )}
          <div className="space-y-2">
            {keywordGapTable.map((item, idx) => {
              const statusColors = {
                present:          "border-green-500/30 bg-green-500/5",
                missing:          "border-red-500/30 bg-red-500/5",
                partially_present:"border-amber-500/30 bg-amber-500/5",
              };
              const badgeColors = {
                present:          "bg-green-100 text-green-800",
                missing:          "bg-red-100 text-red-800",
                partially_present:"bg-amber-100 text-amber-800",
              };
              const status = item.status || "unknown";
              return (
                <div key={idx} className={`p-3 rounded-lg border ${statusColors[status] || "border-border bg-muted/30"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.keyword}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColors[status] || "bg-muted text-muted-foreground"}`}>
                      {status.replace("_", " ")}
                    </span>
                  </div>
                  {item.jd_context && (
                    <p className="text-xs text-muted-foreground mt-1"><strong>Reason:</strong> {item.jd_context}</p>
                  )}
                  {item.resume_evidence && item.resume_evidence !== "Not found in resume" && (
                    <p className="text-xs text-muted-foreground mt-1"><strong>In resume:</strong> {item.resume_evidence}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* 4 — Bullet Rewrites (detailed, optional) */}
      {bulletRewrites.length > 0 && (
        <Section
          title="Bullet Rewrites"
          subtitle="Suggested before/after improvements"
          icon={Zap}
          iconBg="bg-amber-500/5"
          iconColor="text-amber-600"
          badge={bulletRewrites.length}
          badgeBg="bg-amber-600"
        >
          <div className="space-y-4">
            {bulletRewrites.map((item, idx) => (
              <div key={idx} className="space-y-2">
                <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <p className="text-xs font-medium text-red-700 mb-1">Before</p>
                  <p className="text-sm text-foreground">{item.before}</p>
                </div>
                <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                  <p className="text-xs font-medium text-green-700 mb-1">After</p>
                  <p className="text-sm text-foreground">{item.after}</p>
                </div>
                {item.reason && (
                  <p className="text-xs text-muted-foreground px-1">{item.reason}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 5 — Learning Priorities (only if meaningful) */}
      {learningPriorities.length > 0 && (
        <Section
          title="Learning Priorities"
          subtitle="Skills worth developing for this role"
          icon={Zap}
          iconBg="bg-violet-500/5"
          iconColor="text-violet-600"
          badge={learningPriorities.length}
          badgeBg="bg-violet-700"
        >
          <div className="space-y-2">
            {learningPriorities.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg">
                <span className="text-violet-700 font-bold text-sm flex-shrink-0">#{idx + 1}</span>
                <span className="text-sm text-foreground">{item}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

    </div>
  );
}

export default ResumeOptimizer;