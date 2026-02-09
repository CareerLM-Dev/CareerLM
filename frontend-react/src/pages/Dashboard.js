"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";
import Sidebar from "../components/Sidebar";
import ResumeUpload from "../components/ResumeUpload";
import ResumeOptimizer from "../components/ResumeOptimizer";
import SkillGapAnalyzer from "../components/SkillGapAnalyzer";
import MockInterview from "../components/MockInterview";
import ColdEmailGenerator from "../components/ColdEmailGenerator";
import StudyPlanner from "../components/StudyPlanner";
import { formatText } from "../utils/textFormatter";
import "./Dashboard.css";

function Dashboard() {
  const { session } = useUser();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [resumeData, setResumeData] = useState(null);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch most recent resume data from Supabase
  const fetchLatestResumeData = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(
        "http://localhost:8000/api/v1/user/history",
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const history = response.data.data || [];

      if (history.length > 0) {
        // Get the most recent resume analysis
        const mostRecent = history.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        )[0];

        // Fetch the full content from the specific version to get detailed analysis
        const detailResponse = await axios.get(
          `http://localhost:8000/api/v1/user/history/${mostRecent.id}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        const detailData = detailResponse.data.data;
        const content =
          typeof detailData.content === "string"
            ? JSON.parse(detailData.content)
            : detailData.content;

        // Transform the data to match the expected format
        const transformedData = {
          ats_score: content.ats_score || mostRecent.ats_score || 0,
          ats_analysis: content.ats_analysis || {
            component_scores: {
              structure_score:
                content.ats_analysis?.component_scores?.structure_score || 0,
              content_score:
                content.ats_analysis?.component_scores?.content_score || 0,
              formatting_score:
                content.ats_analysis?.component_scores?.formatting_score || 0,
              keyword_score:
                content.ats_analysis?.component_scores?.keyword_score || 0,
            },
          },
          // Keep the full careerAnalysis structure from database for SkillGapAnalyzer
          // This matches the structure from skill_gap_analyzer.py backend service
          careerAnalysis: content.careerAnalysis || {
            user_skills: content.user_skills || [],
            total_skills_found: content.total_skills_found || 0,
            career_matches: content.career_matches || [],
            top_3_careers: content.top_3_careers || [],
            ai_recommendations: content.ai_recommendations || "",
            analysis_summary: content.analysis_summary || {
              best_match: "No analysis available",
              best_match_probability: 0,
              skills_to_focus: [],
            },
          },
          gaps: content.analysis?.gaps || [],
          alignment_suggestions: content.analysis?.alignment_suggestions || [],
          jobDescription:
            content.analysis?.prompt || mostRecent.job_description || "",
          filename: mostRecent.filename || detailData.raw_file_path || "Resume",
        };

        setResumeData(transformedData);
      }
    } catch (error) {
      console.error("Failed to fetch resume data from Supabase:", error);
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Fetch data on mount and when session changes
  useEffect(() => {
    fetchLatestResumeData();
  }, [fetchLatestResumeData]);

  // Refresh data whenever returning to dashboard page
  useEffect(() => {
    if (currentPage === "dashboard" && session) {
      fetchLatestResumeData();
    }
  }, [currentPage, session, fetchLatestResumeData]);

  // Fetch ATS score history for the chart
  useEffect(() => {
    const fetchScoreHistory = async () => {
      if (!session) return;

      try {
        const response = await axios.get(
          "http://localhost:8000/api/v1/user/history",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        const history = response.data.data || [];

        // Extract ATS scores and sort by date
        const scores = history
          .filter(
            (item) => item.ats_score !== null && item.ats_score !== undefined
          )
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          .map((item) => ({
            score: item.ats_score,
            date: item.created_at,
          }));

        setScoreHistory(scores);
      } catch (err) {
        console.error("Error fetching score history:", err);
      }
    };

    fetchScoreHistory();
  }, [session]);

  // Handle resume data update (now data is automatically stored in Supabase by backend)
  const handleResumeDataUpdate = async (data) => {
    // Update local state for immediate UI feedback
    setResumeData(data);

    // Fetch fresh data from database to ensure we have the latest
    // This also refreshes the score history for the chart
    await fetchLatestResumeData();
  };

  // Generate SVG path from score history
  const generateChartPath = () => {
    if (!scoreHistory || scoreHistory.length === 0) {
      // Default flat line if no history
      return "M0,100 L300,100";
    }

    if (scoreHistory.length === 1) {
      // Single point - show as horizontal line
      const y = 120 - scoreHistory[0].score * 1.0; // Map 0-100 score to 120-20 Y position
      return `M0,${y} L300,${y}`;
    }

    // Multiple points - create path
    const points = scoreHistory.map((item, index) => {
      const x = (index / (scoreHistory.length - 1)) * 300; // Distribute evenly across 300 width
      const y = 120 - item.score * 1.0; // Map 0-100 score to 120-20 Y position (inverted)
      return `${x},${y}`;
    });

    return `M${points.join(" L")}`;
  };

  // Generate filled area path for gradient
  const generateFilledPath = () => {
    const linePath = generateChartPath();
    if (!scoreHistory || scoreHistory.length === 0) {
      return `${linePath} L300,120 L0,120 Z`;
    }
    return `${linePath} L300,120 L0,120 Z`;
  };

  const renderPage = () => {
    switch (currentPage) {
      case "upload":
        return <ResumeUpload onResult={handleResumeDataUpdate} />;
      case "resume_optimizer":
        return <ResumeOptimizer resumeData={resumeData} />;
      case "skill_gap":
        return <SkillGapAnalyzer resumeData={resumeData} />;
      case "mock_interview":
        return <MockInterview resumeData={resumeData} />;
      case "cold_email":
        return <ColdEmailGenerator resumeData={resumeData} />;
      case "study_planner":
        return <StudyPlanner resumeData={resumeData} />;
      default:
        return (
          <div className="dashboard-overview">
            {loading ? (
              <div className="loading-state">
                <div className="spinner-large"></div>
                <p>Loading your resume data...</p>
              </div>
            ) : (
              <div className="dashboard-grid">
                {/* Left Column - Overview & Analysis */}
                <div className="left-column">
                  {/* ATS Score Overview */}
                  <div className="overview-card ats-overview">
                    <div className="ats-score-display">
                      <div className="score-circle-large">
                        <svg width="160" height="160" viewBox="0 0 160 160">
                          <circle
                            cx="80"
                            cy="80"
                            r="70"
                            fill="transparent"
                            stroke="rgba(255, 255, 255, 0.2)"
                            strokeWidth="12"
                          />
                          <circle
                            cx="80"
                            cy="80"
                            r="70"
                            fill="transparent"
                            stroke="white"
                            strokeWidth="12"
                            strokeDasharray={`${
                              (resumeData?.ats_score || 0) * 4.4
                            } 440`}
                            strokeLinecap="round"
                            transform="rotate(-90 80 80)"
                          />
                          <text
                            x="80"
                            y="75"
                            textAnchor="middle"
                            fontSize="14"
                            fill="rgba(255, 255, 255, 0.8)"
                            fontWeight="500"
                            margin="8px"
                          >
                            Overall ATS Score
                          </text>
                          <text
                            x="80"
                            y="100"
                            textAnchor="middle"
                            fontSize="18"
                            fill="white"
                            fontWeight="bold"
                          >
                            {resumeData?.ats_score || "--"}/100
                          </text>
                        </svg>
                      </div>
                      <div className="ats-info">
                        <p className="target-job">
                          {resumeData?.careerAnalysis?.analysis_summary
                            ?.best_match
                            ? `Target Job: ${resumeData.careerAnalysis.analysis_summary.best_match}`
                            : resumeData?.careerAnalysis?.top_3_careers?.[0]
                                ?.career
                            ? `Target Job: ${resumeData.careerAnalysis.top_3_careers[0].career}`
                            : resumeData?.jobDescription
                            ? `Target Job: ${(() => {
                                const lines = resumeData.jobDescription
                                  .split("\n")
                                  .filter((line) => line.trim());
                                // Try to find a line that looks like a job title (usually short and at the beginning)
                                const titleLine =
                                  lines.find(
                                    (line) =>
                                      line.length < 80 &&
                                      !line
                                        .toLowerCase()
                                        .includes("experience") &&
                                      !line
                                        .toLowerCase()
                                        .includes("responsibilities") &&
                                      !line
                                        .toLowerCase()
                                        .includes("requirements")
                                  ) || lines[0];
                                return (
                                  titleLine.substring(0, 60) +
                                  (titleLine.length > 60 ? "..." : "")
                                );
                              })()}`
                            : "Target Job: Upload resume with job description"}
                        </p>
                        <p className="last-analysis">
                          {resumeData?.filename
                            ? `Last Analysis: ${resumeData.filename}`
                            : "Last Analysis: No resume analyzed yet"}
                        </p>
                      </div>
                      <button
                        className="optimize-btn"
                        onClick={() => setCurrentPage("upload")}
                      >
                        {resumeData ? "Upload New Resume" : "Upload Resume Now"}
                      </button>
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="overview-card score-breakdown">
                    <h3 className="card-title">Score Breakdown</h3>
                    <div className="metrics-grid">
                      <div className="metric-item">
                        <div className="metric-circle">
                          <svg width="80" height="80" viewBox="0 0 80 80">
                            <circle
                              cx="40"
                              cy="40"
                              r="32"
                              fill="transparent"
                              stroke="#e2e8f0"
                              strokeWidth="6"
                            />
                            <circle
                              cx="40"
                              cy="40"
                              r="32"
                              fill="transparent"
                              stroke="#3b82f6"
                              strokeWidth="6"
                              strokeDasharray={`${
                                (resumeData?.ats_analysis?.component_scores
                                  ?.structure_score || 0) * 2
                              } 200`}
                              strokeLinecap="round"
                              transform="rotate(-90 40 40)"
                            />
                            <text
                              x="40"
                              y="45"
                              textAnchor="middle"
                              fontSize="18"
                              fill="#1e293b"
                              fontWeight="bold"
                            >
                              {resumeData?.ats_analysis?.component_scores
                                ?.structure_score || 0}
                              %
                            </text>
                          </svg>
                        </div>
                        <p className="metric-label">
                          Structure:{" "}
                          {resumeData?.ats_analysis?.component_scores
                            ?.structure_score || 0}
                          /100
                        </p>
                      </div>
                      <div className="metric-item">
                        <div className="metric-circle">
                          <svg width="80" height="80" viewBox="0 0 80 80">
                            <circle
                              cx="40"
                              cy="40"
                              r="32"
                              fill="transparent"
                              stroke="#e2e8f0"
                              strokeWidth="6"
                            />
                            <circle
                              cx="40"
                              cy="40"
                              r="32"
                              fill="transparent"
                              stroke="#3b82f6"
                              strokeWidth="6"
                              strokeDasharray={`${
                                (resumeData?.ats_analysis?.component_scores
                                  ?.content_score || 0) * 2
                              } 200`}
                              strokeLinecap="round"
                              transform="rotate(-90 40 40)"
                            />
                            <text
                              x="40"
                              y="45"
                              textAnchor="middle"
                              fontSize="18"
                              fill="#1e293b"
                              fontWeight="bold"
                            >
                              {resumeData?.ats_analysis?.component_scores
                                ?.content_score || 0}
                              %
                            </text>
                          </svg>
                        </div>
                        <p className="metric-label">
                          Content:{" "}
                          {resumeData?.ats_analysis?.component_scores
                            ?.content_score || 0}
                          /100
                        </p>
                      </div>
                      <div className="metric-item">
                        <div className="metric-circle">
                          <svg width="80" height="80" viewBox="0 0 80 80">
                            <circle
                              cx="40"
                              cy="40"
                              r="32"
                              fill="transparent"
                              stroke="#e2e8f0"
                              strokeWidth="6"
                            />
                            <circle
                              cx="40"
                              cy="40"
                              r="32"
                              fill="transparent"
                              stroke="#3b82f6"
                              strokeWidth="6"
                              strokeDasharray={`${
                                (resumeData?.ats_analysis?.component_scores
                                  ?.formatting_score || 0) * 2
                              } 200`}
                              strokeLinecap="round"
                              transform="rotate(-90 40 40)"
                            />
                            <text
                              x="40"
                              y="45"
                              textAnchor="middle"
                              fontSize="18"
                              fill="#1e293b"
                              fontWeight="bold"
                            >
                              {resumeData?.ats_analysis?.component_scores
                                ?.formatting_score || 0}
                              %
                            </text>
                          </svg>
                        </div>
                        <p className="metric-label">
                          Formatting:{" "}
                          {resumeData?.ats_analysis?.component_scores
                            ?.formatting_score || 0}
                          /100
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* AI Agent Tools - Commented Out */}
                  {/* <div className="overview-card ai-tools">
                  <h3 className="card-title">AI Agent Tools</h3>

                  <div
                    className="tool-card"
                    onClick={() => setCurrentPage("mock_interview")}
                  >
                    <h4 className="tool-title">Mock Interview Agent</h4>
                    <div className="tool-actions">
                      <span className="tool-info">Last Score: 7.8/10</span>
                      <button className="tool-btn">
                        Start Practice Session
                      </button>
                    </div>
                  </div>

                  <div
                    className="tool-card"
                    onClick={() => setCurrentPage("study_planner")}
                  >
                    <h4 className="tool-title">Study Planner Agent</h4>
                    <div className="tool-actions">
                      <span className="tool-info">Next Focus: PyTorch</span>
                      <button className="tool-btn">View Learning Plan</button>
                    </div>
                  </div>

                  <div
                    className="tool-card"
                    onClick={() => setCurrentPage("cold_email")}
                  >
                    <h4 className="tool-title">Cold Email Agent</h4>
                    <div className="tool-actions">
                      <span className="tool-info">Draft for InnovatEX</span>
                      <button className="tool-btn">Draft New Outreach</button>
                    </div>
                  </div>
                </div> */}
                </div>

                {/* Right Column - Actions & Progress */}
                <div className="right-column">
                  {/* Action & Progress */}
                  <div className="overview-card action-progress">
                    <h3 className="card-title">Action & Progress</h3>

                    {/* ATS Score Trend */}
                    <div className="progress-section">
                      <h4 className="section-subtitle">ATS Score Trend</h4>
                      <div className="chart-placeholder">
                        {scoreHistory && scoreHistory.length > 0 ? (
                          <svg
                            width="100%"
                            height="120"
                            viewBox="0 0 300 120"
                            preserveAspectRatio="none"
                          >
                            <defs>
                              <linearGradient
                                id="chartGradient"
                                x1="0%"
                                y1="0%"
                                x2="0%"
                                y2="100%"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#3b82f6"
                                  stopOpacity="0.3"
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#3b82f6"
                                  stopOpacity="0.05"
                                />
                              </linearGradient>
                            </defs>
                            <path
                              d={generateFilledPath()}
                              fill="url(#chartGradient)"
                            />
                            <path
                              d={generateChartPath()}
                              fill="none"
                              stroke="#3b82f6"
                              strokeWidth="3"
                            />
                          </svg>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "120px",
                              color: "#94a3b8",
                              fontSize: "14px",
                            }}
                          >
                            No history data available yet. Upload a resume to
                            start tracking!
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Resume Versions */}
                    <div className="progress-section">
                      <h4 className="section-subtitle">Resume Status</h4>
                      <div className="version-cards">
                        <div className="version-card">
                          <div className="version-row">
                            <span className="version-name">Current Resume</span>
                            <span className="version-score">
                              {resumeData?.ats_score || "--"}/100
                            </span>
                          </div>
                          <div className="version-row">
                            <span className="version-name">
                              {resumeData?.filename || "No resume uploaded"}
                            </span>
                            <span className="version-score">
                              {resumeData?.ats_analysis?.component_scores
                                ?.keyword_score
                                ? `Keywords: ${resumeData.ats_analysis.component_scores.keyword_score}%`
                                : "N/A"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Skill Gap Analysis */}
                  <div className="overview-card skill-gap">
                    <h3 className="card-title">Skill Gap Analysis</h3>
                    <div className="skill-section">
                      <h4 className="skill-subtitle">
                        {resumeData?.careerAnalysis?.analysis_summary
                          ?.best_match
                          ? `Best Match: ${resumeData.careerAnalysis.analysis_summary.best_match}`
                          : "Skills Analysis"}
                      </h4>
                      <div className="skills-comparison">
                        <div className="skills-column">
                          <p className="column-label">Missing Skills</p>
                          <div className="skill-tags">
                            {resumeData?.careerAnalysis?.top_3_careers?.[0]
                              ?.missing_skills &&
                            resumeData.careerAnalysis.top_3_careers[0]
                              .missing_skills.length > 0 ? (
                              resumeData.careerAnalysis.top_3_careers[0].missing_skills
                                .slice(0, 6)
                                .map((skill, idx) => {
                                  // Clean up markdown formatting
                                  const cleanSkill = skill
                                    .replace(/\*\*/g, "")
                                    .replace(/\*/g, "")
                                    .trim();
                                  return (
                                    <span
                                      key={idx}
                                      className="skill-tag missing"
                                    >
                                      {cleanSkill}
                                    </span>
                                  );
                                })
                            ) : resumeData?.gaps &&
                              resumeData.gaps.length > 0 ? (
                              resumeData.gaps.slice(0, 6).map((gap, idx) => {
                                return (
                                  <span 
                                    key={idx} 
                                    className="skill-tag missing"
                                    dangerouslySetInnerHTML={{ __html: formatText(gap) }}
                                  />
                                );
                              })
                            ) : (
                              <span className="skill-tag existing">
                                No missing skills!
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="skills-column">
                          <p className="column-label">Matched Skills</p>
                          <div className="skill-tags">
                            {resumeData?.careerAnalysis?.top_3_careers?.[0]
                              ?.matched_skills &&
                            resumeData.careerAnalysis.top_3_careers[0]
                              .matched_skills.length > 0 ? (
                              resumeData.careerAnalysis.top_3_careers[0].matched_skills
                                .slice(0, 6)
                                .map((skill, idx) => {
                                  // Clean up markdown formatting
                                  const cleanSkill = skill
                                    .replace(/\*\*/g, "")
                                    .replace(/\*/g, "")
                                    .trim();
                                  return (
                                    <span
                                      key={idx}
                                      className="skill-tag existing"
                                    >
                                      {cleanSkill}
                                    </span>
                                  );
                                })
                            ) : resumeData?.alignment_suggestions &&
                              resumeData.alignment_suggestions.length > 0 ? (
                              resumeData.alignment_suggestions
                                .slice(0, 4)
                                .map((suggestion, idx) => {
                                  return (
                                    <span
                                      key={idx}
                                      className="skill-tag existing"
                                      dangerouslySetInnerHTML={{
                                        __html: formatText(suggestion),
                                      }}
                                    />
                                  );
                                })
                            ) : (
                              <span className="skill-tag existing">
                                Upload resume to analyze
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        className="generate-plan-btn"
                        onClick={() => setCurrentPage("study_planner")}
                      >
                        Generate Study Plan
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="dashboard-container">
      <Sidebar setCurrentPage={setCurrentPage} currentPage={currentPage} />
      <div className="main-content">
        <div className="content-wrapper">{renderPage()}</div>
      </div>
    </div>
  );
}

export default Dashboard;
