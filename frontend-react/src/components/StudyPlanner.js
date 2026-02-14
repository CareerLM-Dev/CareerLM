// src/components/StudyPlanner.js
import React, { useState, useEffect, useCallback } from "react";
import "./StudyPlanner.css";

function StudyPlanner({ resumeData }) {
  const [studyMaterials, setStudyMaterials] = useState(null);
  const [expandedSkills, setExpandedSkills] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch live resources via Gemini Google Search grounding
  const fetchStudyMaterials = useCallback(async () => {
    if (!resumeData?.careerAnalysis) {
      setError("No career analysis data available. Please run Skill Gap Analyzer first.");
      return;
    }

    const careerData = resumeData.careerAnalysis;
    const topCareer = careerData.top_3_careers?.[0];

    if (!topCareer || !topCareer.missing_skills?.length) {
      setError("No skill gaps found. Please ensure your resume has been analyzed.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("target_career", topCareer.career);
      formData.append(
        "missing_skills",
        JSON.stringify(topCareer.missing_skills.slice(0, 7))
      );

      const response = await fetch(
        "http://localhost:8000/api/v1/resume/generate-study-materials-simple",
        { method: "POST", body: formData }
      );

      const data = await response.json();

      if (data.success) {
        setStudyMaterials(data);
        // Expand first skill by default
        if (data.skill_gap_report?.length > 0) {
          setExpandedSkills({ 0: true });
        }
      } else {
        setError(data.error || "Failed to load study materials");
      }
    } catch (err) {
      console.error("Error loading study materials:", err);
      setError("Error loading study materials. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [resumeData]);

  // Auto-load from resumeData if pre-fetched, otherwise prompt manual fetch
  useEffect(() => {
    if (studyMaterials) return;
    if (resumeData?.studyMaterials) {
      setStudyMaterials(resumeData.studyMaterials);
      if (resumeData.studyMaterials.skill_gap_report?.length > 0) {
        setExpandedSkills({ 0: true });
      }
    }
  }, [resumeData, studyMaterials]);

  const toggleSkill = (idx) => {
    setExpandedSkills((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const expandAll = () => {
    const all = {};
    studyMaterials?.skill_gap_report?.forEach((_, i) => { all[i] = true; });
    setExpandedSkills(all);
  };

  const collapseAll = () => setExpandedSkills({});

  // ---------- EMPTY / LOADING / ERROR STATES ----------

  if (!resumeData) {
    return (
      <div className="study-planner-container">
        <div className="empty-state-card">
          <h2>No Study Plan Available</h2>
          <p>Please upload your resume and job description in Resume Optimizer first</p>
          <p className="hint">The system will automatically generate personalized learning materials for you</p>
        </div>
      </div>
    );
  }

  if (!studyMaterials) {
    if (loading) {
      return (
        <div className="study-planner-container">
          <div className="empty-state-card">
            <h2>Generating Study Materials...</h2>
            <p>Searching for the best learning resources with Google Search Grounding...</p>
            <p className="hint">This may take 5-10 seconds</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="study-planner-container">
          <div className="empty-state-card error">
            <h2>Error</h2>
            <p>{error}</p>
            <button className="retry-button" onClick={fetchStudyMaterials}>Try Again</button>
          </div>
        </div>
      );
    }

    // Prompt user to generate
    const topCareer = resumeData?.careerAnalysis?.top_3_careers?.[0];

    return (
      <div className="study-planner-container">
        <div className="empty-state-card clickable" onClick={fetchStudyMaterials}>
          <h2>Generate Study Materials</h2>
          {topCareer ? (
            <>
              <p>Click to generate learning resources for <strong>{topCareer.career}</strong></p>
              <p className="hint">
                {topCareer.missing_skills?.length || 0} skills to learn:{" "}
                {topCareer.missing_skills?.slice(0, 3).join(", ")}
                {topCareer.missing_skills?.length > 3 ? "..." : ""}
              </p>
            </>
          ) : (
            <p>Click to search for learning resources based on your skill gaps</p>
          )}
          <button className="load-button" onClick={fetchStudyMaterials}>Load Study Materials</button>
        </div>
      </div>
    );
  }

  // ---------- RENDER STUDY PLAN ----------

  const { target_career, skill_gap_report } = studyMaterials;

  const totalResources = skill_gap_report?.reduce(
    (sum, s) => sum + (s.learning_path?.length || 0), 0
  ) || 0;

  const getStepIcon = (type) => {
    switch (type) {
      case "Documentation": return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
        </svg>
      );
      case "YouTube": return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      );
      case "Course": return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5" />
        </svg>
      );
      default: return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    }
  };

  const getTypeBadgeClass = (type) => {
    switch (type) {
      case "Documentation": return "badge-docs";
      case "YouTube": return "badge-youtube";
      case "Course": return "badge-course";
      default: return "badge-default";
    }
  };

  return (
    <div className="study-planner-container">
      <div className="study-header">
        <h2>Personalized Study Plan</h2>
        <p>Your customized learning roadmap for {target_career || "career development"}</p>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-content">
            <h3>{skill_gap_report?.length || 0}</h3>
            <p>Skills to Learn</p>
          </div>
        </div>
        <div className="summary-item">
          <div className="summary-content">
            <h3>{totalResources}</h3>
            <p>Live Resources</p>
          </div>
        </div>
        <div className="summary-item">
          <div className="summary-content">
            <h3>
              {skill_gap_report?.reduce(
                (sum, s) => sum + (s.learning_path?.filter((r) => r.type === "YouTube").length || 0), 0
              ) || 0}
            </h3>
            <p>Video Courses</p>
          </div>
        </div>
        <div className="summary-item">
          <div className="summary-content">
            <h3>
              {skill_gap_report?.reduce(
                (sum, s) => sum + (s.learning_path?.filter((r) => r.type === "Course").length || 0), 0
              ) || 0}
            </h3>
            <p>Platform Courses</p>
          </div>
        </div>
      </div>

      {/* Expand / Collapse Controls */}
      <div className="expand-controls">
        <button onClick={expandAll}>Expand All</button>
        <button onClick={collapseAll}>Collapse All</button>
      </div>

      {/* Skill Roadmap Cards */}
      {skill_gap_report && skill_gap_report.length > 0 ? (
        <div className="roadmap-list">
          {skill_gap_report.map((skillData, skillIdx) => (
            <div key={skillIdx} className="roadmap-card">
              {/* Skill Header (clickable) */}
              <button className="roadmap-header" onClick={() => toggleSkill(skillIdx)}>
                <div className="roadmap-header-left">
                  <span className="skill-number">{skillIdx + 1}</span>
                  <h4>{skillData.skill}</h4>
                  <span className="step-count">
                    {skillData.learning_path?.length || 0} steps
                  </span>
                </div>
                <span className={`chevron ${expandedSkills[skillIdx] ? "open" : ""}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>

              {/* Expanded: Learning Path Steps */}
              {expandedSkills[skillIdx] && (
                <div className="roadmap-steps">
                  {skillData.learning_path?.map((resource, resIdx) => (
                    <div key={resIdx} className="step-card">
                      {/* Step connector line */}
                      {resIdx < (skillData.learning_path.length - 1) && (
                        <div className="step-connector" />
                      )}

                      <div className="step-indicator">
                        <div className={`step-dot ${getTypeBadgeClass(resource.type)}`}>
                          {resource.step || resIdx + 1}
                        </div>
                      </div>

                      <div className="step-content">
                        <div className="step-top-row">
                          <span className={`type-badge ${getTypeBadgeClass(resource.type)}`}>
                            {getStepIcon(resource.type)}
                            {resource.type}
                          </span>
                          {resource.label && (
                            <span className="step-label">{resource.label}</span>
                          )}
                        </div>

                        <h5 className="step-title">{resource.title}</h5>

                        <div className="step-meta">
                          {resource.platform && (
                            <span className="meta-chip">{resource.platform}</span>
                          )}
                          {resource.est_time && (
                            <span className="meta-chip time-chip">{resource.est_time}</span>
                          )}
                          {resource.cost && (
                            <span className={`meta-chip ${resource.cost === "Free" ? "free-chip" : "paid-chip"}`}>
                              {resource.cost}
                            </span>
                          )}
                        </div>

                        {resource.url && (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="step-link"
                          >
                            Open Resource
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state-card">
          <h2>No resources found</h2>
          <p>Try analyzing your skill gaps first</p>
        </div>
      )}
    </div>
  );
}

export default StudyPlanner;
