"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";
import { supabase } from "../api/supabaseClient";
import Sidebar from "../components/layout/Sidebar";
import ResumeUpload from "../components/ResumeUpload";
import ResumeOptimizer from "../components/ResumeOptimizer";
import SkillGapAnalyzer from "../components/SkillGapAnalyzer";
import MockInterview from "../components/MockInterview";
import ColdEmailGenerator from "../components/ColdEmailGenerator";
import StudyPlanner from "../components/StudyPlanner";
import JobMatcher from "../components/JobMatcher";
import { formatText } from "../utils/textFormatter";


function Dashboard() {
  const { session, loading: authLoading } = useUser();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [resumeData, setResumeData] = useState(null);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [backendDown, setBackendDown] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  // Fetch most recent resume data from Supabase
  const fetchLatestResumeData = useCallback(async () => {
    if (authLoading) return; // Wait for auth to resolve
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
  }, [session, authLoading]);

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

  // Fetch questionnaire answers so Target Position reflects the user's actual choices
  useEffect(() => {
    if (!session) return;
    supabase
      .from("user")
      .select("questionnaire_answers")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setUserProfile(data));
  }, [session]);

  // Format snake_case role keys into readable labels (e.g. "data_scientist" → "Data Scientist")
  const formatRole = (role) =>
    role
      ? role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : null;

  // Backend health check — run once on mount; show banner if server is unreachable
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    fetch("http://localhost:8000/", { signal: controller.signal })
      .then((res) => { if (!res.ok) setBackendDown(true); })
      .catch(() => setBackendDown(true))
      .finally(() => clearTimeout(timeoutId));
  }, []);

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
      case "job_matcher":
        return <JobMatcher resumeData={resumeData} setCurrentPage={setCurrentPage} />;
      default:
        return (
          <div className="w-full">
            {loading ? (
              <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                <p className="text-muted-foreground">Loading your resume data...</p>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {/* Top Row - ATS Score Overview + Score Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
                  {/* Main ATS Score - 2 cols */}
                  <div className="md:col-span-2 lg:col-span-2 bg-gradient-to-br from-primary to-primary/80 rounded-xl p-4 md:p-6 text-primary-foreground shadow-lg">
                    <div className="flex flex-col items-center">
                      <div className="relative mb-3 md:mb-4">
                        <svg width="120" height="120" viewBox="0 0 160 160" className="transform -rotate-90 md:w-[140px] md:h-[140px]">
                          <circle
                            cx="80"
                            cy="80"
                            r="70"
                            fill="transparent"
                            stroke="rgba(255, 255, 255, 0.2)"
                            strokeWidth="14"
                          />
                          <circle
                            cx="80"
                            cy="80"
                            r="70"
                            fill="transparent"
                            stroke="white"
                            strokeWidth="14"
                            strokeDasharray={`${(resumeData?.ats_score || 0) * 4.4} 440`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xs opacity-90 font-medium">ATS Score</span>
                          <span className="text-3xl font-bold mt-1">{resumeData?.ats_score || "--"}</span>
                          <span className="text-sm opacity-90">/100</span>
                        </div>
                      </div>
                      <div className="text-center w-full">
                        <p className="text-sm opacity-90 mb-1">Target Position</p>
                        <p className="font-semibold text-base">
                          {resumeData?.careerAnalysis?.analysis_summary?.best_match ||
                            resumeData?.careerAnalysis?.top_3_careers?.[0]?.career ||
                            formatRole(userProfile?.questionnaire_answers?.target_role?.[0]) ||
                            "Not set"}
                        </p>
                      </div>
                      <button
                        onClick={() => setCurrentPage("upload")}
                        className="mt-4 w-full bg-white text-primary px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/90 transition-all shadow-md"
                      >
                        {resumeData ? "Upload New Resume" : "Upload Resume"}
                      </button>
                    </div>
                  </div>

                  {/* Resume Progress & Details - 3 cols */}
                  <div className="md:col-span-2 lg:col-span-3 bg-card border border-border rounded-xl p-3 md:p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2 md:mb-3">
                      <h3 className="text-base md:text-lg font-semibold">Resume Progress & Details</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                      {/* Chart - Left Column */}
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Score Trend Over Time</h4>
                        <div className="bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg p-3 border border-muted">
                          {scoreHistory && scoreHistory.length > 0 ? (
                            <svg width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
                                </linearGradient>
                              </defs>
                              <path d={generateFilledPath()} fill="url(#chartGradient)" />
                              <path d={generateChartPath()} fill="none" stroke="hsl(var(--primary))" strokeWidth="4" />
                            </svg>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-[120px] text-center">
                              <svg className="w-12 h-12 text-muted-foreground/30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              <p className="text-xs text-muted-foreground">No tracking data yet</p>
                              <p className="text-xs text-muted-foreground/60 mt-1">Upload resumes to see progress</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Resume Details - Right Column */}
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Current Resume Info</h4>
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground">Overall Score</span>
                            <span className="text-2xl font-bold text-primary">{resumeData?.ats_score || "--"}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-start justify-between py-2 border-t border-primary/10">
                              <span className="text-xs text-muted-foreground">File Name</span>
                              <span className="text-xs font-medium text-right ml-2 max-w-[200px] truncate" title={resumeData?.filename}>
                                {resumeData?.filename || "No resume uploaded"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-t border-primary/10">
                              <span className="text-xs text-muted-foreground">Keyword Match</span>
                              <span className="text-sm font-semibold text-primary">
                                {resumeData?.ats_analysis?.component_scores?.keyword_score || 0}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-t border-primary/10">
                              <span className="text-xs text-muted-foreground">Last Updated</span>
                              <span className="text-xs font-medium">
                                {resumeData?.filename ? "Recently" : "Never"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Second Row - Performance Breakdown & Skills Combined in 2 Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {/* Left Column - Performance Breakdown */}
                  <div className="md:col-span-1 lg:col-span-1 bg-card border border-border rounded-xl p-3 md:p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2 md:mb-3">
                      <h3 className="text-base md:text-lg font-semibold">Performance Breakdown</h3>
                      <span className="text-xs text-muted-foreground bg-muted px-2 md:px-3 py-1 rounded-full">
                        {resumeData?.filename ? "Latest Analysis" : "No Data"}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {/* Circular Progress Metrics */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col items-center">
                          <div className="relative w-16 h-16 mb-2">
                            <svg width="64" height="64" viewBox="0 0 64 64" className="transform -rotate-90">
                              <circle cx="32" cy="32" r="26" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="5" />
                              <circle
                                cx="32"
                                cy="32"
                                r="26"
                                fill="transparent"
                                stroke="hsl(var(--primary))"
                                strokeWidth="5"
                                strokeDasharray={`${(resumeData?.ats_analysis?.component_scores?.structure_score || 0) * 1.63} 163.4`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-sm font-bold">{resumeData?.ats_analysis?.component_scores?.structure_score || 0}%</span>
                            </div>
                          </div>
                          <p className="text-xs font-medium text-muted-foreground">Structure</p>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="relative w-16 h-16 mb-2">
                            <svg width="64" height="64" viewBox="0 0 64 64" className="transform -rotate-90">
                              <circle cx="32" cy="32" r="26" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="5" />
                              <circle
                                cx="32"
                                cy="32"
                                r="26"
                                fill="transparent"
                                stroke="hsl(var(--primary))"
                                strokeWidth="5"
                                strokeDasharray={`${(resumeData?.ats_analysis?.component_scores?.content_score || 0) * 1.63} 163.4`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-sm font-bold">{resumeData?.ats_analysis?.component_scores?.content_score || 0}%</span>
                            </div>
                          </div>
                          <p className="text-xs font-medium text-muted-foreground">Content</p>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="relative w-16 h-16 mb-2">
                            <svg width="64" height="64" viewBox="0 0 64 64" className="transform -rotate-90">
                              <circle cx="32" cy="32" r="26" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="5" />
                              <circle
                                cx="32"
                                cy="32"
                                r="26"
                                fill="transparent"
                                stroke="hsl(var(--primary))"
                                strokeWidth="5"
                                strokeDasharray={`${(resumeData?.ats_analysis?.component_scores?.formatting_score || 0) * 1.63} 163.4`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-sm font-bold">{resumeData?.ats_analysis?.component_scores?.formatting_score || 0}%</span>
                            </div>
                          </div>
                          <p className="text-xs font-medium text-muted-foreground">Formatting</p>
                        </div>
                      </div>
                      
                      {/* Keywords Match */}
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Keywords Match</span>
                          <span className="text-lg font-semibold text-primary">
                            {resumeData?.ats_analysis?.component_scores?.keyword_score || 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Skill Gap Analysis */}
                  <div className="md:col-span-1 lg:col-span-2 bg-card border border-border rounded-xl p-3 md:p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 md:mb-3 gap-2">
                      <div>
                        <h3 className="text-base md:text-lg font-semibold">Skill Gap Analysis</h3>
                        <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
                          Best Match: <span className="font-semibold text-foreground">
                            {resumeData?.careerAnalysis?.analysis_summary?.best_match ||
                              resumeData?.careerAnalysis?.top_3_careers?.[0]?.career ||
                              formatRole(userProfile?.questionnaire_answers?.target_role?.[0]) ||
                              "Not set"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
                      {/* Missing Skills - Left Column */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-destructive">Skills to Develop</h4>
                          <span className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded-full">
                            {resumeData?.careerAnalysis?.top_3_careers?.[0]?.missing_skills?.length || 
                             resumeData?.gaps?.length || 0} missing
                          </span>
                        </div>
                        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2.5">
                          <div className="flex flex-wrap gap-2">
                            {resumeData?.careerAnalysis?.top_3_careers?.[0]?.missing_skills &&
                            resumeData.careerAnalysis.top_3_careers[0].missing_skills.length > 0 ? (
                              resumeData.careerAnalysis.top_3_careers[0].missing_skills.slice(0, 10).map((skill, idx) => {
                                const cleanSkill = skill.replace(/\*\*/g, "").replace(/\*/g, "").trim();
                                return (
                                  <span key={idx} className="inline-block px-2.5 py-1 bg-white text-destructive text-xs rounded-lg border border-destructive/30 font-medium">
                                    {cleanSkill}
                                  </span>
                                );
                              })
                            ) : resumeData?.gaps && resumeData.gaps.length > 0 ? (
                              resumeData.gaps.slice(0, 10).map((gap, idx) => (
                                <span key={idx} className="inline-block px-2.5 py-1 bg-white text-destructive text-xs rounded-lg border border-destructive/30 font-medium" dangerouslySetInnerHTML={{ __html: formatText(gap) }} />
                              ))
                            ) : (
                              <div className="w-full flex flex-col items-center justify-center py-3">
                                <svg className="w-8 h-8 text-primary mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-xs text-primary font-medium">No missing skills!</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Matched Skills - Right Column */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-primary">Your Strengths</h4>
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                            {resumeData?.careerAnalysis?.top_3_careers?.[0]?.matched_skills?.length || 
                             resumeData?.alignment_suggestions?.length || 0} matched
                          </span>
                        </div>
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5">
                          <div className="flex flex-wrap gap-2">
                            {resumeData?.careerAnalysis?.top_3_careers?.[0]?.matched_skills &&
                            resumeData.careerAnalysis.top_3_careers[0].matched_skills.length > 0 ? (
                              resumeData.careerAnalysis.top_3_careers[0].matched_skills.slice(0, 10).map((skill, idx) => {
                                const cleanSkill = skill.replace(/\*\*/g, "").replace(/\*/g, "").trim();
                                return (
                                  <span key={idx} className="inline-block px-2.5 py-1 bg-white text-primary text-xs rounded-lg border border-primary/30 font-medium">
                                    {cleanSkill}
                                  </span>
                                );
                              })
                            ) : resumeData?.alignment_suggestions && resumeData.alignment_suggestions.length > 0 ? (
                              resumeData.alignment_suggestions.slice(0, 8).map((suggestion, idx) => (
                                <span key={idx} className="inline-block px-2.5 py-1 bg-white text-primary text-xs rounded-lg border border-primary/30 font-medium" dangerouslySetInnerHTML={{ __html: formatText(suggestion) }} />
                              ))
                            ) : (
                              <div className="w-full flex flex-col items-center justify-center py-3">
                                <svg className="w-8 h-8 text-muted-foreground/30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                <span className="text-xs text-muted-foreground">Upload resume to analyze</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Study Plan Button */}
                    <button
                      onClick={() => setCurrentPage("study_planner")}
                      className="w-full bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-all shadow-md mt-3"
                    >
                      Generate Personalized Study Plan
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="flex h-full bg-background">
      <Sidebar
        setCurrentPage={setCurrentPage}
        currentPage={currentPage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
      />
      <main className="flex-1 overflow-auto no-scrollbar transition-all duration-300">
        {backendDown && (
          <div className="flex items-center gap-3 bg-destructive/10 border-b border-destructive/30 text-destructive px-4 py-3 text-sm">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>
              <strong>Backend unavailable</strong> — The CareerLM server is not reachable. Cached data is shown below, but AI features won't work until the server is back online.
            </span>
          </div>
        )}
        <div className="max-w-7xl mx-auto p-4">{renderPage()}</div>
      </main>
    </div>
  );
}

export default Dashboard;
