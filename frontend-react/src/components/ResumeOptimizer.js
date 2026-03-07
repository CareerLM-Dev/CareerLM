// src/components/ResumeOptimizer.js
import React from "react";
import { FileText, CheckCircle, XCircle, Zap, Upload } from "lucide-react";

// ── Strength / Weakness list ──────────────────────────────────────────────────
function FeedbackList({ items, icon: Icon, emptyLabel }) {
  if (!items || !items.length) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-primary">
        <CheckCircle className="w-4 h-4" />
        <span className="text-sm font-medium">{emptyLabel}</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 p-3 bg-muted/40 border border-border rounded-lg">
          <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold leading-snug">{item.title}</p>
            {item.explanation && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.explanation}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Suggestions list (with bullet_rewrite) ────────────────────────────────────
function SuggestionList({ items }) {
  if (!items || !items.length) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-primary">
        <CheckCircle className="w-4 h-4" />
        <span className="text-sm font-medium">No suggestions — looking good!</span>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="p-3 bg-muted/40 border border-border rounded-lg space-y-1.5">
          <p className="text-sm font-semibold leading-snug">{item.suggestion || item.title}</p>
          {item.explanation && (
            <p className="text-xs text-muted-foreground leading-relaxed">{item.explanation}</p>
          )}
          {item.bullet_rewrite && (
            <div className="mt-2 p-2 bg-primary/5 border border-primary/20 rounded text-xs font-mono text-foreground">
              ↳ {item.bullet_rewrite}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function ResumeOptimizer({ resumeData, onUploadAnother }) {
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
              Upload a resume to see optimization results.
            </p>
            {onUploadAnother && (
              <button
                onClick={onUploadAnother}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
              >
                <Upload className="w-4 h-4" />
                Upload Resume
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const strengths   = resumeData.strengths   || [];
  const weaknesses  = resumeData.weaknesses  || [];
  const suggestions = resumeData.suggestions || [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-border rounded-xl p-4 md:p-5">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 rounded-lg p-2 md:p-3">
            <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg md:text-xl font-bold">Resume Analysis</h3>
            {resumeData.filename && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {resumeData.filename}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Strengths */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          Strengths
        </h2>
        <FeedbackList items={strengths} icon={CheckCircle} emptyLabel="No strengths identified yet." />
      </div>

      {/* Weaknesses */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
          <XCircle className="w-4 h-4 text-rose-600" />
          Weaknesses
        </h2>
        <FeedbackList items={weaknesses} icon={XCircle} emptyLabel="No weaknesses identified yet." />
      </div>

      {/* Suggestions */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
          <Zap className="w-4 h-4 text-primary" />
          Suggestions
        </h2>
        <SuggestionList items={suggestions} />
      </div>
    </div>
  );
}

