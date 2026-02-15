"use client";

import { useState, useEffect } from "react";
import { supabase } from "../api/supabaseClient";
import ResultBox from "./ResumeBox";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import { Upload, Zap, FileText } from "lucide-react";


function ResumeUpload({ onResult }) {
  const [resumeFile, setResumeFile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id); // dynamic UUID
    });
  }, []);

  const handleResumeChange = (e) => {
    setResumeFile(e.target.files[0]);
  };

  const handleJDChange = (e) => {
    setJobDescription(e.target.value);
  };

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

    try {
      // Step 1: Resume Optimization
      const optimizeResponse = await fetch(
        "http://localhost:8000/api/v1/resume/optimize",
        { method: "POST", body: formData },
      );
      const optimizeData = await optimizeResponse.json();

      // Step 2: Career & Skill Gap Analysis
      const skillFormData = new FormData();
      skillFormData.append("resume", resumeFile);

      const skillGapResponse = await fetch(
        "http://localhost:8000/api/v1/resume/skill-gap-analysis",
        { method: "POST", body: skillFormData },
      );
      const skillGapData = await skillGapResponse.json();

      // Step 3: Generate Study Materials
      const studyFormData = new FormData();
      studyFormData.append("resume", resumeFile);
      studyFormData.append("job_description", jobDescription);
      if (skillGapData.top_3_careers && skillGapData.top_3_careers.length > 0) {
        studyFormData.append(
          "target_career",
          skillGapData.top_3_careers[0].career,
        );
        studyFormData.append(
          "missing_skills",
          JSON.stringify(
            skillGapData.top_3_careers[0].missing_skills.slice(0, 5),
          ),
        );
      }

      const studyResponse = await fetch(
        "http://localhost:8000/api/v1/resume/generate-study-materials",
        { method: "POST", body: studyFormData },
      );
      const studyData = await studyResponse.json();

      // Extract analysis for ResultBox
      const optimization = optimizeData.optimization || {};
      const analysis = optimization.analysis || {};

      const completeResult = {
        // Resume Optimization
        gaps: analysis.gaps || [],
        alignment_suggestions: analysis.alignment_suggestions || [],
        error: analysis.error || null,
        ats_score: optimization.ats_score,
        ats_analysis: optimization.ats_analysis || {},

        // Career & Skill Gap Analysis
        careerAnalysis: skillGapData.success ? skillGapData : null,

        // Study Materials
        studyMaterials: studyData.success ? studyData : null,

        // Original data
        filename: resumeFile.name,
        file: resumeFile,
        jobDescription: jobDescription,
      };

      setResult(completeResult);

      // Pass complete result to parent Dashboard
      if (onResult) {
        onResult(completeResult);
      }

      // History is automatically saved in resume_versions table by the backend
      // No need for separate history save call
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
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 p-6 border-b border-border">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-primary/10 p-3 rounded-lg">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Resume Optimizer</h2>
              <p className="text-muted-foreground">
                Upload your resume and job description to get personalized optimization suggestions
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
              <span className="text-base font-medium">Job Description (Optional)</span>
              <span className="block text-sm text-muted-foreground font-normal">
                Paste the complete job posting here if you have one
              </span>
            </Label>
            <Textarea
              id="job-description"
              value={jobDescription}
              onChange={handleJDChange}
              rows={8}
              placeholder="Paste the job description here (optional)..."
              className="resize-none"
            />
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">{jobDescription.length} characters</span>
            </div>
          </div>

          {/* Submit */}
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2"></div>
                <span>Optimizing...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                <span>Optimize Resume</span>
              </>
            )}
          </Button>
        </form>

        {/* Error Message */}
        {error && (
          <div className="px-6 pb-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Display Result */}
        {result && (
          <div className="px-6 pb-6">
            <ResultBox result={result} />
          </div>
        )}
      </div>
    </div>
  );
}

export default ResumeUpload;
