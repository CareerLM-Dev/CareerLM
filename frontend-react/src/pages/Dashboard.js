"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";
import Sidebar from "../components/layout/Sidebar";
import ResumeUpload from "../components/ResumeUpload";
import ResumeOptimizer from "../components/ResumeOptimizer";
import SkillGapAnalyzer from "../components/SkillGapAnalyzer";
import MockInterview from "../components/MockInterview";
import ColdEmailGenerator from "../components/ColdEmailGenerator";
import StudyPlanner from "../components/StudyPlanner";
import { formatText } from "../utils/textFormatter";


function Dashboard() {
  const { session } = useUser();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [resumeData, setResumeData] = useState(null);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
          // Extract skills for cold email generator
          skills: content.careerAnalysis?.user_skills || [],
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
          <div className="w-full">
            {loading ? (
              <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                <p className="text-muted-foreground">Loading your resume data...</p>
              </div>
            ) : (
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Left Column - Overview & Analysis */}
                <div className="lg:col-span-2 space-y-6">
                  {/* ATS Score Overview */}
                  <div className="bg-primary rounded-lg p-8 text-primary-foreground shadow-lg">
                    <div className="flex flex-col md:flex-row gap-8 items-center">
                      <div className="relative flex-shrink-0">
                        <svg width="160" height="160" viewBox="0 0 160 160" className="transform -rotate-90">
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
                            strokeDasharray={`${(resumeData?.ats_score || 0) * 4.4} 440`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-sm opacity-80">Overall ATS Score</span>
                          <span className="text-2xl font-bold">{resumeData?.ats_score || "--"}/100</span>
                        </div>
                      </div>
                      <div className="flex-1 space-y-4">
                        <div>
                          <p className="text-sm opacity-90 mb-1">Target Job</p>
                          <p className="font-medium">
                            {resumeData?.careerAnalysis?.analysis_summary?.best_match
                              ? resumeData.careerAnalysis.analysis_summary.best_match
                              : resumeData?.careerAnalysis?.top_3_careers?.[0]?.career
                              ? resumeData.careerAnalysis.top_3_careers[0].career
                              : resumeData?.jobDescription
                              ? (() => {
                                  const lines = resumeData.jobDescription.split("\n").filter((line) => line.trim());
                                  const titleLine = lines.find((line) => line.length < 80 && !line.toLowerCase().includes("experience") && !line.toLowerCase().includes("responsibilities") && !line.toLowerCase().includes("requirements")) || lines[0];
                                  return titleLine.substring(0, 60) + (titleLine.length > 60 ? "..." : "");
                                })()
                              : "Upload resume with job description"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm opacity-90 mb-1">Last Analysis</p>
                          <p className="font-medium">{resumeData?.filename || "No resume analyzed yet"}</p>
                        </div>
                        <button
                          onClick={() => setCurrentPage("upload")}
                          className="bg-primary-foreground text-primary px-6 py-2 rounded-md font-medium hover:opacity-90 transition-opacity"
                        >
                          {resumeData ? "Upload New Resume" : "Upload Resume Now"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
                    <h3 className="text-xl font-semibold mb-6">Score Breakdown</h3>
                    <div className="grid grid-cols-3 gap-6">
                      <div className="flex flex-col items-center">
                        <div className="relative w-20 h-20 mb-3">
                          <svg width="80" height="80" viewBox="0 0 80 80" className="transform -rotate-90">
                            <circle cx="40" cy="40" r="32" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="6" />
                            <circle
                              cx="40"
                              cy="40"
                              r="32"
                              fill="transparent"
                              stroke="hsl(var(--primary))"
                              strokeWidth="6"
                              strokeDasharray={`${(resumeData?.ats_analysis?.component_scores?.structure_score || 0) * 2} 200`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold">{resumeData?.ats_analysis?.component_scores?.structure_score || 0}%</span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground text-center">Structure: {resumeData?.ats_analysis?.component_scores?.structure_score || 0}/100</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="relative w-20 h-20 mb-3">
                          <svg width="80" height="80" viewBox="0 0 80 80" className="transform -rotate-90">
                            <circle cx="40" cy="40" r="32" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="6" />
                            <circle
                              cx="40"
                              cy="40"
                              r="32"
                              fill="transparent"
                              stroke="hsl(var(--primary))"
                              strokeWidth="6"
                              strokeDasharray={`${(resumeData?.ats_analysis?.component_scores?.content_score || 0) * 2} 200`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold">{resumeData?.ats_analysis?.component_scores?.content_score || 0}%</span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground text-center">Content: {resumeData?.ats_analysis?.component_scores?.content_score || 0}/100</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="relative w-20 h-20 mb-3">
                          <svg width="80" height="80" viewBox="0 0 80 80" className="transform -rotate-90">
                            <circle cx="40" cy="40" r="32" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="6" />
                            <circle
                              cx="40"
                              cy="40"
                              r="32"
                              fill="transparent"
                              stroke="hsl(var(--primary))"
                              strokeWidth="6"
                              strokeDasharray={`${(resumeData?.ats_analysis?.component_scores?.formatting_score || 0) * 2} 200`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold">{resumeData?.ats_analysis?.component_scores?.formatting_score || 0}%</span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground text-center">Formatting: {resumeData?.ats_analysis?.component_scores?.formatting_score || 0}/100</p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right Column - Actions & Progress */}
                <div className="space-y-6">
                  {/* Action & Progress */}
                  <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
                    <h3 className="text-xl font-semibold mb-6">Action & Progress</h3>

                    {/* ATS Score Trend */}
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-muted-foreground mb-3">ATS Score Trend</h4>
                      <div className="bg-muted/30 rounded-lg p-4">
                        {scoreHistory && scoreHistory.length > 0 ? (
                          <svg width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
                              </linearGradient>
                            </defs>
                            <path d={generateFilledPath()} fill="url(#chartGradient)" />
                            <path d={generateChartPath()} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" />
                          </svg>
                        ) : (
                          <div className="flex items-center justify-center h-[120px] text-sm text-muted-foreground">
                            No history data available yet. Upload a resume to start tracking!
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Resume Versions */}
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-3">Resume Status</h4>
                      <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Current Resume</span>
                          <span className="text-sm font-semibold">{resumeData?.ats_score || "--"}/100</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-muted-foreground">
                          <span>{resumeData?.filename || "No resume uploaded"}</span>
                          <span>
                            {resumeData?.ats_analysis?.component_scores?.keyword_score
                              ? `Keywords: ${resumeData.ats_analysis.component_scores.keyword_score}%`
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Skill Gap Analysis */}
                  <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
                    <h3 className="text-xl font-semibold mb-4">Skill Gap Analysis</h3>
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium">
                        {resumeData?.careerAnalysis?.analysis_summary?.best_match
                          ? `Best Match: ${resumeData.careerAnalysis.analysis_summary.best_match}`
                          : "Skills Analysis"}
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Missing Skills</p>
                          <div className="flex flex-wrap gap-2">
                            {resumeData?.careerAnalysis?.top_3_careers?.[0]?.missing_skills &&
                            resumeData.careerAnalysis.top_3_careers[0].missing_skills.length > 0 ? (
                              resumeData.careerAnalysis.top_3_careers[0].missing_skills.slice(0, 6).map((skill, idx) => {
                                const cleanSkill = skill.replace(/\*\*/g, "").replace(/\*/g, "").trim();
                                return (
                                  <span key={idx} className="inline-block px-3 py-1 bg-destructive/10 text-destructive text-sm rounded-full border border-destructive/20">
                                    {cleanSkill}
                                  </span>
                                );
                              })
                            ) : resumeData?.gaps && resumeData.gaps.length > 0 ? (
                              resumeData.gaps.slice(0, 6).map((gap, idx) => (
                                <span key={idx} className="inline-block px-3 py-1 bg-destructive/10 text-destructive text-sm rounded-full border border-destructive/20" dangerouslySetInnerHTML={{ __html: formatText(gap) }} />
                              ))
                            ) : (
                              <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm rounded-full border border-primary/20">
                                No missing skills!
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Matched Skills</p>
                          <div className="flex flex-wrap gap-2">
                            {resumeData?.careerAnalysis?.top_3_careers?.[0]?.matched_skills &&
                            resumeData.careerAnalysis.top_3_careers[0].matched_skills.length > 0 ? (
                              resumeData.careerAnalysis.top_3_careers[0].matched_skills.slice(0, 6).map((skill, idx) => {
                                const cleanSkill = skill.replace(/\*\*/g, "").replace(/\*/g, "").trim();
                                return (
                                  <span key={idx} className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm rounded-full border border-primary/20">
                                    {cleanSkill}
                                  </span>
                                );
                              })
                            ) : resumeData?.alignment_suggestions && resumeData.alignment_suggestions.length > 0 ? (
                              resumeData.alignment_suggestions.slice(0, 4).map((suggestion, idx) => (
                                <span key={idx} className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm rounded-full border border-primary/20" dangerouslySetInnerHTML={{ __html: formatText(suggestion) }} />
                              ))
                            ) : (
                              <span className="inline-block px-3 py-1 bg-muted text-muted-foreground text-sm rounded-full">
                                Upload resume to analyze
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setCurrentPage("study_planner")}
                        className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:opacity-90 transition-opacity"
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
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      <Sidebar
        setCurrentPage={setCurrentPage}
        currentPage={currentPage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
      />
      <main className="flex-1 overflow-auto transition-all duration-300">
        <div className="max-w-7xl mx-auto p-6">{renderPage()}</div>
      </main>
    </div>
  );
}

export default Dashboard;
