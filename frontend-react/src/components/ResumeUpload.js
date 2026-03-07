import { useState, useEffect } from "react";
import { supabase } from "../api/supabaseClient";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import { Upload, Zap, ChevronDown } from "lucide-react";

// Role labels matching questionnaire values
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


function ResumeUpload({ onResult, hideIfResults = false }) {
  const [resumeFile, setResumeFile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [roleType, setRoleType] = useState("");
  const [profileRoles, setProfileRoles] = useState([]);   // roles from questionnaire
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [abortController, setAbortController] = useState(null);
  const [hasExistingResults, setHasExistingResults] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        // Fetch questionnaire answers to pre-populate role & year
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
        } catch (_) {
          // Profile fetch failing is fine -- user can still use the form
        }

        // Check for existing results in localStorage or backend
        const cachedResults = localStorage.getItem(`resume_analysis_${data.user.id}`);
        if (cachedResults) {
          setHasExistingResults(true);
        } else {
          // Check backend for previous analysis
          try {
            const stateResponse = await fetch(
              `http://localhost:8000/api/v1/orchestrator/state/${data.user.id}`
            );
            const stateData = await stateResponse.json();
            if (stateData?.state?.resume_analysis?.overall_score) {
              setHasExistingResults(true);
            }
          } catch (_) {
            // No previous results
          }
        }
      }
    });
  }, []);

  const hasJD = jobDescription.trim().length > 50;

  const handleResumeChange = (e) => setResumeFile(e.target.files[0]);
  const handleJDChange = (e) => setJobDescription(e.target.value);

  const buildResumeDataFromOrchestrator = (payload, file, jd, role) => {
    const state = payload?.state || {};
    const resumeAnalysis = payload?.resume_analysis || state.resume_analysis || {};
    const profile = payload?.profile || state.profile || {};

    return {
      filename: payload?.filename || file?.name,
      file,
      jobDescription: jd,
      roleType: role,
      current_phase: payload?.current_phase || state.current_phase,
      supervisor_decision: payload?.supervisor_decision || state.supervisor_decision,
      waiting_for_user: payload?.waiting_for_user || state.waiting_for_user,
      waiting_for_input_type: payload?.waiting_for_input_type || state.waiting_for_input_type,
      score_delta: payload?.score_delta,
      profile,
      strengths: resumeAnalysis.strengths || [],
      weaknesses: resumeAnalysis.weaknesses || [],
      suggestions: resumeAnalysis.suggestions || [],
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!resumeFile) {
      setError("Please upload a resume to continue.");
      return;
    }
    setLoading(true);

    // Create abort controller for cancellation
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
        { method: "POST", body: formData, signal: controller.signal },
      );
      const orchestratorData = await orchestratorResponse.json();

      let latestPayload = orchestratorData;
      if (orchestratorData?.user_id) {
        try {
          const stateResponse = await fetch(
            `http://localhost:8000/api/v1/orchestrator/state/${orchestratorData.user_id}`,
            { signal: controller.signal }
          );
          const stateData = await stateResponse.json();
          const polledState = stateData?.state;
          const hasAnalysis = Boolean(polledState?.resume_analysis?.overall_score);
          const hasPhase = Boolean(polledState?.current_phase);
          if (polledState && (hasAnalysis || hasPhase)) {
            latestPayload = { ...orchestratorData, state: polledState };
          }
        } catch (_) {
          // State polling is optional; use initial response if unavailable
        }
      }

      const completeResult = buildResumeDataFromOrchestrator(
        latestPayload,
        resumeFile,
        jobDescription,
        roleType,
      );

      // Persist to localStorage
      if (userId && completeResult) {
        localStorage.setItem(`resume_analysis_${userId}`, JSON.stringify(completeResult));
        setHasExistingResults(true);
      }

      if (onResult) onResult(completeResult);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Analysis cancelled by user');
        setError('');
      } else {
        console.error("Error during analysis:", err);
        setError("Failed to complete analysis. Please try again.");
      }
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  };

  const handleCancelAnalysis = async () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      
      // Also notify backend to stop processing
      if (userId) {
        try {
          await fetch(
            `http://localhost:8000/api/v1/orchestrator/cancel/${userId}`,
            { method: "POST" }
          );
          console.log("Backend cancellation requested");
        } catch (err) {
          console.error("Failed to cancel backend:", err);
        }
      }
      
      setLoading(false);
      setError('');
    }
  };

  // Hide upload box if results exist and hideIfResults is enabled
  if (hideIfResults && hasExistingResults) {
    return null;
  }

  return (
    <div>
      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-bold">Resume Evaluation Tool</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* File Upload - Drag & Drop Box */}
          <div className="space-y-2">
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleResumeChange}
                className="hidden"
                id="resume-file"
              />
              <label
                htmlFor="resume-file"
                className="flex flex-col items-center justify-center w-full h-40 px-4 transition bg-background hover:bg-muted/30 border-2 border-dashed border-border rounded-lg cursor-pointer group"
              >
                <div className="flex flex-col items-center justify-center space-y-3">
                  <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      {resumeFile ? resumeFile.name : "Drag and drop your resume here, or browse"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supported formats: PDF, DOCX
                    </p>
                  </div>
                  {!resumeFile && (
                    <Button type="button" size="sm" variant="outline">
                      Browse Files
                    </Button>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Job Description & Role in Compact 2-column Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="job-description" className="text-sm font-medium">
                Job Description (Optional)
              </Label>
              <Textarea
                id="job-description"
                value={jobDescription}
                onChange={handleJDChange}
                rows={4}
                placeholder="Paste job description..."
                className="resize-none text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-type" className="text-sm font-medium">
                Target Role {!hasJD && <span className="text-destructive">*</span>}
              </Label>
              <div className="relative">
                <select
                  id="role-type"
                  value={roleType}
                  onChange={(e) => setRoleType(e.target.value)}
                  className="w-full appearance-none bg-background border border-border rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={hasJD}
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
                <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
              {hasJD && (
                <p className="text-xs text-muted-foreground">
                  Role extracted from JD
                </p>
              )}
              {!hasJD && profileRoles.length > 0 && (
                <p className="text-xs text-primary/70">
                  Pre-selected from profile
                </p>
              )}
            </div>
          </div>

          {/* Analyze Button */}
          {loading ? (
            <div className="flex gap-2">
              <Button type="button" disabled className="flex-1" size="lg">
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2"></div>
                <span>Analyzing...</span>
              </Button>
              <Button 
                type="button" 
                onClick={handleCancelAnalysis}
                variant="destructive"
                size="lg"
                className="px-6"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button type="submit" disabled={loading} className="w-full" size="lg">
              <Zap className="w-4 h-4 mr-2" />
              <span>Analyze Resume</span>
            </Button>
          )}
        </form>

        {/* Error */}
        {error && (
          <div className="px-5 pb-5">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResumeUpload;
