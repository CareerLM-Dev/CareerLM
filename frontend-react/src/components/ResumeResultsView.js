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
  ArrowUpRight,
  Zap,
} from "lucide-react";

// ── Circular Score ─────────────────────────────────────────────────────────
function CircularScore({ score, size = 156 }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score || 0, 0), 100);
  const offset = circ - (pct / 100) * circ;

  const { stroke, label, ring } =
    pct >= 75
      ? { stroke: "#10b981", label: "text-emerald-500", ring: "shadow-emerald-500/20" }
      : pct >= 50
      ? { stroke: "#f59e0b", label: "text-amber-500", ring: "shadow-amber-500/20" }
      : { stroke: "#f43f5e", label: "text-rose-500", ring: "shadow-rose-500/20" };

  const zone =
    pct >= 75 ? "Strong" : pct >= 50 ? "Average" : "Needs Work";
  const zoneBg =
    pct >= 75
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : pct >= 50
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-rose-500/10 text-rose-600 dark:text-rose-400";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative rounded-full shadow-xl ${ring}`} style={{ width: size, height: size }}>
        <svg className="-rotate-90" width={size} height={size}>
          {/* Track */}
          <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={10} fill="none" className="text-muted opacity-20" />
          {/* Fill */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={stroke} strokeWidth={10} fill="none"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-extrabold tracking-tight font-mono ${label}`}>{pct}</span>
          <span className="text-xs text-muted-foreground font-medium">/100</span>
        </div>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${zoneBg}`}>{zone}</span>
    </div>
  );
}

// ── Metric Bar ─────────────────────────────────────────────────────────────
function MetricRow({ label, score, icon: Icon, color }) {
  const pct = Math.min(Math.max(score || 0, 0), 100);
  const cfg = {
    indigo:  { bar: "bg-indigo-500",  text: "text-indigo-600 dark:text-indigo-400",  bg: "bg-indigo-500/10" },
    violet:  { bar: "bg-violet-500",  text: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-500/10" },
    sky:     { bar: "bg-sky-500",     text: "text-sky-600 dark:text-sky-400",         bg: "bg-sky-500/10" },
    fuchsia: { bar: "bg-fuchsia-500", text: "text-fuchsia-600 dark:text-fuchsia-400", bg: "bg-fuchsia-500/10" },
  }[color] || cfg?.indigo;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs p-3.5 hover:border-indigo-400/30 hover:bg-card hover:shadow-md hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-200 active:translate-y-0">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
        <Icon className={`h-4 w-4 ${cfg.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className={`text-sm font-bold font-mono ${cfg.text}`}>{pct}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${cfg.bar} transition-all duration-700 ease-out`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Section Header ─────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, subtitle, iconClass, iconBg }) {
  return (
    <div className="flex items-start gap-3 px-5 pt-5 pb-3">
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconClass}`} />
      </div>
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Feedback Card ──────────────────────────────────────────────────────────
function FeedbackCard({ item, variant }) {
  const styles = {
    strength: {
      wrapper: "rounded-xl border border-emerald-200/50 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50/60 to-emerald-50/20 dark:from-emerald-950/30 dark:to-transparent p-3.5 hover:border-emerald-300/70 dark:hover:border-emerald-700/60 transition-all",
      title: "text-sm font-semibold text-emerald-900 dark:text-emerald-100",
      detail: "text-xs text-emerald-800/70 dark:text-emerald-200/60 leading-relaxed mt-0.5",
      tip: "text-xs text-emerald-700/50 dark:text-emerald-300/40 italic mt-1",
      dot: "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500",
    },
    weakness: {
      wrapper: "rounded-xl border border-amber-200/50 dark:border-amber-800/40 bg-gradient-to-br from-amber-50/60 to-amber-50/20 dark:from-amber-950/30 dark:to-transparent p-3.5 hover:border-amber-300/70 dark:hover:border-amber-700/60 transition-all",
      title: "text-sm font-semibold text-amber-900 dark:text-amber-100",
      detail: "text-xs text-amber-800/70 dark:text-amber-200/60 leading-relaxed mt-0.5",
      tip: "text-xs text-amber-700/50 dark:text-amber-300/40 italic mt-1",
      dot: "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-500",
    },
  }[variant];

  return (
    <div className={`${styles.wrapper} hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200`}>
      <div className="flex gap-2.5">
        <div className={styles.dot} />
        <div>
          <p className={styles.title}>{item.title}</p>
          {item.detail && <p className={styles.detail}>{item.detail}</p>}
          {item.tip && <p className={styles.tip}>{item.tip}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Suggestion Card ────────────────────────────────────────────────────────
function SuggestionCard({ item, index }) {
  const icons = [Lightbulb, Edit, CheckSquare, Sparkles, Target];
  const Icon = icons[index % icons.length];

  return (
    <div className="group rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs p-4 transition-all duration-200 hover:border-indigo-400/40 hover:bg-card hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-1 active:translate-y-0">
      <div className="flex gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 group-hover:bg-indigo-500/15 transition-colors">
          <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {typeof item === "string" ? item : item.title || item.suggestion}
          </p>
          {item.explanation && (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {item.explanation}
            </p>
          )}
          {item.bullet_rewrite && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Suggested rewrite
              </p>
              <div className="relative overflow-hidden rounded-lg border border-indigo-200/60 dark:border-indigo-800/40 bg-indigo-50/80 dark:bg-indigo-950/30 px-3.5 py-2.5">
                <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-indigo-500" />
                <p className="pl-1 text-xs text-indigo-900 dark:text-indigo-200 font-mono leading-relaxed">
                  {item.bullet_rewrite}
                </p>
              </div>
            </div>
          )}
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
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border/60 bg-card/50 backdrop-blur-sm p-16 text-center hover:border-indigo-400/30 hover:bg-card/70 transition-all duration-200">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
          <Upload className="h-7 w-7 text-white" />
        </div>
        <div>
          <p className="text-base font-semibold">No analysis yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a resume to get your ATS score and improvement suggestions.
          </p>
        </div>
        <button
          onClick={onUploadAnother}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:opacity-90 hover:-translate-y-1 transition-all duration-200 active:translate-y-0"
        >
          <Upload className="h-4 w-4" /> Upload Resume
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
        title: item.title || item.suggestion || item.summary || "Untitled insight",
        detail: item.explanation || item.detail || item.reason || item.why,
        tip: item.tip || item.example,
      };
    });

  const strengthsList =
    strengths.length > 0
      ? normalizeFeedback(strengths)
      : [
          { title: "Clear positioning", detail: "Your resume highlights key skills relevant to your target roles." },
          { title: "Readable structure", detail: "The layout is easy to scan, making your experience accessible to recruiters." },
        ];

  const weaknessesList =
    weaknesses.length > 0
      ? normalizeFeedback(weaknesses)
      : [
          { title: "Limited measurable impact", detail: "Add numbers that show the effect of your work (speed, scale, revenue, users)." },
          { title: "Thin project detail", detail: "Expand 1–2 bullets to show scope, tools, and outcomes." },
        ];

  return (
    <div className="space-y-5">
      {/* ── Score Hero ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-lg shadow-black/5">
        {/* Top bar */}
        <div className="h-0.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />

        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
              ATS Score Overview
            </h3>
            <span className="ml-auto text-xs text-muted-foreground">
              Applicant Tracking System
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
            {/* Circular score */}
            <div className="flex justify-center md:justify-start">
              <CircularScore score={ats_score} size={156} />
            </div>

            {/* Sub-metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <MetricRow label="Structure"    score={structure_score}    icon={Target}     color="indigo"  />
              <MetricRow label="Completeness" score={completeness_score} icon={CheckSquare} color="violet"  />
              <MetricRow label="Relevance"    score={relevance_score}    icon={TrendingUp}  color="sky"     />
              <MetricRow label="Impact"       score={impact_score}       icon={Sparkles}    color="fuchsia" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Strengths & Weaknesses ─────────────────────────────────── */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Strengths */}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/8 transition-all duration-200">
          <SectionHeader
            icon={CheckCircle}
            title="Strengths"
            subtitle="What's working well"
            iconClass="text-emerald-600 dark:text-emerald-400"
            iconBg="bg-emerald-500/10"
          />
          <div className="px-5 pb-5 space-y-2">
            {strengthsList.map((s, i) => (
              <FeedbackCard key={i} item={s} variant="strength" />
            ))}
          </div>
        </div>

        {/* Weaknesses */}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/8 transition-all duration-200">
          <SectionHeader
            icon={AlertCircle}
            title="Needs Work"
            subtitle="Areas for improvement"
            iconClass="text-amber-600 dark:text-amber-400"
            iconBg="bg-amber-500/10"
          />
          <div className="px-5 pb-5 space-y-2">
            {weaknessesList.map((w, i) => (
              <FeedbackCard key={i} item={w} variant="weakness" />
            ))}
          </div>
        </div>
      </div>

      {/* ── Suggestions + CTA ──────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/8 transition-all duration-200">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/10">
              <Lightbulb className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Edit Suggestions</h3>
              <p className="text-xs text-muted-foreground">
                Actionable improvements prioritized by impact
              </p>
            </div>
          </div>
          {suggestions.length > 0 && (
            <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {suggestions.length} items
            </span>
          )}
        </div>

        <div className="px-5 pb-4">
          {suggestions.length > 0 ? (
            <div className="space-y-2.5">
              {suggestions.map((item, i) => (
                <SuggestionCard key={i} item={item} index={i} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 mb-3">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold">Looking great — no suggestions!</p>
              <p className="text-xs text-muted-foreground mt-0.5">Your resume is well-optimized</p>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="px-5 pb-5">
          <div className="h-px w-full bg-border mb-4" />
          <button
            onClick={() => navigate("/dashboard/resume-editor")}
            className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-1 active:translate-y-0"
          >
            {/* Shimmer sweep */}
            <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <Edit3 className="h-4 w-4" />
            Open Resume Editor
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}