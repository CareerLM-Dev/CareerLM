import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Lightbulb, Edit, CheckSquare, CheckCircle, AlertCircle, Edit3,
} from "lucide-react";

// ── Circular Progress for Overall Score ────────────────────────────────────
function CircularScore({ score, size = 120 }) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min(Math.max(score || 0, 0), 100);
  const offset = circumference - (percentage / 100) * circumference;

  let strokeColor = "#10b981"; // green
  if (percentage < 50) strokeColor = "#ef4444"; // red
  else if (percentage < 75) strokeColor = "#f59e0b"; // amber

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={10}
          fill="none"
          className="text-muted opacity-20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={10}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-2xl font-bold block" style={{ color: strokeColor }}>
            {percentage}%
          </span>
          <span className="text-xs text-muted-foreground">ATS Score</span>
        </div>
      </div>
    </div>
  );
}

// ── Horizontal Bar for Section Scores ──────────────────────────────────────
function ScoreBar({ label, score }) {
  const percentage = Math.min(Math.max(score || 0, 0), 100);
  let barColor = "bg-emerald-600";
  if (percentage < 50) barColor = "bg-red-600";
  else if (percentage < 75) barColor = "bg-amber-600";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{percentage}%</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full ${barColor} transition-all duration-700`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
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
    ats_score,
    structure_score,
    completeness_score,
    relevance_score,
    impact_score,
    strengths = [],
    weaknesses = [],
    suggestions = [],
  } = resumeData;

  // Default text for empty strengths/weaknesses
  const strengthsList = strengths.length > 0
    ? strengths.map(s => s.title || s.suggestion)
    : ["Your resume effectively highlights your key skills and experiences relevant to the target roles.", "The structure is clear and easy to follow, making it simple for recruiters to quickly grasp your qualifications."];

  const weaknessesList = weaknesses.length > 0
    ? weaknesses.map(w => w.title || w.suggestion)
    : ["The resume lacks specific quantifiable achievements to demonstrate the impact of your contributions.", "Some sections could benefit from more detailed descriptions to provide a clearer picture of your responsibilities and accomplishments."];

  return (
    <div className="space-y-5">
      {/* ── ATS Score Section (Circular + Horizontal Bars) ──────────── */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-6 items-center">
          {/* Circular Overall Score */}
          <div className="flex justify-center md:justify-start">
            <CircularScore score={ats_score} size={120} />
          </div>

          {/* Section Scores as Horizontal Bars */}
          <div className="space-y-3">
            <ScoreBar label="Structure" score={structure_score} />
            <ScoreBar label="Completeness" score={completeness_score} />
            <ScoreBar label="Relevance" score={relevance_score} />
            <ScoreBar label="Impact" score={impact_score} />
          </div>
        </div>
      </div>

      {/* ── AI Feedback Section ──────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-base font-bold mb-4">AI Feedback</h3>
        
        <div className="space-y-4">
          {/* Strengths */}
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-500 flex-shrink-0" />
              <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Strengths</h4>
            </div>
            <ul className="text-sm text-emerald-800 dark:text-emerald-200 leading-relaxed pl-6 space-y-1.5">
              {strengthsList.map((strength, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">•</span>
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Weaknesses */}
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 flex-shrink-0" />
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Weaknesses</h4>
            </div>
            <ul className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed pl-6 space-y-1.5">
              {weaknessesList.map((weakness, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-500 mt-1">•</span>
                  <span>{weakness}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Edit Suggestions ─────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-base font-bold mb-4">Edit Suggestions</h3>
        
        {suggestions.length > 0 ? (
          <div className="space-y-3">
            {suggestions.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted/40 border border-border rounded-lg">
                <div className="flex-shrink-0 mt-0.5">
                  {i === 0 && <Lightbulb className="w-5 h-5 text-blue-600" />}
                  {i === 1 && <Edit className="w-5 h-5 text-blue-600" />}
                  {i === 2 && <CheckSquare className="w-5 h-5 text-blue-600" />}
                  {i > 2 && <Lightbulb className="w-5 h-5 text-blue-600" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1">
                    {item.title || item.suggestion}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.explanation}
                  </p>
                  {item.bullet_rewrite && (
                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded">
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        {item.bullet_rewrite}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No suggestions — looking good!
          </p>
        )}
      </div>

      {/* ── Download Resume Button ──────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Download Resume
        </button>
      </div>
    </div>
  );
}
