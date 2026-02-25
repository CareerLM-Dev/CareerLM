import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { supabase } from "../api/supabaseClient";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Alert, AlertDescription } from "../components/ui/alert";
import { AlertCircle, ArrowLeft, ArrowRight, Briefcase, Check, GraduationCap, SkipForward } from "lucide-react";


function Onboarding() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { session } = useUser();
  // phase: "loading" | "status" | "questionnaire" | "professional"
  // "status"       — Student vs Professional choice (OAuth users only)
  // "questionnaire" — 4-step questionnaire (students)
  // "professional" — company name entry (professionals via OAuth)
  const [phase, setPhase] = useState("loading");
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentCompany, setCurrentCompany] = useState("");

  // Determine starting phase:
  // OAuth new users → "status" choice (Student / Professional)
  // Email students  → "questionnaire" (4-step)
  // Email professionals → "professional" (company entry — edge case fallback;
  //   normally professionals have questionnaire_answered:true and never reach here)
  useEffect(() => {
    if (!session) return;
    const provider = session.user.app_metadata?.provider;
    const isOAuth = provider && provider !== "email";

    if (isOAuth) {
      setPhase("status");
    } else {
      // Email user — look up their status in the DB to decide the phase.
      supabase
        .from("user")
        .select("status")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          setPhase(data?.status === "professional" ? "professional" : "questionnaire");
        });
    }
  }, [session]);

  // Question responses - now arrays for multiple selections
  const [answers, setAnswers] = useState({
    target_role: [],
    primary_goal: [],
    learning_preference: [],
    time_commitment: [],
    year_of_study: [],
  });

  const questions = [
    {
      step: 1,
      title: "What's Your Target Role?",
      description: "Select the career path you're most interested in pursuing",
      field: "target_role",
      type: "select",
      options: [
        { value: "software_engineer", label: "Software Engineer" },
        { value: "data_scientist", label: "Data Scientist" },
        { value: "data_analyst", label: "Data Analyst" },
        { value: "devops_engineer", label: "DevOps Engineer" },
        { value: "full_stack_developer", label: "Full Stack Developer" },
        { value: "ml_engineer", label: "Machine Learning Engineer" },
        { value: "product_manager", label: "Product Manager" },
        { value: "ux_ui_designer", label: "UI/UX Designer" },
        { value: "cloud_architect", label: "Cloud Architect" },
        { value: "cybersecurity_analyst", label: "Cybersecurity Analyst" },
        { value: "business_analyst", label: "Business Analyst" },
        { value: "mobile_developer", label: "Mobile Developer" },
        { value: "undecided", label: "I'm Still Undecided" },
      ],
    },
    {
      step: 2,
      title: "What's Your Primary Goal?",
      description: "Help us understand what you want to achieve",
      field: "primary_goal",
      type: "select",
      options: [
        { value: "get_first_job", label: "Get My First Tech Job" },
        { value: "switch_careers", label: "Switch to a New Career" },
        { value: "upskill", label: "Upskill in Current Role" },
        { value: "freelance", label: "Start Freelancing" },
        { value: "build_projects", label: "Build Own Projects" },
        { value: "interview_prep", label: "Prepare for Interviews" },
        { value: "learn_technology", label: "Learn a Specific Technology" },
      ],
    },
    {
      step: 3,
      title: "How Do You Prefer to Learn?",
      description: "Choose your learning style",
      field: "learning_preference",
      type: "select",
      options: [
        {
          value: "video_tutorials",
          label: "Video Tutorials & Courses",
        },
        { value: "hands_on", label: "Hands-On Projects & Coding" },
        { value: "reading", label: "Reading & Documentation" },
        { value: "interactive", label: "Interactive Platforms" },
        { value: "mentor", label: "Mentorship & Guidance" },
        { value: "mixed", label: "Mix of Everything" },
      ],
    },
    {
      step: 4,
      title: "How Much Time Can You Dedicate?",
      description: "Be realistic about your availability",
      field: "time_commitment",
      type: "select",
      options: [
        { value: "5_hours_week", label: "5 hours/week" },
        { value: "10_hours_week", label: "10 hours/week" },
        { value: "20_hours_week", label: "20 hours/week" },
        { value: "30_hours_week", label: "30+ hours/week (Full-time)" },
        { value: "flexible", label: "Flexible/As Available" },
      ],
    },
    {
      step: 5,
      title: "What Year of Study Are You In?",
      description: "This helps us tailor resume advice for your stage (e.g. fresher vs final year)",
      field: "year_of_study",
      type: "select",
      options: [
        { value: "1", label: "Year 1 / Freshman" },
        { value: "2", label: "Year 2 / Sophomore" },
        { value: "3", label: "Year 3 / Junior" },
        { value: "4", label: "Year 4 / Senior (Final Year)" },
        { value: "postgrad", label: "Postgraduate / Masters" },
        { value: "recent_grad", label: "Recent Graduate" },
      ],
    },
  ];

  const currentQuestion = questions.find((q) => q.step === currentStep);

  const handleAnswerChange = (value) => {
    const currentValues = answers[currentQuestion.field];
    const isSelected = currentValues.includes(value);

    setAnswers({
      ...answers,
      [currentQuestion.field]: isSelected
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value],
    });
  };

  // ── Status selection (OAuth users only) ──────────────────────────────────
  const handleStatusSelect = (choice) => {
    setError(null);
    setPhase(choice === "student" ? "questionnaire" : "professional");
  };

  // ── Professional path: save company + mark onboarding done ───────────────
  const handleProfessionalComplete = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: dbError } = await supabase
        .from("user")
        .update({
          status: "professional",
          current_company: currentCompany.trim() || null,
          questionnaire_answered: true,
        })
        .eq("id", userId);

      if (dbError) throw dbError;
      navigate("/dashboard");
    } catch (err) {
      console.error("Professional setup error:", err);
      setError("Failed to save your profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    setError(null);
    try {
      // Call backend endpoint to skip questionnaire
      const response = await fetch(
        `http://localhost:8000/api/v1/onboarding/skip-questionnaire?user_id=${userId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to skip questionnaire");
      }

      // Skip goes directly to dashboard (user opted out of the whole questionnaire)
      navigate("/dashboard");
    } catch (err) {
      console.error("Skip error:", err);
      setError("Failed to skip. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (answers[currentQuestion.field].length === 0) {
      setError("Please select at least one answer before continuing");
      return;
    }
    setError(null);
    setCurrentStep(currentStep + 1);
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    setError(null);

    try {
      // Call backend endpoint to save questionnaire
      const response = await fetch(
        `http://localhost:8000/api/v1/onboarding/save-questionnaire?user_id=${userId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            target_role: answers.target_role,
            primary_goal: answers.primary_goal,
            learning_preference: answers.learning_preference,
            time_commitment: answers.time_commitment,
            year_of_study: answers.year_of_study[0] || null,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to save questionnaire");
      }

      // Signal ResumeUploadPage that we're arriving from the onboarding flow
      sessionStorage.setItem("fromOnboarding", "true");
      navigate("/upload-resume");
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save your answers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Phase renders ─────────────────────────────────────────────────────────

  // Spinner while session loads and we determine OAuth vs email
  if (phase === "loading") {
    return (
      <div className="h-full flex items-center justify-center bg-primary">
        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Student vs Professional — shown only to new OAuth users
  if (phase === "status") {
    return (
      <div className="h-full overflow-y-auto no-scrollbar bg-primary">
        <div className="min-h-full flex items-center justify-center py-4 px-5">
        <div className="w-full max-w-lg">
          <Card className="bg-card/95 backdrop-blur-xl border-border/20 shadow-2xl">
            <CardHeader className="text-center space-y-1 pt-5 pb-3">
              <CardTitle className="text-2xl font-bold text-primary">
                Welcome to CareerLM!
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Tell us a bit about yourself to personalise your experience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pb-6">
              <p className="text-center text-sm font-medium text-muted-foreground">I am a&hellip;</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => handleStatusSelect("student")}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-border bg-background p-5 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <GraduationCap className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground text-lg">Student</p>
                    <p className="text-sm text-muted-foreground mt-1">Learning &amp; breaking into tech</p>
                  </div>
                </button>
                <button
                  onClick={() => handleStatusSelect("professional")}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-border bg-background p-5 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <Briefcase className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground text-lg">Professional</p>
                    <p className="text-sm text-muted-foreground mt-1">Already working in the industry</p>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    );
  }

  // Professional path: company name entry
  if (phase === "professional") {
    return (
      <div className="h-full overflow-y-auto no-scrollbar bg-primary">
        <div className="min-h-full flex items-center justify-center py-4 px-5">
        <div className="w-full max-w-md">
          <Card className="bg-card/95 backdrop-blur-xl border-border/20 shadow-2xl">
            <CardHeader className="text-center space-y-1 pt-5 pb-3">
              <CardTitle className="text-2xl font-bold text-primary">
                Your Company
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Where are you currently working? (optional)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="company" className="text-sm font-medium">
                  Current Company
                </Label>
                <Input
                  id="company"
                  type="text"
                  placeholder="e.g. Google, Microsoft, a startup…"
                  value={currentCompany}
                  onChange={(e) => setCurrentCompany(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleProfessionalComplete(); }}
                />
              </div>
              {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-2 border-t border-border pt-4">
              <Button
                onClick={handleProfessionalComplete}
                disabled={loading}
                className="w-full gap-2 shadow-md shadow-primary/30"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Continue to Dashboard
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={handleProfessionalComplete}
                disabled={loading}
                className="w-full text-muted-foreground hover:text-foreground gap-2"
              >
                <SkipForward className="h-4 w-4" />
                Skip for Now
              </Button>
            </CardFooter>
          </Card>
        </div>
        </div>
      </div>
    );
  }

  // Questionnaire (student path — email students and OAuth students both land here)
  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-primary">
      <div className="min-h-full flex items-center justify-center py-4 px-5">
      <div className="w-full max-w-xl">
        <Card className="bg-card/95 backdrop-blur-xl border-border/20 shadow-2xl">
          {/* Header */}
          <CardHeader className="text-center space-y-1 pt-5 pb-2">
            <CardTitle className="text-2xl font-bold text-primary">
              Let's Get to Know You!
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Just a few quick questions to personalize your learning experience
            </CardDescription>

            {/* Progress Bar */}
            <div className="pt-1 space-y-1">
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(currentStep / 5) * 100}%` }}
              />
            </div>
              <p className="text-sm text-muted-foreground">
                Question {currentStep} of 5
              </p>
            </div>
          </CardHeader>

          {/* Question Content */}
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">
                {currentQuestion.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {currentQuestion.description}
              </p>
            </div>

            {/* Options */}
            <div className="grid gap-1.5">
              {currentQuestion.options.map((option) => {
                const isChecked = answers[currentQuestion.field].includes(
                  option.value,
                );
                return (
                  <label
                    key={option.value}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-all duration-200 hover:shadow-md ${
                      isChecked
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-background hover:border-primary/40 hover:bg-accent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name={currentQuestion.field}
                      value={option.value}
                      checked={isChecked}
                      onChange={(e) => handleAnswerChange(e.target.value)}
                      className="sr-only"
                    />
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors flex-shrink-0 ${
                        isChecked
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isChecked && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Error Message */}
            {error && (
              <Alert
                variant="destructive"
                className="animate-in fade-in slide-in-from-top-2 duration-300"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          {/* Navigation Buttons */}
          <CardFooter className="flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex w-full items-center justify-between gap-3">
              {currentStep > 1 ? (
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  disabled={loading}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Previous
                </Button>
              ) : (
                <div />
              )}

              {currentStep < 5 ? (
                <Button
                  onClick={handleNext}
                  disabled={loading}
                  className="gap-2 shadow-md shadow-primary/30"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleComplete}
                  disabled={loading}
                  className="gap-2 shadow-md shadow-primary/30"
                >
                  {loading ? (
                    <>
                      <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Create My Profile
                    </>
                  )}
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={loading}
              className="w-full text-muted-foreground hover:text-foreground gap-2"
            >
              <SkipForward className="h-4 w-4" />
              {currentStep === 5 ? "Skip Questionnaire" : "Skip for Now"}
            </Button>
          </CardFooter>
        </Card>
      </div>
      </div>
    </div>
  );
}

export default Onboarding;
