import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { Upload, FileText, CheckCircle, XCircle, Zap } from "lucide-react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
const RESUME_API = `${API_BASE}/api/v1/orchestrator`;

function FeedbackList({ items, icon: Icon, emptyLabel, showBulletRewrite = false }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 p-3 bg-muted/40 border border-border rounded-lg">
          <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="w-full">
            <p className="text-sm font-semibold leading-snug">{item.suggestion || item.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.explanation}</p>
            {showBulletRewrite && item.bullet_rewrite && (
              <div className="mt-2 p-2 bg-primary/5 border border-primary/20 rounded text-xs font-mono text-foreground">
                ↳ {item.bullet_rewrite}
              </div>
            )}
            {!showBulletRewrite && item.evidence && (
              <p className="text-xs text-muted-foreground mt-1">Evidence: {item.evidence}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
function ResumeResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [resumeData, setResumeData] = useState(location.state?.resumeData);
  const [loading, setLoading] = useState(!location.state?.resumeData);
  const [openingEditor, setOpeningEditor] = useState(false);

  useEffect(() => {
    // If no data from navigation, try to load from localStorage or backend
    if (!resumeData) {
      const loadPreviousAnalysis = async () => {
        try {
          const { data } = await supabase.auth.getUser();
          if (!data?.user) {
            setLoading(false);
            return;
          }

          const userId = data.user.id;

          // First check localStorage
          const cached = localStorage.getItem(`resume_analysis_${userId}`);
          if (cached) {
            const parsedData = JSON.parse(cached);
            setResumeData(parsedData);
            setLoading(false);
            return;
          }

          // Fallback to backend state
          const stateResponse = await fetch(
            `http://localhost:8000/api/v1/orchestrator/state/${userId}`
          );
          const stateData = await stateResponse.json();
          const state = stateData?.state;

          if (state?.resume_analysis?.overall_score) {
            const analysis = state.resume_analysis;
            const reconstructed = {
              filename: analysis.resume_text?.substring(0, 50) + "..." || "Previous Resume",
              ats_score: analysis.ats_score,
              structure_score: analysis.structure_score,
              completeness_score: analysis.completeness_score,
              relevance_score: analysis.relevance_score,
              impact_score: analysis.impact_score,
              strengths: analysis.strengths || [],
              weaknesses: analysis.weaknesses || [],
              suggestions: analysis.suggestions || [],
            };
            setResumeData(reconstructed);
            // Cache it
            localStorage.setItem(`resume_analysis_${userId}`, JSON.stringify(reconstructed));
          }
        } catch (err) {
          console.error("Failed to load previous analysis:", err);
        } finally {
          setLoading(false);
        }
      };

      loadPreviousAnalysis();
    }
  }, [resumeData]);

  const handleOpenEditor = async () => {
    try {
      setOpeningEditor(true);
      const { data } = await supabase.auth.getUser();
      if (!data?.user?.id) {
        return;
      }

      const response = await fetch(`${RESUME_API}/user/${data.user.id}/latest-version`);
      const payload = await response.json();
      if (!payload?.version_id) {
        window.alert("No resume version found yet. Upload a resume first.");
        return;
      }

      navigate(`/resume-editor?versionId=${payload.version_id}`);
    } catch (error) {
      console.error("Failed to open resume editor:", error);
      window.alert("Unable to open resume editor right now.");
    } finally {
      setOpeningEditor(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full bg-background">
        <main className="w-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading analysis...</p>
          </div>
        </main>
      </div>
    );
  }

  // No data guard
  if (!resumeData) {
    return (
      <div className="flex h-full bg-background">
        <main className="w-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center p-6">
            <p className="text-muted-foreground">No analysis data found. Please upload a resume first.</p>
            <button
              onClick={() => navigate("/dashboard/resume-analyzer")}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
            >
              <Upload className="w-4 h-4" />
              Upload Resume
            </button>
          </div>
        </main>
      </div>
    );
  }

  const {
    filename,
    ats_score,
    structure_score,
    completeness_score,
    relevance_score,
    impact_score,
    strengths = [],
    weaknesses = [],
    suggestions = [],
  } = resumeData;

  return (
    <div className="flex h-full bg-background">
      <main className="w-full overflow-auto no-scrollbar">
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
          {/* ── Page header ─────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Resume Analysis</h1>
              {filename && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {filename}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleOpenEditor}
                disabled={openingEditor}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {openingEditor ? "Opening..." : "Edit in Resume Editor"}
              </button>
              <button
                onClick={() => navigate("/dashboard/resume-analyzer")}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Another
              </button>
            </div>
          </div>

          {/* ── Scores ─────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm mb-3">Score Breakdown</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">ATS</p>
                <p className="text-lg font-semibold">{ats_score ?? "--"}</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Structure</p>
                <p className="text-lg font-semibold">{structure_score ?? "--"}</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Completeness</p>
                <p className="text-lg font-semibold">{completeness_score ?? "--"}</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Relevance</p>
                <p className="text-lg font-semibold">{relevance_score ?? "--"}</p>
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Impact</p>
                <p className="text-lg font-semibold">{impact_score ?? "--"}</p>
              </div>
            </div>
          </div>

          {/* ── Strengths ─────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              Strengths
            </h2>
            <FeedbackList items={strengths} icon={CheckCircle} emptyLabel="No strengths identified yet." />
          </div>

          {/* ── Weaknesses ─────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
              <XCircle className="w-4 h-4 text-rose-600" />
              Weaknesses
            </h2>
            <FeedbackList items={weaknesses} icon={XCircle} emptyLabel="No weaknesses identified yet." />
          </div>

          {/* ── Suggestions ───────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              Suggestions
            </h2>
            <FeedbackList items={suggestions} icon={Zap} emptyLabel="No suggestions yet." showBulletRewrite />
          </div>
        </div>
      </main>
    </div>
  );
}

export default ResumeResultsPage;
