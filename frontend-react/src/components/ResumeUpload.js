"use client";

import { useState, useEffect } from "react";
import { supabase } from "../api/supabaseClient";
import ResultBox from "./ResumeBox";
import "./ResumeUpload.css";

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
    <div className="resume-upload">
      <div className="upload-card">
        <div className="header">
          <div className="header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h2 className="title">Resume Optimizer</h2>
          <p className="subtitle">
            Upload your resume and job description to get personalized
            optimization suggestions
          </p>
        </div>

        <form onSubmit={handleSubmit} className="upload-form">
          {/* File Upload */}
          <div className="form-group">
            <label className="form-label">
              <span className="label-text">Upload Resume</span>
              <span className="label-subtitle">PDF or DOCX format</span>
            </label>
            <div className="file-input-wrapper">
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleResumeChange}
                className="file-input"
                id="resume-file"
              />
              <label htmlFor="resume-file" className="file-input-label">
                <div className="file-input-content">
                  <svg
                    className="upload-icon"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <div className="file-input-text">
                    <span className="file-name">
                      {resumeFile
                        ? resumeFile.name
                        : "Choose file or drag and drop"}
                    </span>
                    <span className="file-hint">
                      {resumeFile
                        ? "File selected"
                        : "Drag your resume here or click to browse"}
                    </span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Job Description */}
          <div className="form-group">
            <label className="form-label">
              <span className="label-text">Job Description (Optional)</span>
              <span className="label-subtitle">
                Paste the complete job posting here if you have one
              </span>
            </label>
            <div className="textarea-wrapper">
              <textarea
                value={jobDescription}
                onChange={handleJDChange}
                rows={8}
                className="job-description-input"
                placeholder="Paste the job description here (optional)..."
              />
              <div className="textarea-footer">
                <span className="character-count">
                  {jobDescription.length} characters
                </span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={`submit-button ${loading ? "loading" : ""}`}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                <span>Optimizing...</span>
              </>
            ) : (
              <>
                <svg
                  className="button-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span>Optimize Resume</span>
              </>
            )}
          </button>
        </form>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <svg className="error-icon" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Display Result */}
        {result && <ResultBox result={result} />}
      </div>
    </div>
  );
}

export default ResumeUpload;
