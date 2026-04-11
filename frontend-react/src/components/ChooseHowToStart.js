import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import {
  Upload,
  Wand2,
  Rocket,
  Lock,
  CheckCircle,
  FileText,
  AlertCircle,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "./ui/button";

const LOADING_STEPS = [
  "Parsing Resume...",
  "Extracting Skills...",
  "Scoring Structure...",
  "Running ATS Check...",
  "Generating Insights...",
];

function ChooseHowToStart() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("Analyzing...");
  const [loadingStep, setLoadingStep] = useState(0);
  const [existingResume, setExistingResume] = useState(null);
  const [checkingHistory, setCheckingHistory] = useState(true);
  const [showUploadAgain, setShowUploadAgain] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const fileInputRef = useRef(null);

  const MAX_RESUME_BYTES = 5 * 1024 * 1024;

  // Animate through loading steps
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingStep((s) => (s + 1) % LOADING_STEPS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [loading]);

  // Fetch user and check for existing resume
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        // Check for existing resume from localStorage
        const cachedResults = localStorage.getItem(
          `resume_analysis_${data.user.id}`
        );
        if (cachedResults) {
          try {
            const parsedResults = JSON.parse(cachedResults);
            setExistingResume(parsedResults);
          } catch (err) {
            console.error("Failed to parse cached resume:", err);
          }
        } else {
          // Try to fetch from orchestrator state
          try {
            const stateResponse = await fetch(
              `http://localhost:8000/api/v1/orchestrator/state/${data.user.id}`
            );
            const stateData = await stateResponse.json();
            if (stateData?.state?.resume_analysis?.overall_score) {
              setExistingResume({
                filename: stateData?.filename || "Resume",
                ats_score: stateData?.state?.resume_analysis?.overall_score,
              });
            }
          } catch (_) {
            // Silently fail if unable to fetch
          }
        }
      }
      setCheckingHistory(false);
    });
  }, []);

  const handleResumeChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setResumeFile(null);
      return;
    }
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

  const buildResumeDataFromOrchestrator = (payload, file) => {
    const state = payload?.state || {};
    const resumeAnalysis = payload?.resume_analysis || state.resume_analysis || {};
    return {
      filename: payload?.filename || file?.name,
      file,
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
      profile: payload?.profile || state.profile || {},
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
    if (!resumeFile) {
      setError("Please upload a resume to continue.");
      return;
    }

    setLoading(true);
    setLoadingStep(0);
    const controller = new AbortController();
    setAbortController(controller);

    const formData = new FormData();
    formData.append("user_id", userId);
    formData.append("resume", resumeFile);
    formData.append("job_description", "");

    try {
      const orchestratorResponse = await fetch(
        "http://localhost:8000/api/v1/orchestrator/analyze-resume",
        { method: "POST", body: formData, signal: controller.signal }
      );

      if (!orchestratorResponse.ok) {
        let errorDetail = "";
        try {
          errorDetail = await orchestratorResponse.text();
        } catch (_) {}
        throw new Error(errorDetail || "Analysis request failed.");
      }

      if (!orchestratorResponse.body) {
        throw new Error("Streaming response not available.");
      }

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
                const humanReadablePhase = data.phase
                  .split("_")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ");
                setStatusText(humanReadablePhase + "...");
              }
            } else if (data.event === "started") {
              setStatusText("Parsing Resume...");
            } else if (data.event === "error") {
              streamError = data.error || "Analysis failed";
              break;
            } else if (data.event === "complete") {
              _completeResult = buildResumeDataFromOrchestrator(
                data.result,
                resumeFile
              );
            }
          } catch (err) {
            console.error("Error parsing SSE chunk:", err);
          }
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
              _completeResult = buildResumeDataFromOrchestrator(
                data.result,
                resumeFile
              );
            } else if (data.event === "error") {
              streamError = data.error || "Analysis failed";
              break;
            }
          } catch (err) {
            console.error("Error parsing final SSE chunk:", err);
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!_completeResult) throw new Error("Stream closed before completion.");

      if (userId && _completeResult) {
        localStorage.setItem(`resume_analysis_${userId}`, JSON.stringify(_completeResult));
        setExistingResume(_completeResult);
      }

      // Redirect to results page
      navigate("/dashboard/upload-resume", { state: { resumeData: _completeResult } });
    } catch (err) {
      if (err.name === "AbortError") {
        setError("");
      } else {
        setError(err?.message || "Failed to analyze resume. Please try again.");
      }
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
          await fetch(`http://localhost:8000/api/v1/orchestrator/cancel/${userId}`, {
            method: "POST",
          });
        } catch (err) {
          console.error("Failed to cancel backend:", err);
        }
      }
      setLoading(false);
      setError("");
      setResumeFile(null);
      setShowUploadAgain(false);
    }
  };

  const handleClearExistingAndUploadAgain = () => {
    setShowUploadAgain(true);
    setResumeFile(null);
    setError("");
  };

  const handleBackToExisting = () => {
    setShowUploadAgain(false);
    setResumeFile(null);
  };

  return (
    <section className="mb-8">
      {/* Loading state overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-semibold text-foreground">{statusText}</p>
              <p className="text-sm text-muted-foreground">
                {LOADING_STEPS[loadingStep]}
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCancelAnalysis}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Heading */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-foreground mb-2">
          Choose how to start
        </h2>
        <p className="text-muted-foreground">
          Upload your existing document or let our AI guide you step-by-step.
        </p>
      </div>

      {/* Two-card layout */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Card 1: Upload Your Resume */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Upload className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          <h3 className="text-xl font-bold text-foreground mb-2">
            Upload Your Resume
          </h3>

          <p className="text-sm text-muted-foreground mb-4">
            Drag and drop your PDF or DOCX file here to get a detailed evaluation
            score and improvement suggestions.
          </p>

          {checkingHistory ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between animate-pulse">
              <div className="bg-muted rounded-lg p-4 h-16 w-full"></div>
              <div className="space-y-3">
                <div className="h-10 bg-muted rounded-md w-full"></div>
                <div className="h-10 bg-muted rounded-md w-full"></div>
              </div>
            </div>
          ) : existingResume && !showUploadAgain ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-foreground">
                      {existingResume.filename || "Your Resume"}
                    </p>
                    {existingResume.ats_score !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        ATS Score: {Math.round(existingResume.ats_score)}/100
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={() =>
                    navigate("/dashboard/resume-analyzer", {
                      state: { resumeData: existingResume },
                    })
                  }
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  View Results
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClearExistingAndUploadAgain}
                  className="w-full"
                >
                  Upload Another Resume
                </Button>
              </div>
            </div>
          ) : (
            // Upload dropzone
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center flex flex-col items-center justify-center flex-1 transition-colors ${
                  isDragging
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-border bg-background"
                }`}
              >
                <UploadCloud className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  Drop files here or click to upload
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  PDF or DOCX • Max 5MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleResumeChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  size="sm"
                >
                  Browse Files
                </Button>
              </div>

              {resumeFile && (
                <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <div className="text-sm">
                      <p className="font-medium text-foreground">
                        {resumeFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(resumeFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResumeFile(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <Button
                  type="submit"
                  disabled={!resumeFile}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Analyze Resume
                </Button>
                {showUploadAgain && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBackToExisting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Card 2: Build from Scratch */}
        <div className="bg-card border border-border rounded-xl p-6 relative flex flex-col">
          {/* Recommended badge */}
          <div className="absolute top-4 right-4 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
            Recommended
          </div>

          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
            <Wand2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>

          <h3 className="text-xl font-bold text-foreground mb-2">
            Build from Scratch
          </h3>

          <p className="text-sm text-muted-foreground mb-6 flex-1">
            Create a professional resume tailored to your industry using our AI
            builder. Answer a few questions and we'll handle the formatting.
          </p>

          <Button
            onClick={() => navigate("/resume-editor")}
            className="w-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <Rocket className="w-4 h-4" />
            Start Building
          </Button>
        </div>
      </div>

      {/* Privacy footer */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Privacy Guaranteed.</span>{" "}
            Your resume data is private and only used to generate insights. We do not
            share your personal information.
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
            <div className="flex items-center gap-1">
              <Lock className="w-4 h-4 text-emerald-500" />
              <span>Encrypted Upload</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>GDPR Compliant</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ChooseHowToStart;
