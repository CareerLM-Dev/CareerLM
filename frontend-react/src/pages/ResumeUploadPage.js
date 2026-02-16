"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import ResumeUpload from "../components/ResumeUpload";


function ResumeUploadPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [isOnboardingFlow, setIsOnboardingFlow] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        navigate("/auth");
      }
    });

    // Check if coming from onboarding (optional - you can persist this in local storage if needed)
    const fromOnboarding = sessionStorage.getItem("fromOnboarding");
    if (fromOnboarding) {
      setIsOnboardingFlow(true);
      sessionStorage.removeItem("fromOnboarding");
    }
  }, [navigate]);

  const handleResumeAnalysisComplete = () => {
    // After resume is analyzed, redirect to dashboard to view results
    navigate("/dashboard");
  };

  if (!session) {
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
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
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
        <ResumeUpload onResult={handleResumeAnalysisComplete} />
      </div>
    </div>
  );
}

export default ResumeUploadPage;
