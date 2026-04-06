import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { supabase } from "../api/supabaseClient";
import { 
  FileText, 
  Upload,
  Wand2,
  Shield,
  Lock,
  CheckCircle,
  Sparkles,
  AlertCircle
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";

/**
 * HomePage - Resume Evaluation landing page for authenticated users
 * Shows two main options: Upload existing resume or build from scratch
 */
function HomePage() {
  const { session } = useUser();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [builderNotice, setBuilderNotice] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!session) return;

      try {
        setLoading(true);
        const { data: profileData, error } = await supabase
          .from("user")
          .select("questionnaire_answers, user_profile_onboarding_complete")
          .eq("id", session.user.id)
          .single();

        if (error) throw error;
        setUserProfile(profileData);
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [session]);

  const handleUploadResume = () => {
    setBuilderNotice(null);
    navigate("/dashboard/resume-analyzer");
  };

  const handleBuildFromScratch = () => {
    if (!userProfile?.questionnaire_answered) {
      setBuilderNotice("Complete your profile first to unlock resume builder when it launches.");
      return;
    }

    setBuilderNotice("Build from Scratch is coming soon.");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      <main className="w-full overflow-auto no-scrollbar">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-20">
        {/* Title Section */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3">
            Resume Evaluation
          </h1>
          <p className="text-lg text-muted-foreground">
            Get instant feedback or create a new resume with AI assistance tailored to your career goals.
          </p>
        </div>

        {/* AI Career Guide Callout */}
        <div className="mb-10 bg-primary/5 border border-primary/20 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-primary uppercase tracking-wide mb-1">
                AI Career Guide
              </h3>
              <p className="text-sm text-foreground">
                Don't have a resume? Let's build one together based on your target job! I can analyze job descriptions to tailor your experience perfectly.
              </p>
            </div>
          </div>
        </div>

        {/* Choose How to Start */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Choose how to start
          </h2>
          <p className="text-muted-foreground">
            Upload your existing document or let our AI guide you step-by-step.
          </p>
        </div>

        {builderNotice && (
          <Alert className="mb-6 border-primary/20 bg-primary/5 text-foreground">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertDescription>{builderNotice}</AlertDescription>
          </Alert>
        )}

        {/* Two Options Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* Upload Your Resume */}
          <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-colors">
            <div className="p-6 space-y-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Upload Your Resume
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Upload your PDF or DOCX file to get a detailed evaluation score and improvement suggestions.
                </p>
              </div>
              
              <Button
                onClick={handleUploadResume}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Resume
              </Button>
            </div>
          </div>

          {/* Build from Scratch */}
          <div className="bg-card border-2 border-primary/30 rounded-xl overflow-hidden relative">
            <div className="absolute top-4 right-4">
              <span className="inline-flex items-center px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-medium text-amber-600 dark:text-amber-400">
                Coming Soon
              </span>
            </div>
            <div className="p-6 space-y-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Build from Scratch
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Create a professional resume tailored to your industry using our AI builder. Complete your profile first so we can use your details when this feature is ready.
                </p>
              </div>
              
              <Button
                onClick={handleBuildFromScratch}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Build from Scratch
              </Button>
            </div>
          </div>
        </div>

        {/* Privacy Guaranteed */}
        <div className="bg-muted/50 border border-border rounded-xl p-6">
          <h3 className="text-lg font-bold text-foreground mb-4">
            Privacy Guaranteed
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Your resume data is private and only used to generate insights. We do not share your personal information.
          </p>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-emerald-500/10 rounded-full flex items-center justify-center">
                <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                Encrypted Upload
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-emerald-500/10 rounded-full flex items-center justify-center">
                <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                GDPR Compliant
              </span>
            </div>
          </div>
        </div>

        </div>
      </main>
    </div>
  );
}

export default HomePage;
