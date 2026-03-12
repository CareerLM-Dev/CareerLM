// src/pages/ResumeEditorPage.js
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import ResumeEditor from "../components/ResumeEditor";
import SuggestionPanel from "../components/SuggestionPanel";
import {
  Download, FileCode, FileText, ArrowLeft, Loader2, AlertCircle,
  RefreshCw, CheckCircle, ExternalLink
} from "lucide-react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
// Resume endpoints are mounted under orchestrator in backend main.py
const RESUME_API = `${API_BASE}/api/v1/orchestrator`;

export default function ResumeEditorPage() {
  const { session } = useUser();
  const user = session?.user;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const versionIdParam = searchParams.get("versionId");

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [versionId, setVersionId] = useState(versionIdParam ? parseInt(versionIdParam) : null);
  const [sections, setSections] = useState({});
  const [originalSections, setOriginalSections] = useState({});
  const [suggestions, setSuggestions] = useState({ bullet_rewrites: [], improvements: [] });
  const [atsScore, setAtsScore] = useState(null);
  
  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingLatex, setIsGeneratingLatex] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [applyingSuggestionId, setApplyingSuggestionId] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const hasLoadedSections = Object.keys(sections || {}).length > 0;

  // Check for unsaved changes
  const hasUnsavedChanges = JSON.stringify(sections) !== JSON.stringify(originalSections);

  // Fetch resume data
  const fetchResumeData = useCallback(async (vid) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${RESUME_API}/editor/${vid}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to load resume");
      }
      
      setSections(data.sections || {});
      setOriginalSections(data.sections || {});
      setSuggestions(data.suggestions || { bullet_rewrites: [], improvements: [] });
      setAtsScore(data.ats_score);
      setVersionId(vid);
    } catch (err) {
      console.error("Error fetching resume:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Get latest version if no version ID provided
  const fetchLatestVersion = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const response = await fetch(`${RESUME_API}/user/${user.id}/latest-version`);
      const data = await response.json();
      
      if (data.success && data.version_id) {
        await fetchResumeData(data.version_id);
      } else {
        setError("No resume found. Please upload a resume first.");
        setLoading(false);
      }
    } catch (err) {
      console.error("Error fetching latest version:", err);
      setError("Failed to load your resume. Please try again.");
      setLoading(false);
    }
  }, [user?.id, fetchResumeData]);

  // Initial load
  useEffect(() => {
    if (versionIdParam) {
      fetchResumeData(parseInt(versionIdParam));
    } else {
      fetchLatestVersion();
    }
  }, [versionIdParam, fetchResumeData, fetchLatestVersion]);

  // Handle section changes
  const handleSectionChange = useCallback((sectionKey, value) => {
    setSections(prev => ({
      ...prev,
      [sectionKey]: value
    }));
    setSaveSuccess(false);
  }, []);

  // Save sections
  const handleSave = useCallback(async () => {
    if (!versionId) return;
    
    setIsSaving(true);
    setSaveSuccess(false);
    
    try {
      const response = await fetch(`${RESUME_API}/editor/${versionId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sections)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setOriginalSections({ ...sections });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        throw new Error(data.error || "Failed to save");
      }
    } catch (err) {
      console.error("Error saving:", err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [versionId, sections]);

  // Generate LaTeX
  const handleDownloadLatex = useCallback(async () => {
    setIsGeneratingLatex(true);
    
    try {
      const response = await fetch(`${RESUME_API}/generate-latex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sections)
      });
      
      const data = await response.json();
      
      if (data.success && data.latex_code) {
        // Download as .tex file
        const blob = new Blob([data.latex_code], { type: "text/x-latex" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "resume.tex";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        throw new Error(data.error || "Failed to generate LaTeX");
      }
    } catch (err) {
      console.error("Error generating LaTeX:", err);
      setError(err.message);
    } finally {
      setIsGeneratingLatex(false);
    }
  }, [sections]);

  // Generate PDF
  const handleDownloadPdf = useCallback(async () => {
    setIsGeneratingPdf(true);
    
    try {
      const response = await fetch(`${RESUME_API}/generate-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sections)
      });
      
      if (response.headers.get("content-type")?.includes("application/pdf")) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "resume.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // PDF compilation failed, but we might have LaTeX code
        const data = await response.json();
        if (data.latex_code) {
          // Offer LaTeX download as fallback
          const confirmDownload = window.confirm(
            "PDF generation failed. Would you like to download the LaTeX code instead? " +
            "You can compile it on Overleaf.com"
          );
          if (confirmDownload) {
            const blob = new Blob([data.latex_code], { type: "text/x-latex" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "resume.tex";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        } else {
          throw new Error(data.error || "Failed to generate PDF");
        }
      }
    } catch (err) {
      console.error("Error generating PDF:", err);
      setError(err.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [sections]);

  // Apply suggestion
  const handleApplySuggestion = useCallback(async (suggestion) => {
    if (!versionId) return;
    
    const suggestionId = `rewrite-${suggestions.bullet_rewrites.indexOf(suggestion)}`;
    setApplyingSuggestionId(suggestionId);
    
    const originalText = suggestion.before || suggestion.original || "";
    const replacementText = suggestion.after || suggestion.rewritten || "";
    const sectionKey = suggestion.section_key || "unknown";
    
    try {
      const response = await fetch(`${RESUME_API}/apply-suggestion?` + new URLSearchParams({
        version_id: versionId,
        suggestion_type: "bullet_rewrite",
        section_key: sectionKey,
        original_text: originalText,
        replacement_text: replacementText
      }), {
        method: "POST"
      });
      
      const data = await response.json();
      
      if (data.success && data.updated_sections) {
        // Update local state
        setSections(data.updated_sections);
        setOriginalSections(data.updated_sections);
        
        // Remove applied suggestion from list
        setSuggestions(prev => ({
          ...prev,
          bullet_rewrites: prev.bullet_rewrites.filter(s => s !== suggestion)
        }));
      } else {
        throw new Error(data.error || "Failed to apply suggestion");
      }
    } catch (err) {
      console.error("Error applying suggestion:", err);
      setError(err.message);
    } finally {
      setApplyingSuggestionId(null);
    }
  }, [versionId, suggestions.bullet_rewrites]);

  // Dismiss suggestion
  const handleDismissSuggestion = useCallback((suggestion) => {
    setSuggestions(prev => ({
      bullet_rewrites: prev.bullet_rewrites.filter(s => s !== suggestion),
      improvements: prev.improvements.filter(s => s !== suggestion)
    }));
  }, []);

  // Open in Overleaf
  const handleOpenInOverleaf = useCallback(async () => {
    setIsGeneratingLatex(true);
    
    try {
      const response = await fetch(`${RESUME_API}/generate-latex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sections)
      });
      
      const data = await response.json();
      
      if (data.success && data.latex_code) {
        // Create Overleaf URL with base64 encoded LaTeX
        window.open(`https://www.overleaf.com/docs?snip_uri=data:application/x-tex;base64,${btoa(data.latex_code)}`, "_blank");
      } else {
        throw new Error(data.error || "Failed to generate LaTeX");
      }
    } catch (err) {
      console.error("Error:", err);
      setError(err.message);
    } finally {
      setIsGeneratingLatex(false);
    }
  }, [sections]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading your resume...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !hasLoadedSections) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="bg-card border border-border rounded-xl p-8 max-w-md text-center">
          <div className="bg-destructive/10 rounded-full p-4 w-fit mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Unable to Load Resume</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate("/dashboard")}
              className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => fetchLatestVersion()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Top Bar */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Back to Dashboard</span>
          </button>
          <div className="h-6 w-px bg-border hidden sm:block" />
          <div className="hidden sm:block">
            <h1 className="text-lg font-semibold">Resume Editor</h1>
            {atsScore && (
              <p className="text-xs text-muted-foreground">
                ATS Score: <span className={`font-medium ${atsScore >= 75 ? "text-green-500" : atsScore >= 50 ? "text-amber-500" : "text-red-500"}`}>{atsScore}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Success indicator */}
          {saveSuccess && (
            <span className="flex items-center gap-1 text-green-500 text-sm">
              <CheckCircle className="w-4 h-4" />
              Saved
            </span>
          )}

          {/* Toggle suggestions */}
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showSuggestions ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            Suggestions
          </button>

          {/* Download buttons */}
          <button
            onClick={handleDownloadLatex}
            disabled={isGeneratingLatex}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 disabled:opacity-50 transition-colors"
          >
            {isGeneratingLatex ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileCode className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">LaTeX</span>
          </button>

          <button
            onClick={handleOpenInOverleaf}
            disabled={isGeneratingLatex}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 disabled:opacity-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden sm:inline">Overleaf</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isGeneratingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && hasLoadedSections && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-destructive hover:text-destructive/80"
          >
            ×
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Editor */}
        <div className={`flex-1 overflow-y-auto p-4 ${showSuggestions ? "lg:pr-2" : ""}`}>
          <ResumeEditor
            sections={sections}
            originalSections={originalSections}
            onChange={handleSectionChange}
            onSave={handleSave}
            isSaving={isSaving}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        </div>

        {/* Suggestions Panel */}
        {showSuggestions && (
          <div className="hidden lg:block w-96 border-l border-border overflow-y-auto p-4 bg-muted/30">
            <SuggestionPanel
              suggestions={suggestions}
              onApplySuggestion={handleApplySuggestion}
              onDismissSuggestion={handleDismissSuggestion}
              applyingSuggestionId={applyingSuggestionId}
            />
          </div>
        )}
      </div>

      {/* Mobile suggestions drawer trigger */}
      {showSuggestions && (
        <div className="lg:hidden fixed bottom-4 right-4">
          <button
            onClick={() => {/* Could implement mobile drawer */}}
            className="bg-primary text-primary-foreground rounded-full p-4 shadow-lg"
          >
            <FileText className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
