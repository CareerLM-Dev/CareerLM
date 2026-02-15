// src/components/ResumeOptimizer.js
import React from "react";
import ATSScore from "./ATSScore";
import { formatText } from "../utils/textFormatter";
import { FileText, AlertTriangle, Zap, CheckCircle } from "lucide-react";

function ResumeOptimizer({ resumeData }) {
  if (!resumeData) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="bg-muted rounded-full p-6">
              <FileText className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold">No Resume Analyzed Yet</h3>
            <p className="text-muted-foreground max-w-md">
              Upload a resume to see optimization results and ATS score analysis.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {resumeData.error ? (
        <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="bg-destructive/20 rounded-full p-3">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-destructive mb-2">Analysis Error</h3>
              <p className="text-sm text-destructive/90">{resumeData.error}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-border rounded-lg p-6">
            <div className="flex items-center gap-4">
              <div className="bg-primary/20 rounded-full p-3">
                <CheckCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Resume Optimization Results</h3>
                <p className="text-sm text-muted-foreground">Analysis for: {resumeData.filename}</p>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* ATS Score Component */}
            {resumeData.ats_score && (
              <div className="lg:col-span-2">
                <ATSScore
                  score={resumeData.ats_score}
                  componentScores={resumeData.ats_analysis?.component_scores}
                  justification={resumeData.ats_analysis?.justification}
                  aiAnalysis={resumeData.ats_analysis?.ai_analysis}
                />
              </div>
            )}

            {/* Identified Gaps */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-destructive/10 rounded-lg p-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <h4 className="text-lg font-semibold">Identified Gaps</h4>
                <span className="ml-auto bg-destructive/10 text-destructive px-3 py-1 rounded-full text-sm font-medium">
                  {resumeData.gaps?.length || 0}
                </span>
              </div>
              <div>
                {resumeData.gaps && resumeData.gaps.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {resumeData.gaps.map((gap, idx) => (
                      <span
                        key={idx}
                        className="inline-block px-3 py-1 bg-destructive/10 text-destructive text-sm rounded-full border border-destructive/20"
                        dangerouslySetInnerHTML={{ __html: formatText(gap) }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <CheckCircle className="w-4 h-4" />
                    <span>No gaps identified - Great job!</span>
                  </div>
                )}
              </div>
            </div>

            {/* Alignment Suggestions */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-primary/10 rounded-lg p-2">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <h4 className="text-lg font-semibold">Alignment Suggestions</h4>
                <span className="ml-auto bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
                  {resumeData.alignment_suggestions?.length || 0}
                </span>
              </div>
              <div>
                {resumeData.alignment_suggestions && resumeData.alignment_suggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {resumeData.alignment_suggestions.map((suggestion, idx) => (
                      <span
                        key={idx}
                        className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm rounded-full border border-primary/20"
                        dangerouslySetInnerHTML={{ __html: formatText(suggestion) }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <CheckCircle className="w-4 h-4" />
                    <span>Perfect alignment - No changes needed!</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export default ResumeOptimizer;
