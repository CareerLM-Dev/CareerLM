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
    <div className="space-y-6">
      {/* Circular progress + Score Breakdown side by side */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Circular progress indicator */}
        <div className="flex flex-col items-center justify-center">
          <svg width="120" height="120" viewBox="0 0 120 120">
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
          <div className="text-sm font-medium text-muted-foreground mt-2">ATS Score</div>
        </div>

        {/* Component scores */}
        <div>
          <h4 className="text-base font-semibold mb-4">Score Breakdown</h4>
          {componentScores && (
            <div className="space-y-3">
              {formatComponentScore("Structure", componentScores.structure_score)}
              {formatComponentScore("Keywords", componentScores.keyword_score)}
              {formatComponentScore("Content", componentScores.content_score)}
              {formatComponentScore("Formatting", componentScores.formatting_score)}
            </div>
          )}
        </div>
      </div>

      {/* Justification */}
      {justification && justification.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="text-base font-semibold mb-3">ATS Analysis</h4>
          <ul className="space-y-2">
            {justification.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-primary mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Analysis */}
      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-base font-semibold">Improvement Suggestions</h4>
          <button
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>Show Less</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>Show More</span>
              </>
            )}
          </button>
        </div>
        {isExpanded && (
          <div className="mt-2">
            {aiAnalysis ? (
              renderFormattedSuggestions(aiAnalysis)
            ) : (
              <p className="text-sm text-muted-foreground">No AI analysis available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ATSScore;
