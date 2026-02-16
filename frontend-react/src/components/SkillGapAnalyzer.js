// src/components/SkillGapAnalyzer.js
import React, { useState } from "react";
import axios from "axios";
import { cleanMarkdown } from "../utils/textFormatter";
import { Button } from "./ui/button";
import { Upload, TrendingUp, Target, Briefcase, CheckCircle, XCircle, AlertCircle } from "lucide-react";

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
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-primary/10 border border-border rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-2">Skill Gap Analyzer</h2>
        <p className="text-muted-foreground">
          Discover which career paths match your skills and get personalized recommendations
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
            <label htmlFor="resumeUpload" className="text-sm font-medium">Upload Resume</label>
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
                  <span className="text-sm">{resumeFile ? resumeFile.name : "Choose a PDF or DOCX file"}</span>
                </div>
              </label>
            </div>
          </div>

          {resumeFile && (
            <Button onClick={handleAnalyze} disabled={loading} className="w-full">
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

      {/* Info Banner */}
      {analysisResult && resumeData?.careerAnalysis && (
        <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">Analysis loaded from: <strong>{resumeData.filename}</strong></span>
        </div>
      )}

      {/* Results */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Target className="w-8 h-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{analysisResult.total_skills_found || 0}</div>
                  <div className="text-sm text-muted-foreground">Skills Detected</div>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Briefcase className="w-8 h-8 text-secondary" />
                <div>
                  <div className="text-sm font-medium line-clamp-2">{analysisResult.analysis_summary?.best_match || "N/A"}</div>
                  <div className="text-xs text-muted-foreground">Best Match</div>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{analysisResult.analysis_summary?.best_match_probability || 0}%</div>
                  <div className="text-sm text-muted-foreground">Match Score</div>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Briefcase className="w-8 h-8 text-accent-foreground" />
                <div>
                  <div className="text-2xl font-bold">{analysisResult.career_matches?.length || 0}</div>
                  <div className="text-sm text-muted-foreground">Career Paths</div>
                </div>
              </div>
            </div>
          </div>

          {/* Your Skills */}
          {analysisResult?.user_skills && analysisResult.user_skills.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Your Detected Skills</h3>
              <div className="flex flex-wrap gap-2">
                {analysisResult.user_skills.map((skill, idx) => (
                  <span key={idx} className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm rounded-full border border-primary/20">
                    {cleanMarkdown(skill)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Career Matches */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Career Path Recommendations</h3>
              <Button variant="outline" size="sm" onClick={() => setShowAllCareers(!showAllCareers)}>
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
                  onClick={() => setSelectedCareer(career)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-sm">{career.career}</h4>
                    <span
                      className="px-2 py-1 text-xs font-medium rounded-full text-white"
                      style={{ backgroundColor: getProbabilityColor(career.probability) }}
                    >
                      {career.probability}%
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3">{getProbabilityLabel(career.probability)}</p>

                  <div className="flex gap-4 mb-3">
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">{career.matched_skills_count}</span>
                      <span className="text-xs text-muted-foreground">Matched</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle className="w-4 h-4 text-destructive" />
                      <span className="text-sm font-medium">{career.missing_skills.length}</span>
                      <span className="text-xs text-muted-foreground">Missing</span>
                    </div>
                  </div>

                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${career.probability}%`,
                        backgroundColor: getProbabilityColor(career.probability),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Career Details */}
          {selectedCareer && (
            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              <h3 className="text-xl font-semibold">{selectedCareer.career} - Detailed Analysis</h3>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Matched Skills */}
                <div>
                  <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-primary" />
                    Your Matching Skills ({selectedCareer?.matched_skills?.length || 0})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedCareer?.matched_skills && selectedCareer.matched_skills.length > 0 ? (
                      selectedCareer.matched_skills.map((skill, idx) => (
                        <span key={idx} className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm rounded-full border border-primary/20">
                          {cleanMarkdown(skill)}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No matching skills found</p>
                    )}
                  </div>
                </div>

                {/* Missing Skills */}
                <div>
                  <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    Skills to Learn ({selectedCareer?.missing_skills?.length || 0})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedCareer?.missing_skills && selectedCareer.missing_skills.length > 0 ? (
                      selectedCareer.missing_skills.map((skill, idx) => (
                        <span key={idx} className="inline-block px-3 py-1 bg-destructive/10 text-destructive text-sm rounded-full border border-destructive/20">
                          {cleanMarkdown(skill)}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No missing skills identified</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Match Breakdown */}
              <div>
                <h4 className="text-base font-semibold mb-4">Match Breakdown</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Skill Match</span>
                      <span className="font-medium">{selectedCareer?.skill_match_percentage || 0}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${selectedCareer?.skill_match_percentage || 0}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Semantic Match</span>
                      <span className="font-medium">{selectedCareer?.semantic_match_percentage || 0}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-secondary rounded-full transition-all"
                        style={{ width: `${selectedCareer?.semantic_match_percentage || 0}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Overall Probability</span>
                      <span className="font-medium">{selectedCareer?.probability || 0}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${selectedCareer?.probability || 0}%`,
                          backgroundColor: getProbabilityColor(selectedCareer?.probability || 0),
                        }}
                      />
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
