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
    return <div className="resume-upload-page">Loading...</div>;
  }

  return (
    <div className="resume-upload-page">
      <div className="resume-upload-header">
        <h1>{isOnboardingFlow ? "Complete Your Profile" : "Upload Resume"}</h1>
        <p>
          {isOnboardingFlow
            ? "Upload your resume to get personalized career guidance"
            : "Upload and optimize your resume against job descriptions"}
        </p>
      </div>
      <ResumeUpload onResult={handleResumeAnalysisComplete} />
    </div>
  );
}

export default ResumeUploadPage;
