"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import ResumeUpload from "../components/ResumeUpload";
import Sidebar from "../components/layout/Sidebar";


function ResumeUploadPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [isOnboardingFlow, setIsOnboardingFlow] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentResults, setCurrentResults] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (!data.session) {
        navigate("/auth");
        return;
      }

      // Check for existing results in localStorage
      const userId = data.session.user.id;
      const cached = localStorage.getItem(`resume_analysis_${userId}`);
      if (cached) {
        try {
          setCurrentResults(JSON.parse(cached));
        } catch (err) {
          console.error("Failed to parse cached results:", err);
        }
      }
      setLoading(false);
    });

    const fromOnboarding = sessionStorage.getItem("fromOnboarding");
    if (fromOnboarding) {
      setIsOnboardingFlow(true);
      sessionStorage.removeItem("fromOnboarding");
    }
  }, [navigate]);

  const handleResumeAnalysisComplete = (resumeData) => {
    setCurrentResults(resumeData);
    // Also navigate to dedicated results page
    // navigate("/resume-results", { state: { resumeData } });
  };

  const handleSetPage = (pageId) => {
    navigate("/dashboard", { state: { initialPage: pageId } });
  };

  const handleClearResults = () => {
    if (session?.user?.id) {
      localStorage.removeItem(`resume_analysis_${session.user.id}`);
      setCurrentResults(null);
    }
  };

  if (loading || !session) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
      />
      <main className="flex-1 overflow-auto no-scrollbar">
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {isOnboardingFlow ? "Complete Your Profile" : "Upload Resume"}
            </h1>
            <p className="text-muted-foreground">
              {isOnboardingFlow
                ? "Upload your resume to get personalized career guidance"
                : "Upload and optimize your resume against job descriptions"}
            </p>
          </div>

          {/* Show existing results if available */}
          {currentResults ? (
            <div className="bg-card border border-primary/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Previous Analysis Available</h3>
                  <p className="text-xs text-muted-foreground">
                    {currentResults.filename || "Last analyzed resume"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate("/resume-results", { state: { resumeData: currentResults } })}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
                  >
                    View Results
                  </button>
                  <button
                    onClick={handleClearResults}
                    className="px-3 py-1.5 border border-border rounded-md text-sm font-medium hover:bg-muted"
                  >
                    New Analysis
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ResumeUpload
              onResult={handleResumeAnalysisComplete}
              hideIfResults={true}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default ResumeUploadPage;
