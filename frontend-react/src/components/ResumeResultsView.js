import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Lightbulb,
  Edit,
  CheckSquare,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Shield,
  Target,
  Sparkles,
  Edit3,
} from "lucide-react";

// ── Circular Progress for Overall Score ────────────────────────────────────
function CircularScore({ score, size = 140 }) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min(Math.max(score || 0, 0), 100);
  const offset = circumference - (percentage / 100) * circumference;

  let strokeColor = "#10b981";
  let bgGlow = "shadow-emerald-500/20";
  if (percentage < 50) {
    strokeColor = "#ef4444";
    bgGlow = "shadow-red-500/20";
  } else if (percentage < 75) {
    strokeColor = "#f59e0b";
    bgGlow = "shadow-amber-500/20";
  }

  return (
    <div
      className={`relative flex items-center justify-center rounded-full shadow-lg ${bgGlow}`}
      style={{ width: size, height: size }}
    >
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={12}
          fill="none"
          className="text-muted opacity-15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={12}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span
            className="text-3xl font-extrabold block tracking-tight"
            style={{ color: strokeColor }}
          >
            {percentage}
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            / 100
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Score Metric Card ──────────────────────────────────────────────────────
function ScoreMetricCard({ label, score, icon: Icon }) {
  const percentage = Math.min(Math.max(score || 0, 0), 100);

  let barColor = "bg-emerald-500";
  let textColor = "text-emerald-600 dark:text-emerald-400";
  let bgColor = "bg-emerald-500/10";
  if (percentage < 50) {
    barColor = "bg-red-500";
    textColor = "text-red-600 dark:text-red-400";
    bgColor = "bg-red-500/10";
  } else if (percentage < 75) {
    barColor = "bg-amber-500";
    textColor = "text-amber-600 dark:text-amber-400";
    bgColor = "bg-amber-500/10";
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-border/80 hover:shadow-sm transition-all duration-200">
      <div
        className={`flex items-center justify-center w-9 h-9 rounded-lg ${bgColor} flex-shrink-0`}
      >
        <Icon className={`w-4 h-4 ${textColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <span className={`text-sm font-bold ${textColor}`}>
            {percentage}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ResumeResultsView({ resumeData, onUploadAnother }) {
  const navigate = useNavigate();

  if (!resumeData) {
    return (
      <div className="flex flex-col items-center gap-5 text-center p-16 bg-card border border-border rounded-2xl">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Upload className="w-7 h-7 text-primary" />
        </div>
        <div>
          <p className="text-base font-semibold mb-1">
            No analysis data yet
          </p>
          <p className="text-sm text-muted-foreground">
            Upload a resume to get your ATS score and improvement suggestions.
          </p>
        </div>
        <button
          onClick={onUploadAnother}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-md shadow-primary/20"
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

  const normalizeFeedback = (items) =>
    (items || []).map((item) => {
      if (typeof item === "string") return { title: item };
      return {
        title:
          item.title || item.suggestion || item.summary || "Untitled insight",
        detail: item.explanation || item.detail || item.reason || item.why,
        tip: item.tip || item.example,
      };
    });

  const strengthsList =
    strengths.length > 0
      ? normalizeFeedback(strengths)
      : [
          {
            title: "Clear positioning",
            detail:
              "Your resume highlights key skills relevant to your target roles.",
          },
          {
            title: "Readable structure",
            detail:
              "The layout is easy to scan, making your experience accessible to recruiters.",
          },
        ];

  const weaknessesList =
    weaknesses.length > 0
      ? normalizeFeedback(weaknesses)
      : [
          {
            title: "Limited measurable impact",
            detail:
              "Add numbers that show the effect of your work (speed, scale, revenue, users).",
          },
          {
            title: "Thin project detail",
            detail:
              "Expand 1–2 bullets to show scope, tools, and outcomes.",
          },
        ];

  return (
    <div className="space-y-5">
      {/* ── Score Overview ──────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
              ATS Score Overview
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            How well your resume performs against applicant tracking systems
          </p>
        </div>

        <div className="p-5 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-6 items-start">
            {/* Circular overall score */}
            <div className="flex flex-col items-center gap-2">
              <CircularScore score={ats_score} size={140} />
              <p className="text-xs font-medium text-muted-foreground mt-1">
                Overall ATS Score
              </p>
            </div>

            {/* Section metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <ScoreMetricCard
                label="Structure"
                score={structure_score}
                icon={Target}
              />
              <ScoreMetricCard
                label="Completeness"
                score={completeness_score}
                icon={CheckSquare}
              />
              <ScoreMetricCard
                label="Relevance"
                score={relevance_score}
                icon={TrendingUp}
              />
              <ScoreMetricCard
                label="Impact"
                score={impact_score}
                icon={Sparkles}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Feedback ────────────────────────────────────────────── */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Strengths */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Strengths</h3>
              <p className="text-xs text-muted-foreground">
                What's working well
              </p>
            </div>
          </div>
          <div className="px-5 pb-5 space-y-2.5">
            {strengthsList.map((strength, i) => (
              <div
                key={i}
                className="rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 p-3.5 transition-colors hover:border-emerald-300/80 dark:hover:border-emerald-700/60"
              >
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 mb-0.5">
                  {strength.title}
                </p>
                {strength.detail && (
                  <p className="text-xs text-emerald-800/80 dark:text-emerald-200/70 leading-relaxed">
                    {strength.detail}
                  </p>
                )}
                {strength.tip && (
                  <p className="text-xs text-emerald-700/60 dark:text-emerald-300/50 mt-1 italic">
                    {strength.tip}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Weaknesses */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Needs Work</h3>
              <p className="text-xs text-muted-foreground">
                Areas for improvement
              </p>
            </div>
          </div>
          <div className="px-5 pb-5 space-y-2.5">
            {weaknessesList.map((weakness, i) => (
              <div
                key={i}
                className="rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 p-3.5 transition-colors hover:border-amber-300/80 dark:hover:border-amber-700/60"
              >
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-0.5">
                  {weakness.title}
                </p>
                {weakness.detail && (
                  <p className="text-xs text-amber-800/80 dark:text-amber-200/70 leading-relaxed">
                    {weakness.detail}
                  </p>
                )}
                {weakness.tip && (
                  <p className="text-xs text-amber-700/60 dark:text-amber-300/50 mt-1 italic">
                    {weakness.tip}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Edit Suggestions + Resume Editor CTA ──────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10">
              <Lightbulb className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Edit Suggestions
              </h3>
              <p className="text-xs text-muted-foreground">
                Actionable improvements for your resume
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-4">
          {suggestions.length > 0 ? (
            <div className="space-y-2.5">
              {suggestions.map((item, i) => {
                const icons = [Lightbulb, Edit, CheckSquare];
                const Icon = icons[i % icons.length];

                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3.5 bg-muted/30 border border-border rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0 mt-0.5 flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10">
                      <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground mb-0.5">
                        {typeof item === "string"
                          ? item
                          : item.title || item.suggestion}
                      </p>
                      {item.explanation && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {item.explanation}
                        </p>
                      )}
                      {item.bullet_rewrite && (
                        <div className="mt-2 p-2.5 bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 rounded-lg">
                          <p className="text-xs text-blue-800 dark:text-blue-200 font-mono">
                            {item.bullet_rewrite}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="text-sm font-medium text-foreground">
                No suggestions — looking good!
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your resume is well-optimized
              </p>
            </div>
          )}
        </div>

        {/* ── CTA: Open Resume Editor ── */}
        <div className="px-5 pb-5">
          <button
            onClick={() => navigate("/dashboard/resume-editor")}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3 bg-gradient-to-r from-primary to-primary/85 text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all duration-200 shadow-md shadow-primary/25"
          >
            <Edit3 className="w-4 h-4" />
            Open Resume Editor
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
