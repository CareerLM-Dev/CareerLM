import React, { useState } from "react";
import { formatAIAnalysis } from "../utils/textFormatter";
import { ChevronDown, ChevronUp } from "lucide-react";

const ATSScore = ({ score, componentScores, justification, aiAnalysis, scoreZone }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getScoreColor = (scoreValue) => {
    if (scoreValue >= 75) return "#22c55e";
    if (scoreValue >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const getScoreBg = (scoreValue) => {
    if (scoreValue >= 75) return "bg-green-500";
    if (scoreValue >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  const getZoneBadge = (zone) => {
    if (!zone) return null;
    const styles = {
      "Strong, minor refinements needed": "bg-green-100 text-green-800 border-green-200",
      "Good foundation, clear gaps": "bg-amber-100 text-amber-800 border-amber-200",
      "Needs significant work": "bg-red-100 text-red-800 border-red-200",
    };
    return styles[zone] || "bg-muted text-muted-foreground border-border";
  };

  const renderFormattedSuggestions = (analysis) => {
    const formatted = formatAIAnalysis(analysis);
    if (!formatted) return null;
    return (
      <ul className="space-y-3">
        {formatted.map((item, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="text-primary mt-1 text-lg leading-none">{"\u2022"}</span>
            <div className="text-sm text-muted-foreground">
              {item.title && <strong className="text-foreground">{item.title}:</strong>}{" "}
              <span dangerouslySetInnerHTML={{ __html: item.description }} />
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const formatComponentScore = (label, value, note) => (
    <div key={label} className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          {label}
          {note && <span className="text-xs text-muted-foreground/60 ml-1">({note})</span>}
        </span>
        <span className="font-medium">{value ?? 0}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getScoreBg(value ?? 0)}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );

  // Normalize component keys — supports both old and new key names
  const c = componentScores || {};
  const dims = [
    { label: "Structure & Formatting", value: c.structure ?? c.structure_score ?? c.formatting ?? 0 },
    { label: "Section Completeness",   value: c.completeness ?? c.sections ?? 0 },
    { label: "Keyword & Relevance",    value: c.relevance ?? c.keywords ?? c.keyword_score ?? 0 },
    { label: "Impact & Specificity",   value: c.impact ?? c.content_score ?? c.readability ?? 0 },
  ];
  const weakest = c._weakest_dimension || null;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {/* Score ring */}
        <div className="flex flex-col items-center justify-center gap-2">
          <svg width="100" height="100" viewBox="0 0 120 120" className="md:w-[120px] md:h-[120px]">
            <circle cx="60" cy="60" r={radius} fill="transparent" stroke="hsl(var(--muted))" strokeWidth="10" />
            <circle
              cx="60" cy="60" r={radius} fill="transparent"
              stroke={getScoreColor(score)}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              className="transition-all duration-700"
            />
            <text x="50%" y="50%" dy=".3em" textAnchor="middle" fontSize="24" fontWeight="bold" fill={getScoreColor(score)}>
              {score}
            </text>
          </svg>
          <div className="text-xs md:text-sm font-medium text-muted-foreground">Resume Score</div>
          {scoreZone && (
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getZoneBadge(scoreZone)}`}>
              {scoreZone}
            </span>
          )}
        </div>

        {/* 4-dimension breakdown */}
        <div className="sm:col-span-1">
          <h4 className="text-sm md:text-base font-semibold mb-3">Score Breakdown</h4>
          <div className="space-y-3">
            {dims.map((d) =>
              formatComponentScore(
                d.label,
                d.value,
                weakest === d.label ? "lowest \u2014 prioritise" : null
              )
            )}
          </div>
        </div>

        {/* Dimension justification */}
        {justification && justification.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 md:p-4 sm:col-span-2 md:col-span-1">
            <h4 className="text-sm md:text-base font-semibold mb-2 md:mb-3">Dimension Scores</h4>
            <ul className="space-y-1.5 md:space-y-2">
              {justification.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-xs md:text-sm text-muted-foreground">
                  <span className="text-primary mt-0.5">{"\u2022"}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* AI improvement suggestions */}
      <div className="bg-muted/50 rounded-lg p-3 md:p-4">
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <h4 className="text-sm md:text-base font-semibold">Improvement Suggestions</h4>
          <button
            className="flex items-center gap-1 text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <><ChevronUp className="w-3 h-3 md:w-4 md:h-4" /><span className="hidden sm:inline">Show Less</span></>
            ) : (
              <><ChevronDown className="w-3 h-3 md:w-4 md:h-4" /><span className="hidden sm:inline">Show More</span></>
            )}
          </button>
        </div>
        {isExpanded && (
          <div className="mt-2">
            {aiAnalysis ? (
              renderFormattedSuggestions(aiAnalysis)
            ) : (
              <p className="text-xs md:text-sm text-muted-foreground">No suggestions available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ATSScore;
