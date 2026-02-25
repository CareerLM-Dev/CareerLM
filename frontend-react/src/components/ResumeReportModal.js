import React, { useRef, useState } from "react";
import { X, Download, FileText, CheckCircle, AlertTriangle, Zap, Target, BookOpen, Star, Loader2 } from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────
const pct = (v) => Math.round(v ?? 0);

function ScoreBar({ label, value, note }) {
  const v = pct(value);
  const barColor = v >= 75 ? "#22c55e" : v >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "#6b7280" }}>
          {label}
          {note && <span style={{ fontSize: 11, marginLeft: 4, color: "#9ca3af" }}>({note})</span>}
        </span>
        <span style={{ fontWeight: 600 }}>{v}/100</span>
      </div>
      <div style={{ height: 6, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${v}%`, background: barColor, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color = "#111827" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14,
      borderBottom: "1px solid #e5e7eb", paddingBottom: 8, marginBottom: 12, color }}>
      <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
      {title}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles =
    status === "present"
      ? { background: "#dcfce7", color: "#166534" }
      : status === "missing"
      ? { background: "#fee2e2", color: "#991b1b" }
      : { background: "#fef9c3", color: "#854d0e" }; // partially_present
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600, ...styles }}>
      {(status || "unknown").replace("_", " ")}
    </span>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function ResumeReportModal({ resumeData, onClose }) {
  const printRef = useRef(null);      // whole modal shell
  const contentRef = useRef(null);    // report body only (what we capture)
  const [downloading, setDownloading] = useState(false);

  if (!resumeData) return null;

  const handleDownload = async () => {
    const source = contentRef.current;
    if (!source || downloading) return;
    setDownloading(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const safeName = (resumeData.filename || "resume")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9_-]/gi, "_");

      // Clone the content node into an off-screen wrapper.
      // position:absolute + top:-99999px keeps it above the viewport so the
      // browser fully lays it out (unlike fixed+left:-9999px which skips paint).
      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "position:absolute;top:-99999px;left:0;width:850px;pointer-events:none;";

      const clone = source.cloneNode(true);
      clone.style.cssText =
        "background:white;color:#1f2937;width:850px;padding:40px;box-sizing:border-box;font-family:sans-serif;";

      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      // Small delay so the browser finishes painting before html2canvas reads pixels
      await new Promise((r) => setTimeout(r, 150));

      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `${safeName}_CareerLM_Report.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            scrollX: 0,
            scrollY: -window.scrollY,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(clone)
        .save();

      document.body.removeChild(wrapper);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  const {
    filename,
    ats_score,
    score_zone,
    structure_score,
    completeness_score,
    relevance_score,
    impact_score,
    has_job_description,
    role_type,
    year_of_study,
    ats_analysis = {},
    analysis = {},
    // All of these are top-level fields in the API response
    keyword_gap_table = [],
    skills_analysis = [],
    honest_improvements = [],
    human_reader_issues = [],
    redundancy_issues = [],
    bullet_rewrites = [],
    bullet_quality_breakdown = {},
    learning_roadmap = [],
    job_readiness_estimate,
    overall_readiness,
    ready_skills = [],
    critical_gaps = [],
    learning_priorities = [],
    // structure_suggestions is top-level from API
    structure_suggestions: topLevelStructure = [],
  } = resumeData;

  // structure_suggestions: top-level → nested in analysis → nested in ats_analysis
  const structure_suggestions =
    topLevelStructure.length > 0
      ? topLevelStructure
      : analysis?.structure_suggestions || ats_analysis?.structure_suggestions || [];
  const readability_issues = ats_analysis?.readability_issues || [];
  const justification = ats_analysis?.justification || [];
  const weakest = ats_analysis?.component_scores?._weakest_dimension;
  const weightsNote = ats_analysis?.component_scores?._weights_note || "";

  const zoneColor =
    score_zone === "Strong, minor refinements needed"
      ? "bg-green-100 text-green-800 border-green-200"
      : score_zone === "Good foundation, clear gaps"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-red-100 text-red-800 border-red-200";

  const scoreColor =
    (ats_score ?? 0) >= 75 ? "#22c55e"
    : (ats_score ?? 0) >= 50 ? "#f59e0b"
    : "#ef4444";

  return (
    <>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 md:p-8 no-print"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        {/* Modal shell */}
        <div
          id="report-print-root"
          ref={printRef}
          className="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl"
        >
          {/* Sticky header */}
          <div className="no-print sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="font-semibold leading-none">Full Resume Report</p>
                {filename && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{filename}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {downloading ? "Generating…" : "Download PDF"}
              </button>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Report body — contentRef is what gets captured for PDF */}
          <div ref={contentRef} className="p-6 md:p-8 space-y-8 text-gray-800 text-sm bg-white">

            {/* ── 1. SCORE OVERVIEW ─────────────────────────────────────────── */}
            <div className="print-page flex flex-col sm:flex-row items-center sm:items-start gap-6 rounded-xl p-5 border" style={{ borderColor: "#e5e7eb", background: "#f9fafb" }}>
              {/* CSS ring — no SVG, no transform, renders cleanly in html2canvas */}
              <div className="flex-shrink-0 flex flex-col items-center gap-2">
                <div style={{
                  position: "relative", width: 120, height: 120,
                  borderRadius: "50%",
                  background: `conic-gradient(${scoreColor} 0% ${ats_score ?? 0}%, #e5e7eb ${ats_score ?? 0}% 100%)`,
                }}>
                  {/* inner white disc */}
                  <div style={{
                    position: "absolute", top: 14, left: 14,
                    width: 92, height: 92,
                    borderRadius: "50%",
                    background: "white",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
                      {ats_score ?? "--"}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-500">Resume Score</span>
                {score_zone && (
                  <span style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 999, fontWeight: 600, border: "1px solid",
                    ...(score_zone === "Strong, minor refinements needed"
                      ? { background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" }
                      : score_zone === "Good foundation, clear gaps"
                      ? { background: "#fef9c3", color: "#854d0e", borderColor: "#fde68a" }
                      : { background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" }),
                  }}>
                    {score_zone}
                  </span>
                )}
              </div>
              {/* Metadata */}
              <div className="flex-1 space-y-3">
                <div>
                  <h2 className="text-xl font-bold">{filename || "Resume"}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {role_type?.replace("_", " ") || "General"}{year_of_study ? ` · Year ${year_of_study}` : ""}
                    {" · "}
                    {has_job_description ? "JD-aligned analysis (weights: 15/10/40/35)" : "Role baseline analysis (weights: 20/15/30/35)"}
                  </p>
                </div>
                {/* 4 dimension scores */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <ScoreBar label="Structure & Formatting" value={structure_score} note={weakest === "Structure & Formatting" ? "lowest" : null} />
                  <ScoreBar label="Section Completeness" value={completeness_score} note={weakest === "Section Completeness" ? "lowest" : null} />
                  <ScoreBar label="Keyword & Relevance" value={relevance_score} note={weakest === "Keyword & Relevance" ? "lowest" : null} />
                  <ScoreBar label="Impact & Specificity" value={impact_score} note={weakest === "Impact & Specificity" ? "lowest" : null} />
                </div>
                {weightsNote && <p className="text-xs text-gray-400 mt-1">{weightsNote}</p>}
              </div>
            </div>

            {/* ── 2. DIMENSION JUSTIFICATION ────────────────────────────────── */}
            {justification.length > 0 && (
              <div className="print-page">
                <SectionHeader icon={Target} title="Score Rationale" />
                <ul className="space-y-1">
                  {justification.map((j, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-primary mt-0.5">{"•"}</span>
                      <span>{j}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── 3. BULLET QUALITY ─────────────────────────────────────────── */}
            {Object.keys(bullet_quality_breakdown).length > 0 && (
              <div className="print-page">
                <SectionHeader icon={Zap} title="Bullet Quality Breakdown" />
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Action Verbs", key: "action_verbs" },
                    { label: "Metrics / Numbers", key: "metrics" },
                    { label: "Clarity", key: "clarity" },
                  ].map(({ label, key }) => {
                    const val = Math.round((bullet_quality_breakdown[key] ?? 0) * 100);
                    const color = val >= 75 ? "#16a34a" : val >= 50 ? "#d97706" : "#dc2626";
                    return (
                      <div key={key} style={{ background: "#f9fafb", borderRadius: 8, padding: 12, textAlign: "center" }}>
                        <p style={{ fontSize: 22, fontWeight: 700, color }}>{val}%</p>
                        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 4. KEYWORD / ROLE ALIGNMENT GAP TABLE ─────────────────────── */}
            {keyword_gap_table.length > 0 && (
              <div className="print-page">
                <SectionHeader icon={Target} title={has_job_description ? "JD Keyword Gap Table" : "Role Baseline Gap Table"} />
                {!has_job_description && (
                  <p className="text-xs text-gray-400 italic mb-2">No JD provided — using general role baseline.</p>
                )}
                <div className="space-y-2">
                  {keyword_gap_table.map((item, i) => (
                    <div
                      key={i}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2.5 rounded-lg border text-sm
                        ${item.status === "present" ? "border-green-200 bg-green-50 dark:bg-green-950/20" :
                          item.status === "missing" ? "border-red-200 bg-red-50 dark:bg-red-950/20" :
                          "border-amber-200 bg-amber-50 dark:bg-amber-950/20"}`}
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge status={item.status} />
                        <span className="font-medium">{item.keyword}</span>
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5 sm:text-right">
                        {item.jd_context && <p>{item.jd_context}</p>}
                        {item.resume_evidence && item.resume_evidence !== "Not found in resume" && (
                          <p className="text-gray-400">Found: {item.resume_evidence}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 5. SKILLS ANALYSIS ────────────────────────────────────────── */}
            {(ready_skills.length > 0 || critical_gaps.length > 0 || overall_readiness) && (
              <div className="print-page">
                <SectionHeader icon={Star} title="Skill & Role Fit" />
                {overall_readiness && (
                  <p className="text-sm mb-3 text-gray-600 dark:text-gray-300 italic">{overall_readiness}</p>
                )}
                {job_readiness_estimate && (
                  <p className="text-sm mb-3 font-medium">Readiness estimate: {job_readiness_estimate}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {ready_skills.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5">Strengths ({ready_skills.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ready_skills.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs rounded-full border border-green-200">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {critical_gaps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1.5">Critical Gaps ({critical_gaps.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {critical_gaps.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs rounded-full border border-red-200">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 6. FORMATTING & STRUCTURE ISSUES ──────────────────────────── */}
            {(structure_suggestions.length > 0 || readability_issues.length > 0) && (
              <div className="print-page">
                <SectionHeader icon={AlertTriangle} title="Formatting & Structure Issues" />
                <div className="space-y-2">
                  {[...structure_suggestions, ...readability_issues].map((item, i) => (
                    <div key={i} className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="font-semibold text-sm">{item.title}</p>
                      <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">{item.explanation}</p>
                      {item.evidence && (
                        <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{item.evidence}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 7. EXPLAINABLE IMPROVEMENTS ───────────────────────────────── */}
            {honest_improvements.length > 0 && (
              <div className="print-page">
                <SectionHeader icon={Zap} title="Explainable Improvements" color="#d97706" />
                <div className="space-y-2">
                  {honest_improvements.map((item, i) => (
                    <div key={i} className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="font-semibold text-sm">{item.title}</p>
                      <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">{item.explanation}</p>
                      {item.evidence && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1"><strong>Evidence:</strong> {item.evidence}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 8. BULLET REWRITES ────────────────────────────────────────── */}
            {bullet_rewrites.length > 0 && (
              <div className="print-page">
                <SectionHeader icon={Zap} title="Bullet Rewrites" />
                <div className="space-y-3">
                  {bullet_rewrites.map((item, i) => (
                    <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Original</p>
                        <p className="text-sm mt-0.5">{item.original}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950/20 px-3 py-2">
                        <p className="text-xs text-green-700 font-semibold uppercase tracking-wide">Rewritten</p>
                        <p className="text-sm mt-0.5">{item.rewritten}</p>
                      </div>
                      {item.reason && (
                        <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs text-gray-500">{item.reason}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 9. HUMAN READER ISSUES ────────────────────────────────────── */}
            {human_reader_issues.length > 0 && (
              <div className="print-page">
                <SectionHeader icon={AlertTriangle} title="Human Reader Issues" />
                <div className="space-y-2">
                  {human_reader_issues.map((item, i) => (
                    <div key={i} className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                      <p className="font-semibold text-sm">{item.title}</p>
                      <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">{item.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 10. REDUNDANCY & NOISE ────────────────────────────────────── */}
            {redundancy_issues.length > 0 && (
              <div className="print-page">
                <SectionHeader icon={AlertTriangle} title="Redundancy & Noise" />
                <div className="space-y-2">
                  {redundancy_issues.map((item, i) => (
                    <div key={i} className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <p className="font-semibold text-sm">{item.title}</p>
                      <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">{item.explanation}</p>
                      {item.evidence && <p className="text-xs text-orange-700 mt-1">{item.evidence}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 11. LEARNING ROADMAP ──────────────────────────────────────── */}
            {(learning_roadmap.length > 0 || learning_priorities.length > 0) && (
              <div className="print-page">
                <SectionHeader icon={BookOpen} title="Learning Roadmap" color="#2563eb" />
                <ol className="space-y-1.5 list-none">
                  {[...learning_roadmap, ...learning_priorities].map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* ── 12. SKILLS DETAIL ─────────────────────────────────────────── */}
            {skills_analysis.length > 0 && (
              <div className="print-page">
                <SectionHeader icon={CheckCircle} title="Detailed Skill Breakdown" />
                <div className="space-y-2">
                  {skills_analysis.map((item, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.skill}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.explanation}</p>
                        {item.evidence && <p className="text-xs text-gray-400 mt-0.5">Evidence: {item.evidence}</p>}
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-200 dark:border-gray-700">
              Generated by CareerLM · {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
