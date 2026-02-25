"use client";

import { useState, useEffect } from "react";
import { supabase } from "../api/supabaseClient";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import { Upload, Zap, FileText, ChevronDown } from "lucide-react";

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


function ResumeUpload({ onResult }) {
  const [resumeFile, setResumeFile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [roleType, setRoleType] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [profileRoles, setProfileRoles] = useState([]);   // roles from questionnaire
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
            if (qa.year_of_study) setYearOfStudy(qa.year_of_study);
          }
        } catch (_) {
          // Profile fetch failing is fine -- user can still use the form
        }
      }
    });
  }, []);

  const hasJD = jobDescription.trim().length > 50;

  const handleResumeChange = (e) => setResumeFile(e.target.files[0]);
  const handleJDChange = (e) => setJobDescription(e.target.value);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!resumeFile) {
      setError("Please upload a resume to continue.");
      return;
    }
    setLoading(true);

    const formData = new FormData();
    formData.append("user_id", userId);
    formData.append("resume", resumeFile);
    formData.append("job_description", jobDescription);
    if (roleType) formData.append("role_type", roleType);
    if (yearOfStudy) formData.append("year_of_study", yearOfStudy);

    try {
      // Step 1: Resume Optimization (now includes skill gap analysis inline)
      const optimizeResponse = await fetch(
        "http://localhost:8000/api/v1/resume/optimize",
        { method: "POST", body: formData },
      );
      const optimizeData = await optimizeResponse.json();

      const analysis = optimizeData.analysis || {};

      const completeResult = {
        ...optimizeData,
        gaps: analysis.gaps || [],
        alignment_suggestions: analysis.alignment_suggestions || [],
        error: analysis.error || null,
        ats_score: optimizeData.ats_score,
        score_zone: optimizeData.score_zone,
        structure_score: optimizeData.structure_score,
        completeness_score: optimizeData.completeness_score,
        relevance_score: optimizeData.relevance_score,
        impact_score: optimizeData.impact_score,
        ats_analysis: optimizeData.ats_analysis || {},
        keyword_gap_table: optimizeData.keyword_gap_table || [],
        has_job_description: optimizeData.has_job_description || false,
        skills_analysis: optimizeData.skills_analysis || [],
        honest_improvements: optimizeData.honest_improvements || [],
        human_reader_issues: optimizeData.human_reader_issues || [],
        redundancy_issues: optimizeData.redundancy_issues || [],
        bullet_rewrites: optimizeData.bullet_rewrites || [],
        bullet_quality_breakdown: optimizeData.bullet_quality_breakdown || {},
        // careerAnalysis now comes directly from optimize response (backend runs it inline)
        careerAnalysis: optimizeData.careerAnalysis || null,
        filename: resumeFile.name,
        file: resumeFile,
        jobDescription: jobDescription,
        roleType: roleType,
      };

      if (onResult) onResult(completeResult);
    } catch (err) {
      console.error("Error during analysis:", err);
      setError("Failed to complete analysis. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden">
        <div className="bg-primary/10 p-6 border-b border-border">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-primary/10 p-3 rounded-lg">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Resume Analyzer</h2>
              <p className="text-muted-foreground">
                Upload your resume for honest, evidence-backed feedback
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="resume-file">
              <span className="text-base font-medium">Upload Resume</span>
              <span className="block text-sm text-muted-foreground font-normal">PDF or DOCX format</span>
            </Label>
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
                className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-muted hover:bg-muted/80 border-2 border-dashed border-border rounded-lg cursor-pointer group"
              >
                <div className="flex flex-col items-center justify-center space-y-2">
                  <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      {resumeFile ? resumeFile.name : "Choose file or drag and drop"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {resumeFile ? "File selected" : "Drag your resume here or click to browse"}
                    </p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Job Description */}
          <div className="space-y-2">
            <Label htmlFor="job-description">
              <span className="text-base font-medium">Job Description</span>
              <span className="block text-sm text-muted-foreground font-normal">
                Paste a job posting for role-specific alignment analysis. Leave blank for general feedback.
              </span>
            </Label>
            <Textarea
              id="job-description"
              value={jobDescription}
              onChange={handleJDChange}
              rows={7}
              placeholder="Paste the job description here (optional)..."
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {hasJD
                  ? "\u2713 JD provided \u2014 analysis will use exact role alignment"
                  : "No JD \u2014 analysis will use general role baseline"}
              </span>
              <span className="text-xs text-muted-foreground">{jobDescription.length} characters</span>
            </div>
          </div>

          {/* Role type -- shown when no JD, pre-populated from questionnaire */}
          {!hasJD && (
            <div className="space-y-2">
              <Label htmlFor="role-type">
                <span className="text-base font-medium">Target Role</span>
                <span className="block text-sm text-muted-foreground font-normal">
                  Since no JD is provided, select the role you're targeting for baseline analysis
                </span>
              </Label>
              <div className="relative">
                <select
                  id="role-type"
                  value={roleType}
                  onChange={(e) => setRoleType(e.target.value)}
                  className="w-full appearance-none bg-muted border border-border rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a role...</option>
                  {/* Show questionnaire roles first if available */}
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
              {profileRoles.length > 0 && (
                <p className="text-xs text-primary/70">
                  Pre-selected from your onboarding profile. Change if needed.
                </p>
              )}
            </div>
          )}

          {/* Submit */}
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2"></div>
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                <span>Analyze Resume</span>
              </>
            )}
          </Button>
        </form>

        {/* Error */}
        {error && (
          <div className="px-6 pb-6">
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
