// src/components/SkillGapAnalyzer.js
import React, { useState } from "react";
import axios from "axios";
import "./SkillGapAnalyzer.css";
import { cleanMarkdown } from "../utils/textFormatter";

function SkillGapAnalyzer({ resumeData }) {
  const [resumeFile, setResumeFile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCareer, setSelectedCareer] = useState(null);
  const [showAllCareers, setShowAllCareers] = useState(false);

  // Auto-load career analysis from resumeData if available
  React.useEffect(() => {
    console.log("SkillGapAnalyzer - resumeData:", resumeData);
    console.log(
      "SkillGapAnalyzer - careerAnalysis:",
      resumeData?.careerAnalysis,
    );

    if (resumeData?.careerAnalysis) {
      const careerData = resumeData.careerAnalysis;

      // Only set analysis result if it has actual career data
      if (careerData.career_matches && careerData.career_matches.length > 0) {
        console.log("Setting analysisResult with career data:", careerData);
        setAnalysisResult(careerData);

        if (careerData.top_3_careers && careerData.top_3_careers.length > 0) {
          setSelectedCareer(careerData.top_3_careers[0]);
        }
      } else {
        console.log("Career analysis exists but has no career_matches data");
        setAnalysisResult(null);
      }
    } else {
      console.log("No careerAnalysis found in resumeData");
      setAnalysisResult(null);
    }
  }, [resumeData]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setResumeFile(file);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    const hasResume = resumeFile || resumeData;

    if (!hasResume) {
      setError("Please upload a resume first");
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    setSelectedCareer(null);

    try {
      const formData = new FormData();

      if (resumeFile) {
        formData.append("resume", resumeFile);
      } else if (resumeData && resumeData.file) {
        formData.append("resume", resumeData.file);
      } else if (resumeData) {
        // Resume data exists but file object is not available (e.g., after page refresh)
        setError(
          "Original resume file not available. Please re-upload the resume to perform skill gap analysis.",
        );
        setLoading(false);
        return;
      } else {
        throw new Error("No resume file available");
      }

      const result = await axios.post(
        "http://localhost:8000/api/v1/resume/skill-gap-analysis",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      setAnalysisResult(result.data);
      if (result.data.top_3_careers && result.data.top_3_careers.length > 0) {
        setSelectedCareer(result.data.top_3_careers[0]);
      }
    } catch (err) {
      console.error("Career analysis error:", err);
      setError(
        err.response?.data?.error ||
          err.message ||
          "Failed to analyze career matches. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const getProbabilityColor = (probability) => {
    if (probability >= 70) return "#10b981"; // Green
    if (probability >= 50) return "#f59e0b"; // Orange
    if (probability >= 30) return "#ef4444"; // Red
    return "#6b7280"; // Gray
  };

  const getProbabilityLabel = (probability) => {
    if (probability >= 70) return "Excellent Match";
    if (probability >= 50) return "Good Match";
    if (probability >= 30) return "Fair Match";
    return "Needs Development";
  };

  const careersToDisplay = showAllCareers
    ? analysisResult?.career_matches
    : analysisResult?.top_3_careers;

  return (
    <div className="skill-gap-container">
      <div className="skill-gap-header">
        <h2>Skill Gap Analyzer</h2>
        <p>
          Discover which career paths match your skills and get personalized
          recommendations
        </p>
      </div>

      {/* Input Section - Only show if NO analysis is available */}
      {!analysisResult && !resumeData?.careerAnalysis && (
        <div className="input-section">
          <div className="resume-status">
            <div className="resume-missing">
              <span>
                No resume uploaded. Please upload in Resume Optimizer first.
              </span>
            </div>
          </div>

          {/* Local File Upload */}
          <div className="form-group">
            <label htmlFor="resumeUpload">Upload Resume</label>
            <input
              id="resumeUpload"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              className="file-input"
            />
            <p className="file-hint">
              {resumeFile
                ? `Selected: ${resumeFile.name}`
                : "Choose a PDF or DOCX file"}
            </p>
          </div>

          {/* Analyze Button */}
          {resumeFile && (
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="analyze-button"
            >
              {loading ? "Analyzing Your Skills..." : "Analyze Career Matches"}
            </button>
          )}

          {error && <div className="error-message">{error}</div>}
        </div>
      )}

      {/* Show info banner when using pre-analyzed resume */}
      {analysisResult && resumeData?.careerAnalysis && (
        <div className="info-banner">
          <span>
            ✓ Analysis loaded from: <strong>{resumeData.filename}</strong>
          </span>
        </div>
      )}

      {/* Results Section */}
      {analysisResult && (
        <div className="results-section">
          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card skills-card">
              <div className="card-content">
                <h3>{analysisResult.total_skills_found || 0}</h3>
                <p>Skills Detected</p>
              </div>
            </div>

            <div className="summary-card match-card">
              <div className="card-content">
                <h3>{analysisResult.analysis_summary?.best_match || "N/A"}</h3>
                <p>Best Match</p>
              </div>
            </div>

            <div className="summary-card probability-card">
              <div className="card-content">
                <h3>
                  {analysisResult.analysis_summary?.best_match_probability || 0}
                  %
                </h3>
                <p>Match Score</p>
              </div>
            </div>

            <div className="summary-card careers-card">
              <div className="card-content">
                <h3>{analysisResult.career_matches?.length || 0}</h3>
                <p>Career Paths</p>
              </div>
            </div>
          </div>

          {/* Your Skills */}
          {analysisResult?.user_skills &&
            analysisResult.user_skills.length > 0 && (
              <div className="user-skills-section">
                <h3>Your Detected Skills</h3>
                <div className="skills-tags">
                  {analysisResult.user_skills.map((skill, idx) => {
                    return (
                      <span key={idx} className="skill-tag">
                        {cleanMarkdown(skill)}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Career Matches */}
          <div className="career-matches-section">
            <div className="section-header">
              <h3>Career Path Recommendations</h3>
              <button
                className="toggle-button"
                onClick={() => setShowAllCareers(!showAllCareers)}
              >
                {showAllCareers ? "Show Top 3" : "Show All Careers"}
              </button>
            </div>

            <div className="careers-grid">
              {careersToDisplay?.map((career, idx) => (
                <div
                  key={idx}
                  className={`career-card ${
                    selectedCareer?.career === career.career ? "selected" : ""
                  }`}
                  onClick={() => setSelectedCareer(career)}
                >
                  <div className="career-header">
                    <h4>{career.career}</h4>
                    <div
                      className="probability-badge"
                      style={{
                        backgroundColor: getProbabilityColor(
                          career.probability,
                        ),
                      }}
                    >
                      {career.probability}%
                    </div>
                  </div>

                  <p className="match-label">
                    {getProbabilityLabel(career.probability)}
                  </p>

                  <div className="career-stats">
                    <div className="stat">
                      <span className="stat-value">
                        {career.matched_skills_count}
                      </span>
                      <span className="stat-label">Matched</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">
                        {career.missing_skills.length}
                      </span>
                      <span className="stat-label">Missing</span>
                    </div>
                  </div>

                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${career.probability}%`,
                        backgroundColor: getProbabilityColor(
                          career.probability,
                        ),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Career Details */}
          {selectedCareer && (
            <div className="career-details">
              <h3>{selectedCareer.career} - Detailed Analysis</h3>

              <div className="details-grid">
                {/* Matched Skills */}
                <div className="detail-section">
                  <h4>
                    Your Matching Skills (
                    {selectedCareer?.matched_skills?.length || 0})
                  </h4>
                  <div className="skills-list-compact">
                    {selectedCareer?.matched_skills &&
                    selectedCareer.matched_skills.length > 0 ? (
                      selectedCareer.matched_skills.map((skill, idx) => {
                        return (
                          <span key={idx} className="skill-badge matched">
                            {cleanMarkdown(skill)}
                          </span>
                        );
                      })
                    ) : (
                      <p className="no-skills-message">
                        No matching skills found
                      </p>
                    )}
                  </div>
                </div>

                {/* Missing Skills */}
                <div className="detail-section">
                  <h4>
                    Skills to Learn (
                    {selectedCareer?.missing_skills?.length || 0})
                  </h4>
                  <div className="skills-list-compact">
                    {selectedCareer?.missing_skills &&
                    selectedCareer.missing_skills.length > 0 ? (
                      selectedCareer.missing_skills.map((skill, idx) => {
                        return (
                          <span key={idx} className="skill-badge missing">
                            {cleanMarkdown(skill)}
                          </span>
                        );
                      })
                    ) : (
                      <p className="no-skills-message">
                        No missing skills identified
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Match Breakdown */}
              <div className="match-breakdown">
                <h4>Match Breakdown</h4>
                <div className="breakdown-bars">
                  <div className="breakdown-item">
                    <span className="breakdown-label">Skill Match</span>
                    <div className="breakdown-bar">
                      <div
                        className="breakdown-fill skill-match"
                        style={{
                          width: `${
                            selectedCareer?.skill_match_percentage || 0
                          }%`,
                        }}
                      />
                      <span className="breakdown-value">
                        {selectedCareer?.skill_match_percentage || 0}%
                      </span>
                    </div>
                  </div>
                  <div className="breakdown-item">
                    <span className="breakdown-label">Semantic Match</span>
                    <div className="breakdown-bar">
                      <div
                        className="breakdown-fill semantic-match"
                        style={{
                          width: `${
                            selectedCareer?.semantic_match_percentage || 0
                          }%`,
                        }}
                      />
                      <span className="breakdown-value">
                        {selectedCareer?.semantic_match_percentage || 0}%
                      </span>
                    </div>
                  </div>
                  <div className="breakdown-item">
                    <span className="breakdown-label">Overall Probability</span>
                    <div className="breakdown-bar">
                      <div
                        className="breakdown-fill overall-match"
                        style={{
                          width: `${selectedCareer?.probability || 0}%`,
                          backgroundColor: getProbabilityColor(
                            selectedCareer?.probability || 0,
                          ),
                        }}
                      />
                      <span className="breakdown-value">
                        {selectedCareer?.probability || 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SkillGapAnalyzer;
