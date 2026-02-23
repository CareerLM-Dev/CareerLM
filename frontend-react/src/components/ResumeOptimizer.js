// src/components/ResumeOptimizer.js
import React, { useState } from "react";
import ATSScore from "./ATSScore";
import { formatText } from "../utils/textFormatter";
import { FileText, AlertTriangle, Zap, CheckCircle, ChevronRight, Download, Share2 } from "lucide-react";

function ResumeOptimizer({ resumeData }) {
  const [expandedSection, setExpandedSection] = useState(null);

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

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
    <div className="max-w-6xl mx-auto space-y-5">
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
          {/* Header with Actions */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-border rounded-xl p-4 md:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="bg-primary/20 rounded-lg p-2 md:p-3">
                  <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg md:text-xl font-bold">Resume Optimization Results</h3>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">
                    <span className="font-medium text-foreground">{resumeData.filename}</span> • Analyzed successfully
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors">
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                  <Download className="w-4 h-4" />
                  Export Report
                </button>
              </div>
            </div>
          </div>

          {/* ATS Score Component */}
          {resumeData.ats_score && (
            <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm">
              <ATSScore
                score={resumeData.ats_score}
                componentScores={resumeData.ats_analysis?.component_scores}
                justification={resumeData.ats_analysis?.justification}
                aiAnalysis={resumeData.ats_analysis?.ai_analysis}
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            {/* Identified Gaps - Interactive Card */}
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div 
                className="flex items-center justify-between p-4 md:p-5 cursor-pointer bg-destructive/5 hover:bg-destructive/10 transition-colors"
                onClick={() => toggleSection('gaps')}
              >
                <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                  <div className="bg-destructive/20 rounded-lg p-2 md:p-2.5 flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base md:text-lg font-semibold truncate">Identified Gaps</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Areas that need improvement</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                  <span className="bg-destructive text-destructive-foreground px-2 md:px-3 py-1 md:py-1.5 rounded-full text-xs md:text-sm font-bold">
                    {resumeData.gaps?.length || 0}
                  </span>
                  <ChevronRight className={`w-4 h-4 md:w-5 md:h-5 text-muted-foreground transition-transform ${expandedSection === 'gaps' ? 'rotate-90' : ''}`} />
                </div>
              </div>
              {expandedSection === 'gaps' && (
                <div className="p-4 md:p-5 border-t border-border bg-card">
                  {resumeData.gaps && resumeData.gaps.length > 0 ? (
                    <div className="space-y-2">
                      {resumeData.gaps.map((gap, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 bg-destructive/5 rounded-lg border border-destructive/20 hover:border-destructive/40 transition-colors"
                        >
                          <span className="text-destructive font-bold text-sm mt-0.5">#{idx + 1}</span>
                          <span
                            className="text-sm text-foreground flex-1"
                            dangerouslySetInnerHTML={{ __html: formatText(gap) }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-8 text-primary">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">No gaps identified - Great job!</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Alignment Suggestions - Interactive Card */}
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div 
                className="flex items-center justify-between p-4 md:p-5 cursor-pointer bg-primary/5 hover:bg-primary/10 transition-colors"
                onClick={() => toggleSection('suggestions')}
              >
                <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                  <div className="bg-primary/20 rounded-lg p-2 md:p-2.5 flex-shrink-0">
                    <Zap className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base md:text-lg font-semibold truncate">Alignment Suggestions</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Recommendations to boost your score</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                  <span className="bg-primary text-primary-foreground px-2 md:px-3 py-1 md:py-1.5 rounded-full text-xs md:text-sm font-bold">
                    {resumeData.alignment_suggestions?.length || 0}
                  </span>
                  <ChevronRight className={`w-4 h-4 md:w-5 md:h-5 text-muted-foreground transition-transform ${expandedSection === 'suggestions' ? 'rotate-90' : ''}`} />
                </div>
              </div>
              {expandedSection === 'suggestions' && (
                <div className="p-4 md:p-5 border-t border-border bg-card">
                  {resumeData.alignment_suggestions && resumeData.alignment_suggestions.length > 0 ? (
                    <div className="space-y-3">
                      {resumeData.alignment_suggestions.map((suggestion, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20 hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0">
                            {idx + 1}
                          </div>
                          <div
                            className="text-sm text-foreground flex-1 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: formatText(suggestion) }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-8 text-primary">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Perfect alignment - No changes needed!</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export default ResumeOptimizer;
