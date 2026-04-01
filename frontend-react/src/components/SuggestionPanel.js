// src/components/SuggestionPanel.js
import React, { useState, useMemo } from "react";
import {
  Lightbulb, Check, X, ChevronDown, ChevronUp,
  Sparkles, ArrowRight, RefreshCw
} from "lucide-react";

// Section label mapping
const SECTION_LABELS = {
  contact: "Contact",
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  coursework: "Coursework",
  awards: "Awards",
  unknown: "General",
  general: "General"
};

// Suggestion card for bullet rewrites
function BulletRewriteCard({ suggestion, onApply, onDismiss, isApplying }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const before = suggestion.before || suggestion.original || "";
  const after = suggestion.after || suggestion.rewritten || "";
  const reason = suggestion.reason || "";
  const sectionKey = suggestion.section_key || "unknown";

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-md transition-all">
      {/* Header */}
      <div 
        className="flex items-start gap-3 p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="bg-amber-500/10 rounded-lg p-2 flex-shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded">
              {SECTION_LABELS[sectionKey] || sectionKey}
            </span>
            <span className="text-xs text-muted-foreground">Bullet Rewrite</span>
          </div>
          <p className="text-sm text-foreground line-clamp-2">{before}</p>
        </div>
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {/* Before */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Original:</p>
            <p className="text-sm bg-red-500/5 border border-red-500/20 rounded p-2 text-foreground">
              {before}
            </p>
          </div>

          {/* After */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Suggested:</p>
            <p className="text-sm bg-green-500/5 border border-green-500/20 rounded p-2 text-foreground">
              {after}
            </p>
          </div>

          {/* Reason */}
          {reason && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Why:</p>
              <p className="text-xs text-muted-foreground">{reason}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApply(suggestion);
              }}
              disabled={isApplying}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {isApplying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Apply
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(suggestion);
              }}
              className="flex items-center justify-center gap-2 bg-muted text-muted-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted/80 transition-all"
            >
              <X className="w-4 h-4" />
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Suggestion card for improvements
function ImprovementCard({ suggestion, onDismiss }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const title = suggestion.title || "Improvement Suggestion";
  const explanation = suggestion.explanation || "";
  const evidence = suggestion.evidence || "";
  const sectionKey = suggestion.section_key || "general";

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-md transition-all">
      {/* Header */}
      <div 
        className="flex items-start gap-3 p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="bg-blue-500/10 rounded-lg p-2 flex-shrink-0 mt-0.5">
          <Lightbulb className="w-4 h-4 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded">
              {SECTION_LABELS[sectionKey] || sectionKey}
            </span>
            <span className="text-xs text-muted-foreground">Improvement</span>
          </div>
          <p className="text-sm font-medium text-foreground">{title}</p>
        </div>
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {explanation && (
            <p className="text-sm text-muted-foreground">{explanation}</p>
          )}
          
          {evidence && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Evidence:</p>
              <p className="text-xs bg-muted/50 rounded p-2 text-foreground italic">
                "{evidence}"
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(suggestion);
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Main SuggestionPanel component
export default function SuggestionPanel({
  suggestions = { bullet_rewrites: [], improvements: [] },
  onApplySuggestion,
  onDismissSuggestion,
  applyingSuggestionId = null
}) {
  const [filter, setFilter] = useState("all"); // "all", "rewrites", "improvements"
  const [sectionFilter, setSectionFilter] = useState("all");

  const bulletRewrites = useMemo(() => suggestions.bullet_rewrites || [], [suggestions.bullet_rewrites]);
  const improvements = useMemo(() => suggestions.improvements || [], [suggestions.improvements]);

  // Get unique sections
  const availableSections = useMemo(() => {
    const sections = new Set();
    bulletRewrites.forEach(s => sections.add(s.section_key || "unknown"));
    improvements.forEach(s => sections.add(s.section_key || "general"));
    return Array.from(sections);
  }, [bulletRewrites, improvements]);

  // Filtered suggestions
  const filteredRewrites = useMemo(() => {
    if (filter === "improvements") return [];
    return bulletRewrites.filter(s => 
      sectionFilter === "all" || (s.section_key || "unknown") === sectionFilter
    );
  }, [bulletRewrites, filter, sectionFilter]);

  const filteredImprovements = useMemo(() => {
    if (filter === "rewrites") return [];
    return improvements.filter(s => 
      sectionFilter === "all" || (s.section_key || "general") === sectionFilter
    );
  }, [improvements, filter, sectionFilter]);

  const totalCount = filteredRewrites.length + filteredImprovements.length;
  const hasAnySuggestions = bulletRewrites.length > 0 || improvements.length > 0;

  if (!hasAnySuggestions) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <div className="bg-green-500/10 rounded-full p-4 w-fit mx-auto mb-3">
          <Check className="w-6 h-6 text-green-500" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No Suggestions</h3>
        <p className="text-sm text-muted-foreground">
          Your resume looks good! No improvements suggested at this time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 rounded-lg p-2">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">AI Suggestions</h3>
            <p className="text-xs text-muted-foreground">
              {totalCount} suggestion{totalCount !== 1 ? "s" : ""} available
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filter === "all" 
                ? "bg-card text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("rewrites")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filter === "rewrites" 
                ? "bg-card text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Rewrites ({bulletRewrites.length})
          </button>
          <button
            onClick={() => setFilter("improvements")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filter === "improvements" 
                ? "bg-card text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tips ({improvements.length})
          </button>
        </div>

        {availableSections.length > 1 && (
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="bg-muted border-none rounded-lg px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="all">All Sections</option>
            {availableSections.map(section => (
              <option key={section} value={section}>
                {SECTION_LABELS[section] || section}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Suggestions List */}
      <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
        {filteredRewrites.map((suggestion, index) => (
          <BulletRewriteCard
            key={`rewrite-${index}`}
            suggestion={suggestion}
            onApply={onApplySuggestion}
            onDismiss={onDismissSuggestion}
            isApplying={applyingSuggestionId === `rewrite-${index}`}
          />
        ))}
        
        {filteredImprovements.map((suggestion, index) => (
          <ImprovementCard
            key={`improvement-${index}`}
            suggestion={suggestion}
            onDismiss={onDismissSuggestion}
          />
        ))}

        {totalCount === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No suggestions match the current filter
          </div>
        )}
      </div>

      {/* Quick apply hint */}
      {filteredRewrites.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Click <strong>Apply</strong> on any rewrite to update your resume instantly
          </p>
        </div>
      )}
    </div>
  );
}
