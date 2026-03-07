import React from "react";
import {
  Upload, FileText, CheckCircle, XCircle, Zap,
} from "lucide-react";

function FeedbackList({ items, icon: Icon, emptyLabel, showBulletRewrite = false }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 p-3 bg-muted/40 border border-border rounded-lg">
          <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="w-full">
            <p className="text-sm font-semibold leading-snug">{item.suggestion || item.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.explanation}</p>
            {showBulletRewrite && item.bullet_rewrite && (
              <div className="mt-2 p-2 bg-primary/5 border border-primary/20 rounded text-xs font-mono text-foreground">
                ↳ {item.bullet_rewrite}
              </div>
            )}
            {!showBulletRewrite && item.evidence && (
              <p className="text-xs text-muted-foreground mt-1">Evidence: {item.evidence}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────
// Props:
//   resumeData    — the full analysis object
//   onUploadAnother — callback to switch back to the upload view (no navigation)
export default function ResumeResultsView({ resumeData, onUploadAnother }) {
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
    ats_score,
    structure_score,
    completeness_score,
    relevance_score,
    impact_score,
    strengths = [],
    weaknesses = [],
    suggestions = [],
  } = resumeData;

  return (
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
          </div>
        </div>
        {/* ── Scores ─────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-3">Score Breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">ATS</p>
              <p className="text-lg font-semibold">{ats_score ?? "--"}</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Structure</p>
              <p className="text-lg font-semibold">{structure_score ?? "--"}</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Completeness</p>
              <p className="text-lg font-semibold">{completeness_score ?? "--"}</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Relevance</p>
              <p className="text-lg font-semibold">{relevance_score ?? "--"}</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Impact</p>
              <p className="text-lg font-semibold">{impact_score ?? "--"}</p>
            </div>
          </div>
        </div>

        {/* ── Strengths ─────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            Strengths
          </h2>
          <FeedbackList items={strengths} icon={CheckCircle} emptyLabel="No strengths identified yet." />
        </div>

        {/* ── Weaknesses ─────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
            <XCircle className="w-4 h-4 text-rose-600" />
            Weaknesses
          </h2>
          <FeedbackList items={weaknesses} icon={XCircle} emptyLabel="No weaknesses identified yet." />
        </div>

        {/* ── Suggestions ───────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            Suggestions
          </h2>
          <FeedbackList items={suggestions} icon={Zap} emptyLabel="No suggestions yet." showBulletRewrite />
        </div>
      </div>
  );
}
