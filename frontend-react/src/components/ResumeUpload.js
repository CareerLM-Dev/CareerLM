import { useState, useEffect, useRef } from "react";
import { supabase } from "../api/supabaseClient";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import {
  AlertCircle,
  Upload,
  Zap,
  ChevronDown,
  FileText,
  X,
  Sparkles,
  Loader2,
} from "lucide-react";

const ROLE_OPTIONS = [
  { value: "software_engineer", label: "Software Engineer" },
  { value: "data_scientist", label: "Data Scientist" },
  { value: "data_analyst", label: "Data Analyst" },
  { value: "ml_engineer", label: "Machine Learning Engineer" },
  { value: "full_stack_developer", label: "Full Stack Developer" },
  { value: "devops_engineer", label: "DevOps Engineer" },
  { value: "product_manager", label: "Product Manager" },
  { value: "cloud_architect", label: "Cloud Architect" },
  { value: "cybersecurity_analyst", label: "Cybersecurity Analyst" },
  { value: "mobile_developer", label: "Mobile Developer" },
  { value: "business_analyst", label: "Business Analyst" },
  { value: "ux_ui_designer", label: "UI/UX Designer" },
];

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

const LOADING_STEPS = [
  "Parsing Resume...",
  "Extracting Skills...",
  "Scoring Structure...",
  "Running ATS Check...",
  "Generating Insights...",
];

function ResumeUpload({ 
  onResult, 
  hideIfResults = false,
  title = "Resume Analyzer",
  description = "AI-powered ATS scoring & tailored feedback"
}) {
  const [resumeFile, setResumeFile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [roleType, setRoleType] = useState("");
  const [profileRoles, setProfileRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("Analyzing...");
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [abortController, setAbortController] = useState(null);
  const [checkingHistory, setCheckingHistory] = useState(true);
  const [hasExistingResults, setHasExistingResults] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resumePdfUrl, setResumePdfUrl] = useState(null);
  const fileInputRef = useRef(null);
  const isSizeError =
    error.toLowerCase().includes("5mb") || error.toLowerCase().includes("file");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        try {
          const { data: profile } = await supabase
            .from("user")
            .select("questionnaire_answers")
            .eq("id", data.user.id)
            .single();
          if (profile?.questionnaire_answers) {
            const qa = profile.questionnaire_answers;
            const roles = Array.isArray(qa.target_role)
              ? qa.target_role
              : qa.target_role
                ? [qa.target_role]
                : [];
            setProfileRoles(roles);
            if (roles.length > 0) setRoleType(roles[0]);
          }
        } catch (_) {}

        const cachedResults = localStorage.getItem(
          `resume_analysis_${data.user.id}`
        );
        if (cachedResults) {
          setHasExistingResults(true);
        } else {
          try {
            const stateResponse = await fetch(
              `http://localhost:8000/api/v1/orchestrator/state/${data.user.id}`
            );
            const stateData = await stateResponse.json();
            if (stateData?.state?.resume_analysis?.overall_score) {
              setHasExistingResults(true);
            }
          } catch (_) {}
        }
      }
      setCheckingHistory(false);
    });
  }, []);

  // Animate through loading steps
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingStep((s) => (s + 1) % LOADING_STEPS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [loading]);

  const hasJD = jobDescription.trim().length > 50;

  useEffect(() => {
    if (resumeFile && resumeFile.type === "application/pdf") {
      const url = URL.createObjectURL(resumeFile);
      setResumePdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setResumePdfUrl(null);
  }, [resumeFile]);

  const handleResumeChange = (e) => {
    const file = e.target.files[0];
    if (!file) { setResumeFile(null); return; }
    if (file.size > MAX_RESUME_BYTES) {
      setError("Resume file must be 5MB or smaller.");
      setResumeFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setError("");
    setResumeFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      setError("Resume file must be 5MB or smaller.");
      return;
    }
    setError("");
    setResumeFile(file);
  };

  const handleJDChange = (e) => setJobDescription(e.target.value);

  const buildResumeDataFromOrchestrator = (payload, file, jd, role) => {
    const state = payload?.state || {};
    const resumeAnalysis = payload?.resume_analysis || state.resume_analysis || {};
    const profile = payload?.profile || state.profile || {};
    return {
      filename: payload?.filename || file?.name,
      file, jobDescription: jd, roleType: role,
      resumeText: payload?.resume_text || state.resume_text || payload?.raw_text || "",
      current_phase: payload?.current_phase || state.current_phase,
      supervisor_decision: payload?.supervisor_decision || state.supervisor_decision,
      waiting_for_user: payload?.waiting_for_user || state.waiting_for_user,
      waiting_for_input_type: payload?.waiting_for_input_type || state.waiting_for_input_type,
      score_delta: payload?.score_delta,
      ats_score: payload?.resume_score ?? resumeAnalysis.overall_score ?? 0,
      score_zone: resumeAnalysis.score_zone || "",
      structure_score: resumeAnalysis.structure_score ?? 0,
      completeness_score: resumeAnalysis.completeness_score ?? 0,
      relevance_score: resumeAnalysis.relevance_score ?? 0,
      impact_score: resumeAnalysis.impact_score ?? 0,
      profile,
      strengths: resumeAnalysis.strengths || [],
      weaknesses: resumeAnalysis.weaknesses || [],
      suggestions: resumeAnalysis.suggestions || [],
    };
  };

  const parseSsePayloads = (rawChunk) => {
    const events = rawChunk.split("\n\n");
    const remainder = events.pop() || "";
    const payloads = [];
    for (const event of events) {
      const lines = event.split("\n");
      const dataLines = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, ""));
      if (dataLines.length === 0) continue;
      payloads.push(dataLines.join("\n").trim());
    }
    return { payloads, remainder };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!resumeFile) { setError("Please upload a resume to continue."); return; }
    setLoading(true);
    setLoadingStep(0);
    const controller = new AbortController();
    setAbortController(controller);
    const formData = new FormData();
    formData.append("user_id", userId);
    formData.append("resume", resumeFile);
    formData.append("job_description", jobDescription);
    if (roleType) formData.append("job_title", roleType);

    try {
      const orchestratorResponse = await fetch(
        "http://localhost:8000/api/v1/orchestrator/analyze-resume",
        { method: "POST", body: formData, signal: controller.signal }
      );
      if (!orchestratorResponse.ok) {
        let errorDetail = "";
        try { errorDetail = await orchestratorResponse.text(); } catch (_) {}
        throw new Error(errorDetail || "Analysis request failed.");
      }
      if (!orchestratorResponse.body) throw new Error("Streaming response not available.");

      const reader = orchestratorResponse.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let _completeResult = null;
      let buffer = "";
      let streamError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { payloads, remainder } = parseSsePayloads(buffer);
        buffer = remainder;
        for (const payload of payloads) {
          try {
            if (!payload) continue;
            const data = JSON.parse(payload);
            if (data.event === "update" && data.phase) {
              if (data.phase_label) setStatusText(data.phase_label);
              else {
                const humanReadablePhase = data.phase.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                setStatusText(humanReadablePhase + "...");
              }
            } else if (data.event === "started") {
              setStatusText("Parsing Resume...");
            } else if (data.event === "error") {
              streamError = data.error || "Analysis failed"; break;
            } else if (data.event === "complete") {
              _completeResult = buildResumeDataFromOrchestrator(data.result, resumeFile, jobDescription, roleType);
            }
          } catch (err) { console.error("Error parsing SSE chunk:", err); }
        }
        if (streamError) break;
      }

      if (!streamError && buffer.includes("data:")) {
        const { payloads } = parseSsePayloads(buffer + "\n\n");
        for (const payload of payloads) {
          try {
            if (!payload) continue;
            const data = JSON.parse(payload);
            if (data.event === "complete") {
              _completeResult = buildResumeDataFromOrchestrator(data.result, resumeFile, jobDescription, roleType);
            } else if (data.event === "error") { streamError = data.error || "Analysis failed"; break; }
          } catch (err) { console.error("Error parsing final SSE chunk:", err); }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!_completeResult) throw new Error("Stream closed before completion.");

      if (userId && _completeResult) {
        localStorage.setItem(`resume_analysis_${userId}`, JSON.stringify(_completeResult));
        setHasExistingResults(true);
      }
      if (onResult) onResult(_completeResult);
      // Signal GlobalFloatingHelper to invalidate its recommendations cache
      window.dispatchEvent(new CustomEvent("careerlm:resume_analyzed"));
    } catch (err) {
      if (err.name === "AbortError") { setError(""); }
      else { setError(err?.message || "Failed to complete analysis. Please try again."); }
    } finally {
      setLoading(false);
      setStatusText("Analyzing...");
      setAbortController(null);
    }
  };

  const handleCancelAnalysis = async () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      if (userId) {
        try {
          await fetch(`http://localhost:8000/api/v1/orchestrator/cancel/${userId}`, { method: "POST" });
        } catch (err) { console.error("Failed to cancel backend:", err); }
      }
      setLoading(false);
      setError("");
    }
  };

  if (checkingHistory) {
    return (
      <div className="w-full h-[500px] animate-pulse rounded-2xl border border-border bg-card shadow-lg flex flex-col p-6">
        <div className="h-8 bg-muted rounded-md w-1/3 mb-6"></div>
        <div className="flex gap-6 h-full">
          <div className="w-1/2 h-full bg-muted rounded-xl"></div>
          <div className="w-1/2 h-full bg-muted rounded-xl space-y-4">
            <div className="h-6 bg-muted-foreground/20 rounded-md w-full"></div>
            <div className="h-6 bg-muted-foreground/20 rounded-md w-3/4"></div>
            <div className="h-6 bg-muted-foreground/20 rounded-md w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (hideIfResults && hasExistingResults) return null;

  return (
    <div className="relative">
      {/* ── Loading Overlay ── */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-[90%] max-w-sm">
            {/* Glow ring */}
            <div className="absolute inset-0 rounded-2xl bg-indigo-500/20 blur-2xl scale-110" />
            <div className="relative rounded-2xl border border-white/10 bg-slate-900/95 p-7 text-center shadow-2xl">
              {/* Animated icon */}
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/40">
                <Sparkles className="h-7 w-7 animate-pulse text-white" />
              </div>
              {/* Step dots */}
              <div className="mb-3 flex justify-center gap-1.5">
                {LOADING_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i === loadingStep
                        ? "w-5 bg-indigo-400"
                        : i < loadingStep
                        ? "w-1.5 bg-indigo-600/50"
                        : "w-1.5 bg-slate-600"
                    }`}
                  />
                ))}
              </div>
              <p className="text-sm font-semibold text-white">{statusText}</p>
              <p className="mt-1 text-xs text-slate-400">
                This may take a minute or two
              </p>
              <button
                type="button"
                onClick={handleCancelAnalysis}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-400 transition hover:bg-rose-500/20"
              >
                <X className="h-3.5 w-3.5" /> Cancel Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Card ── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/5">
        {/* Header gradient bar */}
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />

        <div className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/30">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">{title}</h2>
              <p className="text-xs text-muted-foreground">
                {description}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hidden Input for Both */}
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleResumeChange}
              className="hidden"
              id="resume-file"
              ref={fileInputRef}
            />

            {/* ── Left: Drop Zone OR PDF Viewer (spans 2 cols on desktop) ── */}
            <div className="lg:col-span-2 flex flex-col h-full h-min-[160px]">
              {error && isSizeError && (
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {resumeFile ? (
                <div className="w-full h-full min-h-[500px] border border-border rounded-xl overflow-hidden bg-muted/20 relative shadow-inner">
                  {resumePdfUrl ? (
                    <object
                      data={resumePdfUrl}
                      type="application/pdf"
                      width="100%"
                      height="100%"
                      className="absolute inset-0"
                    >
                      <div className="flex flex-col items-center justify-center p-8 h-full bg-muted/20">
                        <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-sm font-medium">PDF preview not available in this browser</p>
                        <p className="text-xs text-muted-foreground mt-1 text-center">Your file {resumeFile.name} is ready for analysis.</p>
                      </div>
                    </object>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 h-full bg-muted/20">
                      <FileText className="h-10 w-10 text-indigo-400 mb-3" />
                      <p className="text-sm font-medium">Document selected</p>
                      <p className="text-xs text-muted-foreground mt-1 text-center">Your file {resumeFile.name} is ready to be analyzed. Previews are only available for PDFs.</p>
                    </div>
                  )}
                </div>
              ) : (
                <label
                  htmlFor="resume-file"
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`group relative flex flex-1 w-full min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 transition-all duration-300 ${
                    isDragging
                      ? "border-violet-500 bg-violet-500/10 shadow-inner shadow-violet-500/10"
                      : "border-border bg-muted/20 hover:border-indigo-400/60 hover:bg-indigo-500/5"
                  }`}
                >
                  {/* Glow on drag */}
                  {isDragging && (
                    <div className="pointer-events-none absolute inset-0 rounded-xl bg-violet-500/5 ring-2 ring-violet-400/40 ring-inset" />
                  )}
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
                        isDragging
                          ? "bg-violet-500/20"
                          : "bg-muted/50 group-hover:bg-indigo-500/10"
                      }`}
                    >
                      <Upload
                        className={`h-5 w-5 transition-colors ${
                          isDragging
                            ? "text-violet-500"
                            : "text-muted-foreground group-hover:text-indigo-500"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {isDragging ? "Drop it here" : "Drag & drop your resume"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        PDF or DOCX · max 5 MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                      className="rounded-lg border border-border bg-background px-4 py-1.5 text-xs font-semibold shadow-sm hover:bg-muted transition-colors"
                    >
                      Browse Files
                    </button>
                  </div>
                </label>
              )}
            </div>

            {/* ── Right: JD + Role Panel + Changed File Drop Zone (1 col) ── */}
            <div className="lg:col-span-1 flex flex-col gap-5">
              <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-5 space-y-4 hover:border-indigo-400/30 hover:bg-card/70 transition-all duration-300">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Targeting Details
              </p>
              <div className="space-y-4">
                {/* JD */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="job-description"
                    className="text-xs font-medium text-foreground"
                  >
                    Job Description{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="job-description"
                    value={jobDescription}
                    onChange={handleJDChange}
                    rows={4}
                    placeholder="Paste the job description to get keyword-matched analysis..."
                    className="resize-none text-sm bg-background border border-border/60 rounded-lg placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 focus:shadow-lg focus:shadow-indigo-500/10 transition-all duration-200"
                  />
                  {hasJD && (
                    <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                      Role will be extracted from JD
                    </p>
                  )}
                </div>

                {/* Role */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="role-type"
                    className="text-xs font-medium text-foreground"
                  >
                    Target Role{" "}
                    {!hasJD && (
                      <span className="text-rose-500 font-semibold">*</span>
                    )}
                  </Label>
                  <div className="relative">
                    <select
                      id="role-type"
                      value={roleType}
                      onChange={(e) => setRoleType(e.target.value)}
                      disabled={hasJD}
                      className="w-full appearance-none rounded-lg border border-border/60 bg-background px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 focus:shadow-lg focus:shadow-indigo-500/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select a role...</option>
                      {profileRoles.length > 0 && (
                        <optgroup label="From your profile">
                          {profileRoles.map((r) => {
                            const opt = ROLE_OPTIONS.find((o) => o.value === r);
                            return opt ? (
                              <option key={r} value={r}>{opt.label}</option>
                            ) : null;
                          })}
                        </optgroup>
                      )}
                      <optgroup label={profileRoles.length > 0 ? "All roles" : "Select a role"}>
                        {ROLE_OPTIONS.filter((o) => !profileRoles.includes(o.value)).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </optgroup>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                  {!hasJD && profileRoles.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-indigo-500">
                      <Sparkles className="h-3 w-3" /> Pre-filled from your profile
                    </p>
                  )}

                  {/* Info pill */}
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 hover:bg-amber-500/12 transition-colors duration-200">
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      <span className="font-semibold">Pro tip:</span> Pasting a
                      JD gives you keyword-matched scoring and tailored
                      suggestions.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Uploaded File Block inside Right Col */}
              {resumeFile && (
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 backdrop-blur-sm p-5 space-y-4 shadow-inner">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Selected Document
                  </p>
                  <div className="flex flex-col gap-3 relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/30 shrink-0">
                      <FileText className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div className="w-full">
                      <p className="w-full line-clamp-1 break-all text-sm font-semibold text-foreground" title={resumeFile.name}>
                        {resumeFile.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {(resumeFile.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex w-full mt-2 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold shadow-sm hover:bg-muted transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        setResumeFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      Change File
                    </button>
                    <div className="flex justify-center items-center gap-1.5 mt-2 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Ready to analyze
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Submit ── */}
            {loading ? (
              <div className="lg:col-span-3 flex gap-3">
                <button
                  type="button"
                  disabled
                  className="flex flex-1 items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-sm font-semibold text-white opacity-80 cursor-not-allowed shadow-lg shadow-indigo-500/25"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {statusText}
                </button>
                <button
                  type="button"
                  onClick={handleCancelAnalysis}
                  className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-500 transition-all duration-200 hover:bg-rose-500/20 hover:border-rose-500/60 hover:-translate-y-1 active:translate-y-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!resumeFile || (!jobDescription.trim().length && !roleType)}
                className="group relative col-span-1 lg:col-span-3 flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* Shimmer */}
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <Zap className="h-4 w-4" />
                Analyze Resume
              </button>
            )}
          </form>
        </div>
      </div>

      {/* ── Non-size errors ── */}
      {error && !isSizeError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export default ResumeUpload;