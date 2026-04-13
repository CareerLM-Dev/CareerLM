import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import {
  Upload,
  Wand2,
  Rocket,
  Lock,
  CheckCircle,
  FileText,
} from "lucide-react";
import { Button } from "./ui/button";

function ChooseHowToStart() {
  const navigate = useNavigate();
  const [existingResume, setExistingResume] = useState(null);
  const [checkingHistory, setCheckingHistory] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user) {
        const cachedResults = localStorage.getItem(
          `resume_analysis_${data.user.id}`
        );

        if (cachedResults) {
          try {
            const parsedResults = JSON.parse(cachedResults);
            setExistingResume(parsedResults);
          } catch (err) {
            console.error("Failed to parse cached resume:", err);
          }
        } else {
          try {
            const stateResponse = await fetch(
              `http://localhost:8000/api/v1/orchestrator/state/${data.user.id}`
            );
            const stateData = await stateResponse.json();
            if (stateData?.state?.resume_analysis?.overall_score) {
              setExistingResume({
                filename: stateData?.filename || "Resume",
                ats_score: stateData?.state?.resume_analysis?.overall_score,
              });
            }
          } catch (_) {
            // Ignore state fetch errors on home view.
          }
        }
      }
      setCheckingHistory(false);
    });
  }, []);

  return (
    <section className="mb-8">
      {/* Heading */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-foreground mb-2">
          Choose how to start
        </h2>
        <p className="text-muted-foreground">
          Upload your existing document or let our AI guide you step-by-step.
        </p>
      </div>

      {/* Two-card layout */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Card 1: Upload Your Resume */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Upload className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          <h3 className="text-xl font-bold text-foreground mb-2">
            Upload Your Resume
          </h3>

          {checkingHistory ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between animate-pulse">
              <div className="bg-muted rounded-lg p-4 h-16 w-full"></div>
              <div className="space-y-3">
                <div className="h-10 bg-muted rounded-md w-full"></div>
                <div className="h-10 bg-muted rounded-md w-full"></div>
              </div>
            </div>
          ) : existingResume ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-foreground">
                      {existingResume.filename || "Your Resume"}
                    </p>
                    {existingResume.ats_score !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        ATS Score: {Math.round(existingResume.ats_score)}/100
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={() =>
                    navigate("/dashboard/resume-analyzer", {
                      state: { resumeData: existingResume },
                    })
                  }
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  View Results
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/dashboard/upload-resume")}
                  className="w-full"
                >
                  Upload Another Resume
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-6 flex-1">
                Upload your PDF or DOCX on the resume upload page to get a detailed
                evaluation and improvement suggestions.
              </p>

              <Button
                onClick={() => navigate("/dashboard/upload-resume")}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Go to Resume Upload
              </Button>
            </>
          )}
        </div>

        {/* Card 2: Build from Scratch */}
        <div className="bg-card border border-border rounded-xl p-6 relative flex flex-col">
          {/* Recommended badge */}
          <div className="absolute top-4 right-4 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
            Recommended
          </div>

          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
            <Wand2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>

          <h3 className="text-xl font-bold text-foreground mb-2">
            Build from Scratch
          </h3>

          <p className="text-sm text-muted-foreground mb-6 flex-1">
            Create a professional resume tailored to your industry using our AI
            builder. Answer a few questions and we'll handle the formatting.
          </p>

          <Button
            onClick={() => navigate("/resume-builder")}
            className="w-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <Rocket className="w-4 h-4" />
            Start Building
          </Button>
        </div>
      </div>

      {/* Privacy footer */}
      {/* <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Privacy Guaranteed.</span>{" "}
            Your resume data is private and only used to generate insights. We do not
            share your personal information.
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
            <div className="flex items-center gap-1">
              <Lock className="w-4 h-4 text-emerald-500" />
              <span>Encrypted Upload</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>GDPR Compliant</span>
            </div>
          </div>
        </div>
      </div> */}
    </section>
  );
}

export default ChooseHowToStart;
