import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  CheckSquare,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Target,
  Sparkles,
  Copy,
  Code2,
  Lightbulb,
  FileText,
  Briefcase,
  ChevronRight,
  Eye,
} from "lucide-react";
import SuggestionPanel from "./SuggestionPanel";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
const RESUME_API = `${API_BASE}/api/v1/orchestrator`;

// ── Circular Score ─────────────────────────────────────────────────────────
function CircularScore({ score, size = 140 }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score || 0, 0), 100);
  const offset = circ - (pct / 100) * circ;

  const { stroke, label } =
    pct >= 75
      ? { stroke: "#10b981", label: "text-emerald-600" }
      : pct >= 50
      ? { stroke: "#f59e0b", label: "text-amber-600" }
      : { stroke: "#ef4444", label: "text-rose-600" };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90" width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={8} fill="none" className="text-slate-200" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={stroke} strokeWidth={8} fill="none"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-black tracking-tight ${label}`}>{pct}</span>
          <span className="text-xs text-slate-500 font-medium">/ 100</span>
        </div>
      </div>
    </div>
  );
}

// ── Metric Row (Sleek Light Theme) ────────────────────────────────────────
function MetricRow({ label, score, icon: Icon, color }) {
  const pct = Math.min(Math.max(score || 0, 0), 100);
  const colorConfig = {
    indigo:  { bar: "bg-indigo-600",  text: "text-indigo-600" },
    violet:  { bar: "bg-violet-600",  text: "text-violet-600" },
    sky:     { bar: "bg-sky-600",     text: "text-sky-600" },
    fuchsia: { bar: "bg-fuchsia-600", text: "text-fuchsia-600" },
  };
  const cfg = colorConfig[color] || colorConfig.indigo;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${cfg.text}`} />
          <span className="text-sm font-medium text-slate-900">{label}</span>
        </div>
        <span className={`text-sm font-bold ${cfg.text}`}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${cfg.bar} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Feedback Card (Light Theme) ────────────────────────────────────────────
function FeedbackCard({ item, variant }) {
  const styles = {
    strength: {
      wrapper: "rounded-lg border border-emerald-200 bg-emerald-50/50 p-3",
      icon: "text-emerald-600",
      title: "text-sm font-semibold text-slate-900",
      detail: "text-xs text-slate-600 leading-relaxed mt-1",
    },
    weakness: {
      wrapper: "rounded-lg border border-rose-200 bg-rose-50/50 p-3",
      icon: "text-rose-600",
      title: "text-sm font-semibold text-slate-900",
      detail: "text-xs text-slate-600 leading-relaxed mt-1",
    },
  }[variant];

  return (
    <div className={styles.wrapper}>
      <div className="flex gap-2">
        {variant === "strength" ? (
          <CheckCircle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${styles.icon}`} />
        ) : (
          <AlertCircle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${styles.icon}`} />
        )}
        <div className="flex-1">
          <p className={styles.title}>{item.title}</p>
          {item.detail && <p className={styles.detail}>{item.detail}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Suggestion Card (AI-Powered Rewrite) ──────────────────────────────────
function RewriteCard({ item, index }) {
  const [copied, setCopied] = React.useState(false);
  const priorities = ["IMPACT", "FILTERING", "KEYWORD MATCH", "STRUCTURE"];
  const priority = priorities[index % priorities.length];

  const handleCopy = () => {
    if (item.bullet_rewrite) {
      navigator.clipboard.writeText(item.bullet_rewrite);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border-b border-slate-200 pb-6 last:border-b-0 last:pb-0">
      {/* Context Header */}
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Issue #{index + 1}: {priority}</p>
        <h4 className="text-lg font-bold text-slate-900">{item.title || "Issue"}</h4>
        <p className="text-sm text-slate-600 mt-2">{item.detail || item.explanation || "See the suggested improvement below."}</p>
      </div>

      {/* Before/After Blocks */}
      {item.bullet_rewrite && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Original Content */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Current Bullet</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-sm text-slate-600 italic">"{item.original_text || item.summary || "Your current text..."}"</p>
            </div>
          </div>

          {/* Suggested Rewrite */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Suggested Rewrite</p>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-3 font-mono text-sm leading-relaxed">
              <code className="text-indigo-900">
                {item.bullet_rewrite}
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ResumeResultsView({ resumeData, onUploadAnother }) {
  const navigate = useNavigate();
  const [isSourcePanelOpen, setIsSourcePanelOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);

  useEffect(() => {
    if (resumeData?.file && resumeData.file.type === "application/pdf") {
      const url = URL.createObjectURL(resumeData.file);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [resumeData?.file]);

  if (!resumeData) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/30">
          <Upload className="h-7 w-7 text-white" />
        </div>
        <div>
          <p className="text-base font-semibold text-slate-900">No analysis yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Upload a resume to get your ATS score and improvement suggestions.
          </p>
        </div>
        <button
          onClick={onUploadAnother}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-1 transition-all duration-200 active:translate-y-0"
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
      };
    });

  const generalTips = suggestions.filter(s => s.suggestion_id?.startsWith("impr_"));
  const rewriteSuggestions = suggestions.filter(s => s.suggestion_id?.startsWith("br_"));

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

  // Generate expert verdict based on scores
  const getExpertVerdict = () => {
    const avg = (structure_score + completeness_score + relevance_score + impact_score) / 4;
    if (avg >= 80) return "Your resume is technically sound and well-optimized for ATS systems. Consider adding quantified metrics to stand out further.";
    if (avg >= 60) return "Your resume has solid foundations but lacks the executive polish for top-tier positions. Focus on impact keywords and specific achievements.";
    return "Your resume needs structural improvements and stronger keyword density to pass modern ATS filters. Prioritize the critical fixes below.";
  };

  const getStatusBadge = () => {
    if (ats_score >= 75) return { text: "READY FOR SUBMISSION", color: "text-emerald-600 bg-emerald-50", dot: "bg-emerald-500" };
    if (ats_score >= 50) return { text: "NEEDS REVISION", color: "text-amber-600 bg-amber-50", dot: "bg-amber-500" };
    return { text: "CRITICAL FIXES NEEDED", color: "text-rose-600 bg-rose-50", dot: "bg-rose-500" };
  };

  const status = getStatusBadge();

  return (
    <div className="space-y-8">
      {/* ── Header Section ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">ANALYSIS COMPLETE</p>
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">
              Resume Analyzer
            </h1>
            <p className="text-slate-600 max-w-2xl">
              Your profile has been benchmarked against high-growth tech standards. Precision optimizations suggested below.
            </p>
          </div>
          {/* AI Expert Badge & Source Button */}
          <div className="flex-shrink-0 flex items-center gap-3">
            <button
              onClick={() => setIsSourcePanelOpen(true)}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-indigo-600"
            >
              <Eye className="h-4 w-4" />
              View Original
            </button>
            {/* <div className="flex items-center gap-3 rounded-full bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 px-4 py-3 shadow-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">AI Guide</p>
                <p className="text-xs text-slate-600">You're in the top 15%!</p>
              </div>
            </div> */}
          </div>
        </div>
      </div>

      {/* ── Top Bento Grid (2 Col) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score & Metrics (Left - 2 cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-8 items-start">
            {/* Circular Score */}
            <div className="flex justify-center md:justify-start">
              <div className="text-center">
                <CircularScore score={ats_score} size={140} />
                <p className="text-xs text-slate-500 font-medium mt-3 uppercase tracking-wide">ATS Match Probability</p>
              </div>
            </div>

            {/* Sub-Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <MetricRow label="Structure" score={structure_score} icon={Target} color="indigo" />
              <MetricRow label="Completeness" score={completeness_score} icon={CheckSquare} color="violet" />
              <MetricRow label="Relevance" score={relevance_score} icon={TrendingUp} color="sky" />
              <MetricRow label="Impact" score={impact_score} icon={Sparkles} color="fuchsia" />
            </div>
          </div>
        </div>

        {/* Expert Verdict (Right - 1 col) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Expert Verdict</h3>
          <p className="text-sm text-slate-700 leading-relaxed flex-1 mb-4">
            {getExpertVerdict()}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {ats_score >= 75 && (
              <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                STRONG QUANTIFIER USE
              </span>
            )}
            {completeness_score < 70 && (
              <span className="rounded-full bg-rose-50 text-rose-700 px-3 py-1 text-xs font-semibold">
                KEYWORD GAP
              </span>
            )}
            {relevance_score >= 70 && (
              <span className="rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-semibold">
                WELL-ALIGNED
              </span>
            )}
          </div>

          {/* Status Footer */}
          <div className={`flex items-center gap-2 rounded-lg ${status.color} px-3 py-2 text-sm font-semibold`}>
            <span className={`h-2 w-2 rounded-full ${status.dot} animate-pulse`} />
            {status.text}
          </div>
        </div>
      </div>

      {/* ── Strengths & Fixes (2 Col) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Strengths */}
        <div className="bg-white border border-emerald-200 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-6">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">Top Strengths</h3>
          </div>
          <div className="space-y-3">
            {strengthsList.map((s, i) => (
              <FeedbackCard key={i} item={s} variant="strength" />
            ))}
          </div>
        </div>

        {/* Critical Fixes */}
        <div className="bg-white border border-rose-200 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-6">
            <AlertCircle className="h-5 w-5 text-rose-600" />
            <h3 className="text-lg font-bold text-slate-900">Critical Fixes</h3>
          </div>
          <div className="space-y-3">
            {weaknessesList.map((w, i) => (
              <FeedbackCard key={i} item={w} variant="weakness" />
            ))}
          </div>
        </div>
      </div>

      {/* ── General Improvements ── */}
      {generalTips.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-600" />
              <h3 className="text-lg font-bold text-slate-900">Strategic Advice</h3>
            </div>
            <span className="rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-xs font-semibold">
              {generalTips.length} GENERAL TIPS
            </span>
          </div>

          <div className="space-y-3">
            {normalizeFeedback(generalTips).map((tip, i) => (
              <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/30 p-4">
                <p className="text-sm font-semibold text-slate-900">{tip.title}</p>
                {tip.detail && <p className="text-xs text-slate-600 leading-relaxed mt-1">{tip.detail}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AI-Powered Rewrites ── */}
      {rewriteSuggestions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-bold text-slate-900">AI-Powered Rewrites</h3>
            </div>
            <span className="rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-semibold">
              {rewriteSuggestions.length} HIGH PRIORITY ISSUES
            </span>
          </div>
          <p className="text-sm text-slate-600 mb-6">Click to copy changes directly to your resume.</p>

          <div className="space-y-0">
            {rewriteSuggestions.map((item, i) => (
              <RewriteCard key={i} item={item} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── CTA Button (Centered) ── */}
      <div className="flex justify-center pt-4">
        <button
          onClick={() => navigate("/dashboard/resume-editor")}
          className="group relative flex items-center gap-2 px-8 py-3.5 rounded-full bg-slate-900 text-white font-semibold shadow-lg shadow-slate-900/20 hover:bg-slate-800 hover:-translate-y-1 transition-all duration-200 active:translate-y-0"
        >
          Open Resume Editor
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {/* ── Source Content Drawer (Right Side) ── */}
      {isSourcePanelOpen && (
        <div className="fixed inset-0 z-[9999] flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsSourcePanelOpen(false)}
          />
          
          {/* Drawer */}
          <div className="relative w-full max-w-xl h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Source Documents</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">What we analyzed</p>
              </div>
              <button
                onClick={() => setIsSourcePanelOpen(false)}
                className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50">
              
              {/* Job Description block */}
              {resumeData.jobDescription && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <h4 className="font-semibold text-slate-800">Target Job Description</h4>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                    {resumeData.jobDescription}
                  </div>
                </div>
              )}

              {/* Resume Text/PDF block */}
              <div className="space-y-3 h-full pb-8">
                <div className="flex items-center gap-2">
                  <div className="bg-emerald-100 text-emerald-600 p-1.5 rounded-lg">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-slate-800">
                    Uploaded Resume
                    <span className="text-slate-400 font-normal text-xs ml-2">from {resumeData.filename || "upload"}</span>
                  </h4>
                </div>
                
                {pdfUrl ? (
                  <div className="w-full h-[600px] bg-slate-100 border border-slate-200 rounded-xl overflow-hidden shadow-inner">
                    <object
                      data={pdfUrl}
                      type="application/pdf"
                      width="100%"
                      height="100%"
                    >
                      <div className="flex flex-col items-center justify-center p-8 h-full bg-slate-100">
                        <FileText className="h-10 w-10 text-slate-400 mb-3" />
                        <p className="text-sm font-medium">PDF preview not available</p>
                      </div>
                    </object>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {resumeData.resumeText && resumeData.resumeText !== "Original resume text not available in history."
                      ? resumeData.resumeText
                      : (
                        <div className="flex flex-col items-center justify-center py-6 text-center text-slate-500 space-y-2">
                          <FileText className="w-8 h-8 opacity-50" />
                          <p>Source file is not available for this historical analysis.<br/>Try uploading a new resume to view the preview here.</p>
                        </div>
                      )
                    }
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}