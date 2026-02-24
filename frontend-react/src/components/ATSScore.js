import React, { useState } from "react";
import { formatAIAnalysis } from "../utils/textFormatter";
import { ChevronDown, ChevronUp } from "lucide-react";

const ATSScore = ({ score, componentScores, justification, aiAnalysis }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getScoreColor = (scoreValue) => {
    if (scoreValue >= 80) return "#22c55e";
    if (scoreValue >= 60) return "#f59e0b";
    return "#ef4444";
  };

  const getScoreBg = (scoreValue) => {
    if (scoreValue >= 80) return "bg-green-500";
    if (scoreValue >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  const renderFormattedSuggestions = (analysis) => {
    const formatted = formatAIAnalysis(analysis);
    if (!formatted) return null;

    return (
      <ul className="space-y-3">
        {formatted.map((item, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="text-primary mt-1 text-lg leading-none">•</span>
            <div className="text-sm text-muted-foreground">
              {item.title && <strong className="text-foreground">{item.title}:</strong>}{" "}
              <span dangerouslySetInnerHTML={{ __html: item.description }} />
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const formatComponentScore = (name, value) => {
    return (
      <div key={name} className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{name}</span>
          <span className="font-medium">{value}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getScoreBg(value)}`}
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Circular progress + Score Breakdown + ATS Analysis in one row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {/* Circular progress indicator */}
        <div className="flex flex-col items-center justify-center">
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
          <div className="text-xs md:text-sm font-medium text-muted-foreground mt-2">ATS Score</div>
        </div>

        {/* Component scores */}
        <div className="sm:col-span-1">
          <h4 className="text-sm md:text-base font-semibold mb-3 md:mb-4">Score Breakdown</h4>
          {componentScores && (
            <div className="space-y-3">
              {formatComponentScore("Structure", componentScores.structure_score)}
              {formatComponentScore("Keywords", componentScores.keyword_score)}
              {formatComponentScore("Content", componentScores.content_score)}
              {formatComponentScore("Formatting", componentScores.formatting_score)}
            </div>
          )}
        </div>

        {/* Justification */}
        {justification && justification.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 md:p-4 sm:col-span-2 md:col-span-1">
            <h4 className="text-sm md:text-base font-semibold mb-2 md:mb-3">ATS Analysis</h4>
            <ul className="space-y-1.5 md:space-y-2">
              {justification.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-xs md:text-sm text-muted-foreground">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* AI Analysis */}
      <div className="bg-muted/50 rounded-lg p-3 md:p-4">
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <h4 className="text-sm md:text-base font-semibold">Improvement Suggestions</h4>
          <button
            className="flex items-center gap-1 text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Show Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Show More</span>
              </>
            )}
          </button>
        </div>
        {isExpanded && (
          <div className="mt-2">
            {aiAnalysis ? (
              renderFormattedSuggestions(aiAnalysis)
            ) : (
              <p className="text-xs md:text-sm text-muted-foreground">No AI analysis available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ATSScore;
