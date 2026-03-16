// src/components/SkillGapAnalyzer.js
import React, { useState } from "react";
import axios from "axios";
import { cleanMarkdown } from "../utils/textFormatter";
import { Button } from "./ui/button";
import {
  Upload,
  TrendingUp,
  Target,
  Briefcase,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../api/supabaseClient";

function SkillGapAnalyzer({ resumeData }) {
  const [resumeFile, setResumeFile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCareer, setSelectedCareer] = useState(null);
  const [showAllCareers, setShowAllCareers] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [userId, setUserId] = useState(null);
  const [selectedMissingSkill, setSelectedMissingSkill] = useState(null);

  const normalizeRole = (value) =>
    (value || "")
      .toLowerCase()
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const roleMatches = (careerName, interestedRoles) => {
    const career = normalizeRole(careerName);
    return (interestedRoles || []).some((role) => {
      const target = normalizeRole(role);
      return (
        target &&
        (target === career ||
          target.includes(career) ||
          career.includes(target))
      );
    });
  };

  const getInterestedRoleFilteredCareers = (payload) => {
    const roles = Array.isArray(payload?.interested_roles)
      ? payload.interested_roles
      : [];
    const matches = payload?.career_matches || [];
    if (!roles.length) {
      return matches;
    }
    const filtered = matches.filter((career) =>
      roleMatches(career?.career, roles),
    );
    return filtered.length ? filtered : matches;
  };

  // Get current user ID
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
      }
    });
  }, []);

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
        const filtered = getInterestedRoleFilteredCareers(careerData);
        setSelectedCareer(filtered.length > 0 ? filtered[0] : null);
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
    setSelectedMissingSkill(null);

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

      // Add user_id for personalized recommendations
      if (userId) {
        formData.append("user_id", userId);
      }

      const result = await axios.post(
        "http://localhost:8000/api/v1/orchestrator/skill-gap-analysis",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      setAnalysisResult(result.data);
      const filtered = getInterestedRoleFilteredCareers(result.data);
      setSelectedCareer(filtered.length > 0 ? filtered[0] : null);
      setSelectedMissingSkill(null);
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

  const interestedRoleFilteredCareers =
    getInterestedRoleFilteredCareers(analysisResult);
  const interestedRoleTop3 = interestedRoleFilteredCareers.slice(0, 3);

  const careersToDisplay = showAllCareers
    ? interestedRoleFilteredCareers
    : interestedRoleTop3;

  const skillConfidenceLevels = analysisResult?.skill_confidence_levels || {
    high_confidence: [],
    medium_confidence: [],
    low_confidence: [],
  };
  const skillConfidenceDetails = analysisResult?.skill_confidence_details || [];

  const getSkillDetail = (skill) => {
    const key = (skill || "").toLowerCase();
    return skillConfidenceDetails.find(
      (item) => (item.skill || "").toLowerCase() === key,
    );
  };

  const getSkillConfidenceLevel = (skill) => {
    const s = (skill || "").toLowerCase();
    if (
      skillConfidenceLevels.high_confidence.some((it) => it.toLowerCase() === s)
    ) {
      return "high";
    }
    if (
      skillConfidenceLevels.medium_confidence.some(
        (it) => it.toLowerCase() === s,
      )
    ) {
      return "medium";
    }
    return "low";
  };

  const getConfidenceChipClass = (level) => {
    if (level === "high") {
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    }
    if (level === "medium") {
      return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    }
    return "bg-slate-500/10 text-slate-600 border-slate-500/30";
  };

  const getSkillEvidenceText = (skill) => {
    const detail = getSkillDetail(skill);
    if (!detail) return "No confidence evidence available.";

    const evidence = Array.isArray(detail.evidence)
      ? detail.evidence.join(", ")
      : "No evidence listed";
    return `Score: ${detail.score ?? 0} | Level: ${detail.level || "unknown"} | Evidence: ${evidence}`;
  };

  // Get confidence level as percentage for progress bars
  const getConfidencePercentage = (level) => {
    if (level === "high" || level === "high_confidence") return 85;
    if (level === "medium" || level === "medium_confidence") return 50;
    return 20; // low
  };

  // Get learning metadata for missing skill
  const getSkillLearningInfo = (skill) => {
    const metadata = selectedCareer?.missing_skills_metadata?.find(
      (m) => m.skill === skill,
    );
    return metadata || null;
  };

  const getMissingSkillReason = (skill) => {
    const metadata = getSkillLearningInfo(skill);
    if (metadata?.reason) return metadata.reason;
    return "Learning this skill improves your fit for this role and helps close high-impact gaps in your profile.";
  };

  const toggleMissingSkillDetails = (skill, group = "missing") => {
    const key = `${group}::${skill}`;
    setSelectedMissingSkill((prev) => (prev === key ? null : key));
  };

  const getSelectedGapSkillName = () => {
    if (!selectedMissingSkill) return null;
    const parts = selectedMissingSkill.split("::");
    return parts.length === 2 ? parts[1] : selectedMissingSkill;
  };

  const getSelectedGapSkillGroup = () => {
    if (!selectedMissingSkill) return null;
    const parts = selectedMissingSkill.split("::");
    return parts.length === 2 ? parts[0] : null;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-primary/10 border border-border rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-2">Skill Gap Analyzer</h2>
        <p className="text-muted-foreground">
          Discover which career paths match your skills and get personalized
          recommendations
        </p>
      </div>

      {/* Input Section */}
      {!analysisResult && !resumeData?.careerAnalysis && (
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              No resume uploaded. Please upload in Resume Optimizer first.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="resumeUpload" className="text-sm font-medium">
              Upload Resume
            </label>
            <div className="relative">
              <input
                id="resumeUpload"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="resumeUpload"
                className="flex items-center justify-center w-full h-20 px-4 transition bg-muted hover:bg-muted/80 border-2 border-dashed border-border rounded-lg cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm">
                    {resumeFile ? resumeFile.name : "Choose a PDF or DOCX file"}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {resumeFile && (
            <Button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Analyzing Your Skills..." : "Analyze Career Matches"}
            </Button>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/50 text-destructive px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Summary Cards - Redesigned Layout */}
          <div className="grid md:grid-cols-2 gap-4 items-start">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Analysis Source */}
              <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">
                  Analysis loaded from:{" "}
                  <strong>{resumeData?.filename || "Uploaded Resume"}</strong>
                </span>
              </div>

              {Array.isArray(analysisResult?.interested_roles) &&
                analysisResult.interested_roles.length > 0 && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 px-4 py-2 rounded-lg text-sm">
                    Showing analysis for your interested role(s):{" "}
                    {analysisResult.interested_roles.join(", ")}
                  </div>
                )}

              {/* Skills Detected - Click to View */}
              <div
                className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setShowSkillsModal(true)}
              >
                <div className="flex items-center gap-3">
                  <Target className="w-8 h-8 text-primary" />
                  {/* Learning Timeline Summary */}
                  {selectedCareer?.missing_skills_metadata &&
                    selectedCareer.missing_skills_metadata.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-border">
                        <h5 className="text-sm font-semibold mb-3">
                          Learning Timeline
                        </h5>
                        {(() => {
                          const quickFixes =
                            selectedCareer.missing_skills_metadata.filter(
                              (m) => m.is_quick_fix,
                            );
                          const shortTerm =
                            selectedCareer.missing_skills_metadata.filter(
                              (m) => !m.is_quick_fix && m.learning_days <= 30,
                            );
                          const mediumTerm =
                            selectedCareer.missing_skills_metadata.filter(
                              (m) =>
                                m.learning_days > 30 && m.learning_days <= 90,
                            );
                          const longTerm =
                            selectedCareer.missing_skills_metadata.filter(
                              (m) => m.learning_days > 90,
                            );
                          const totalDays =
                            selectedCareer.missing_skills_metadata.reduce(
                              (sum, m) => sum + m.learning_days,
                              0,
                            );
                          const totalMonths = Math.ceil(totalDays / 30);

                          return (
                            <div className="space-y-3">
                              {quickFixes.length > 0 && (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white font-bold rounded">
                                    ⚡ {quickFixes.length}
                                  </span>
                                  <span className="text-muted-foreground">
                                    Quick Fix (&lt; 1 week)
                                  </span>
                                </div>
                              )}
                              {shortTerm.length > 0 && (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500 text-white font-bold rounded">
                                    {shortTerm.length}
                                  </span>
                                  <span className="text-muted-foreground">
                                    Short-term (1-4 weeks)
                                  </span>
                                </div>
                              )}
                              {mediumTerm.length > 0 && (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500 text-white font-bold rounded">
                                    {mediumTerm.length}
                                  </span>
                                  <span className="text-muted-foreground">
                                    Medium-term (1-3 months)
                                  </span>
                                </div>
                              )}
                              {longTerm.length > 0 && (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500 text-white font-bold rounded">
                                    {longTerm.length}
                                  </span>
                                  <span className="text-muted-foreground">
                                    Long-term (3+ months)
                                  </span>
                                </div>
                              )}
                              <div className="pt-2 mt-2 border-t border-border">
                                <div className="text-sm font-semibold text-foreground">
                                  Total learning time: ~{totalMonths} month
                                  {totalMonths !== 1 ? "s" : ""}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  (Sequential learning; parallel learning may be
                                  faster)
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  <div>
                    <div className="text-2xl font-bold">
                      {analysisResult.total_skills_found || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Skills Detected (Click to view)
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-3">
                  Skill Confidence Split
                </h4>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                    <div className="text-lg font-bold text-emerald-600">
                      {skillConfidenceLevels.high_confidence.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Strong</div>
                  </div>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                    <div className="text-lg font-bold text-amber-600">
                      {skillConfidenceLevels.medium_confidence.length}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Moderate
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-500/30 bg-slate-500/10 p-2">
                    <div className="text-lg font-bold text-slate-600">
                      {skillConfidenceLevels.low_confidence.length}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Low Exposure
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4 self-start">
              {/* Combined Best Match, Match Score, and Career Paths Card */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-3 flex-1">
                    <Briefcase className="w-8 h-8 text-secondary" />
                    <div>
                      <div className="text-lg font-semibold line-clamp-2">
                        {analysisResult.analysis_summary?.best_match || "N/A"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Best Match
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-primary" />
                    <div>
                      <div className="text-2xl font-bold">
                        {analysisResult.analysis_summary
                          ?.best_match_probability || 0}
                        %
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Match Score
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2 mt-2 border-t border-border">
                  <Briefcase className="w-8 h-8 text-accent-foreground" />
                  <div>
                    <div className="text-2xl font-bold">
                      {analysisResult.career_matches?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Career Paths
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Career Matches */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">
                Career Path Recommendations
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllCareers(!showAllCareers)}
              >
                {showAllCareers ? "Show Top 3" : "Show All Careers"}
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {careersToDisplay?.map((career, idx) => (
                <div
                  key={idx}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedCareer?.career === career.career
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => {
                    setSelectedCareer(career);
                    setSelectedMissingSkill(null);
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-sm">{career.career}</h4>
                    <span
                      className="px-2 py-1 text-xs font-medium rounded-full text-white"
                      style={{
                        backgroundColor: getProbabilityColor(
                          career.probability,
                        ),
                      }}
                    >
                      {career.probability}%
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3">
                    {getProbabilityLabel(career.probability)}
                  </p>

                  {career?.score_summary && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-3">
                      {cleanMarkdown(career.score_summary)}
                    </p>
                  )}

                  <div className="flex gap-4 mb-3">
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">
                        {career.matched_skills_count}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Matched
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle className="w-4 h-4 text-destructive" />
                      <span className="text-sm font-medium">
                        {career.missing_skills.length}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Missing
                      </span>
                    </div>
                  </div>

                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
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

          {/* Selected Career Details - Redesigned Layout */}
          {selectedCareer && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-6">
                {selectedCareer.career} - Detailed Analysis
              </h3>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Left Column - Skills */}
                <div className="space-y-6">
                  {/* Matched Skills */}
                  <div>
                    <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-primary" />
                      Your Matching Skills (
                      {selectedCareer?.matched_skills?.length || 0})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedCareer?.matched_skills &&
                      selectedCareer.matched_skills.length > 0 ? (
                        selectedCareer.matched_skills.map((skill, idx) =>
                          (() => {
                            const level = getSkillConfidenceLevel(skill);
                            const detail = getSkillDetail(skill);
                            const percentage = getConfidencePercentage(level);
                            return (
                              <span
                                key={idx}
                                title={getSkillEvidenceText(skill)}
                                className={`inline-flex items-center gap-2 px-3 py-1 text-sm rounded-full border ${getConfidenceChipClass(level)} relative overflow-hidden`}
                              >
                                {/* Progress bar background */}
                                <span
                                  className="absolute inset-0 opacity-20"
                                  style={{
                                    background:
                                      level === "high"
                                        ? `linear-gradient(to right, rgb(16, 185, 129) ${percentage}%, transparent ${percentage}%)`
                                        : level === "medium"
                                          ? `linear-gradient(to right, rgb(245, 158, 11) ${percentage}%, transparent ${percentage}%)`
                                          : `linear-gradient(to right, rgb(100, 116, 139) ${percentage}%, transparent ${percentage}%)`,
                                  }}
                                />
                                <span className="relative z-10">
                                  {cleanMarkdown(skill)}
                                </span>
                                <span className="relative z-10 text-[10px] uppercase tracking-wide opacity-80">
                                  {level}
                                </span>
                                <span className="relative z-10 text-[10px] font-semibold opacity-80">
                                  S:{detail?.score ?? 0}
                                </span>
                              </span>
                            );
                          })(),
                        )
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No matching skills found
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Hover on a skill chip to see confidence evidence and
                      scoring.
                    </p>
                  </div>

                  {/* Missing Skills */}
                  <div>
                    <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-destructive" />
                      Skills to Learn (
                      {selectedCareer?.missing_skills?.length || 0})
                    </h4>
                    <div className="space-y-2">
                      {selectedCareer?.missing_skills &&
                      selectedCareer.missing_skills.length > 0 ? (
                        selectedCareer.missing_skills.map((skill, idx) => {
                          const learningInfo = getSkillLearningInfo(skill);
                          const isQuickFix = learningInfo?.is_quick_fix;
                          const isSelected =
                            selectedMissingSkill === `missing::${skill}`;
                          return (
                            <button
                              type="button"
                              key={idx}
                              onClick={() =>
                                toggleMissingSkillDetails(skill, "missing")
                              }
                              className={`inline-flex items-center gap-2 px-3 py-1 text-sm rounded-full border transition-colors ${
                                isSelected
                                  ? "bg-destructive text-destructive-foreground border-destructive"
                                  : "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
                              }`}
                            >
                              {cleanMarkdown(skill)}
                              {learningInfo && (
                                <span
                                  className={`text-[10px] ${isSelected ? "text-destructive-foreground/80" : "text-muted-foreground"}`}
                                >
                                  {learningInfo.learning_time_label}
                                </span>
                              )}
                              {isQuickFix && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded uppercase">
                                  ⚡ Quick Fix
                                </span>
                              )}
                            </button>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No missing skills identified
                        </p>
                      )}
                    </div>

                    <div className="mt-4">
                      <h4 className="text-base font-semibold mb-2 flex items-center gap-2 text-amber-700">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        Needs Improvement (
                        {selectedCareer?.needs_improvement_skills?.length || 0})
                      </h4>
                      <div className="space-y-2">
                        {selectedCareer?.needs_improvement_skills &&
                        selectedCareer.needs_improvement_skills.length > 0 ? (
                          selectedCareer.needs_improvement_skills.map(
                            (skill, idx) => {
                              const learningInfo = getSkillLearningInfo(skill);
                              const isSelected =
                                selectedMissingSkill === `improve::${skill}`;
                              return (
                                <button
                                  type="button"
                                  key={`improve-${idx}`}
                                  onClick={() =>
                                    toggleMissingSkillDetails(skill, "improve")
                                  }
                                  className={`inline-flex items-center gap-2 px-3 py-1 text-sm rounded-full border transition-colors ${
                                    isSelected
                                      ? "bg-amber-500 text-white border-amber-500"
                                      : "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20"
                                  }`}
                                >
                                  {cleanMarkdown(skill)}
                                  {learningInfo && (
                                    <span
                                      className={`text-[10px] ${isSelected ? "text-white/80" : "text-muted-foreground"}`}
                                    >
                                      {learningInfo.learning_time_label}
                                    </span>
                                  )}
                                </button>
                              );
                            },
                          )
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No skills flagged for improvement.
                          </p>
                        )}
                      </div>
                    </div>

                    {selectedMissingSkill && (
                      <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold text-slate-700 mb-1">
                          {getSelectedGapSkillGroup() === "improve"
                            ? "Why improve"
                            : "Why learn"}{" "}
                          {cleanMarkdown(getSelectedGapSkillName())}?
                        </p>
                        <p className="text-sm text-slate-600">
                          {getMissingSkillReason(getSelectedGapSkillName())}
                        </p>
                        {getSkillLearningInfo(getSelectedGapSkillName())
                          ?.bucket && (
                          <div className="mt-2 text-[11px] text-slate-500">
                            Gap type:{" "}
                            {getSkillLearningInfo(
                              getSelectedGapSkillName(),
                            ).bucket.replace(/_/g, " ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Match Breakdown */}
                <div>
                  <h4 className="text-base font-semibold mb-4">
                    Match Breakdown
                  </h4>
                  {selectedCareer?.score_summary && (
                    <div className="mb-4 rounded-md border border-border bg-muted/30 p-3">
                      <p className="text-xs font-semibold text-foreground mb-1">
                        Why this score
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {cleanMarkdown(selectedCareer.score_summary)}
                      </p>
                    </div>
                  )}
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Skill Match</span>
                        <span className="font-medium">
                          {selectedCareer?.skill_match_percentage || 0}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{
                            width: `${selectedCareer?.skill_match_percentage || 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Overall Probability</span>
                        <span className="font-medium">
                          {selectedCareer?.probability || 0}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${selectedCareer?.probability || 0}%`,
                            backgroundColor: getProbabilityColor(
                              selectedCareer?.probability || 0,
                            ),
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-semibold mb-2">
                      Confidence Evidence (Matched Skills)
                    </h5>
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                      {(selectedCareer?.matched_skills || []).length > 0 ? (
                        <div className="divide-y divide-border">
                          {selectedCareer.matched_skills.map((skill, idx) => {
                            const detail = getSkillDetail(skill);
                            const evidence = detail?.evidence?.length
                              ? detail.evidence.join(", ")
                              : "No explicit evidence";
                            return (
                              <div
                                key={`evidence-${idx}`}
                                className="p-2 text-xs"
                              >
                                <div className="font-medium text-foreground">
                                  {cleanMarkdown(skill)}
                                  <span className="ml-2 text-muted-foreground">
                                    (
                                    {detail?.level ||
                                      getSkillConfidenceLevel(skill)}{" "}
                                    | score: {detail?.score ?? 0})
                                  </span>
                                </div>
                                <div className="text-muted-foreground mt-0.5">
                                  {evidence}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="p-3 text-xs text-muted-foreground">
                          No matched skills to show evidence.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Skills Modal */}
          {showSkillsModal && (
            <div
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              onClick={() => setShowSkillsModal(false)}
            >
              <div
                className="bg-card border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    <Target className="w-6 h-6 text-primary" />
                    Your Detected Skills (
                    {analysisResult.total_skills_found || 0})
                  </h3>
                  <button
                    onClick={() => setShowSkillsModal(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
                {analysisResult?.user_skills &&
                analysisResult.user_skills.length > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold mb-2 text-emerald-600 flex items-center gap-2">
                        Strong Skills (project/experience evidence)
                        <span className="text-xs font-normal text-muted-foreground">
                          ({skillConfidenceLevels.high_confidence.length})
                        </span>
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {skillConfidenceLevels.high_confidence.map(
                          (skill, idx) => {
                            const detail = getSkillDetail(skill);
                            const percentage = getConfidencePercentage("high");
                            return (
                              <span
                                key={`high-${idx}`}
                                title={getSkillEvidenceText(skill)}
                                className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-600 text-sm rounded-full border border-emerald-500/30 relative overflow-hidden"
                              >
                                <span
                                  className="absolute inset-0 opacity-20 bg-emerald-500"
                                  style={{ width: `${percentage}%` }}
                                />
                                <span className="relative z-10">
                                  {cleanMarkdown(skill)}
                                </span>
                                <span className="relative z-10 text-[10px] font-semibold">
                                  S:{detail?.score ?? 0}
                                </span>
                              </span>
                            );
                          },
                        )}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-2 text-amber-600 flex items-center gap-2">
                        Moderate Skills (listed, less evidence)
                        <span className="text-xs font-normal text-muted-foreground">
                          ({skillConfidenceLevels.medium_confidence.length})
                        </span>
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {skillConfidenceLevels.medium_confidence.map(
                          (skill, idx) => {
                            const detail = getSkillDetail(skill);
                            const percentage =
                              getConfidencePercentage("medium");
                            return (
                              <span
                                key={`med-${idx}`}
                                title={getSkillEvidenceText(skill)}
                                className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-600 text-sm rounded-full border border-amber-500/30 relative overflow-hidden"
                              >
                                <span
                                  className="absolute inset-0 opacity-20 bg-amber-500"
                                  style={{ width: `${percentage}%` }}
                                />
                                <span className="relative z-10">
                                  {cleanMarkdown(skill)}
                                </span>
                                <span className="relative z-10 text-[10px] font-semibold">
                                  S:{detail?.score ?? 0}
                                </span>
                              </span>
                            );
                          },
                        )}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-2 text-slate-600 flex items-center gap-2">
                        Low Exposure (weak evidence)
                        <span className="text-xs font-normal text-muted-foreground">
                          ({skillConfidenceLevels.low_confidence.length})
                        </span>
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {skillConfidenceLevels.low_confidence.map(
                          (skill, idx) => {
                            const detail = getSkillDetail(skill);
                            const percentage = getConfidencePercentage("low");
                            return (
                              <span
                                key={`low-${idx}`}
                                title={getSkillEvidenceText(skill)}
                                className="inline-flex items-center gap-2 px-3 py-1 bg-slate-500/10 text-slate-600 text-sm rounded-full border border-slate-500/30 relative overflow-hidden"
                              >
                                <span
                                  className="absolute inset-0 opacity-20 bg-slate-500"
                                  style={{ width: `${percentage}%` }}
                                />
                                <span className="relative z-10">
                                  {cleanMarkdown(skill)}
                                </span>
                                <span className="relative z-10 text-[10px] font-semibold">
                                  S:{detail?.score ?? 0}
                                </span>
                              </span>
                            );
                          },
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No skills detected
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SkillGapAnalyzer;
