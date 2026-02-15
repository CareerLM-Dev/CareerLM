import React from "react";
import ATSScore from "./ATSScore";
import { formatText } from "../utils/textFormatter";
import { CheckCircle, AlertTriangle, Zap } from "lucide-react";

function ResultBox({ result }) {
  if (!result) return null;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {result.error ? (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-destructive/10 p-2 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-destructive">Analysis Error</h3>
            </div>
            <p className="text-muted-foreground">{result.error}</p>
          </div>
        ) : (
          <>
            {/* Success Header */}
            <div className="bg-primary/10 p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Optimization Results</h3>
                  <p className="text-sm text-muted-foreground">Analysis completed successfully</p>
                </div>
              </div>
            </div>

            {/* ATS Score Component */}
            {result.ats_score && (
              <div className="p-6 border-b border-border">
                <ATSScore
                  score={result.ats_score}
                  componentScores={result.ats_analysis?.component_scores}
                  justification={result.ats_analysis?.justification}
                  aiAnalysis={result.ats_analysis?.ai_analysis}
                />
              </div>
            )}

            <div className="p-6 space-y-6">
              {/* Identified Gaps */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="bg-amber-500/10 p-1.5 rounded">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <h4 className="font-semibold">Identified Gaps</h4>
                  <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-medium">
                    {result.gaps?.length || 0}
                  </span>
                </div>
                <div>
                  {result.gaps && result.gaps.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {result.gaps.map((gap, idx) => (
                        <span
                          key={idx}
                          className="inline-block px-3 py-1.5 bg-amber-500/10 text-amber-700 text-sm rounded-lg border border-amber-500/20"
                          dangerouslySetInnerHTML={{ __html: formatText(gap) }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 px-3 py-2 rounded-lg">
                      <CheckCircle className="w-4 h-4" />
                      <span>No gaps identified - Great job!</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Alignment Suggestions */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="bg-primary/10 p-1.5 rounded">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <h4 className="font-semibold">Alignment Suggestions</h4>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {result.alignment_suggestions?.length || 0}
                  </span>
                </div>
                <div>
                  {result.alignment_suggestions && result.alignment_suggestions.length > 0 ? (
                    <div className="space-y-2">
                      {result.alignment_suggestions.map((suggestion, idx) => (
                        <div
                          key={idx}
                          className="px-4 py-3 bg-primary/10 text-sm text-foreground rounded-lg border border-primary/20 leading-relaxed break-words"
                          dangerouslySetInnerHTML={{ __html: formatText(suggestion) }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 px-3 py-2 rounded-lg">
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
    </div>
  );
}

export default ResultBox;
