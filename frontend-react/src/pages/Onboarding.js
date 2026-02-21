import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { AlertCircle, ArrowLeft, ArrowRight, Check, SkipForward } from "lucide-react";


function Onboarding() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Optional: Check if user has already completed questionnaire
  useEffect(() => {
    // This could be implemented if needed
    // For now, we'll just load the questionnaire
  }, [userId, navigate]);

  // Question responses - now arrays for multiple selections
  const [answers, setAnswers] = useState({
    target_role: [],
    primary_goal: [],
    learning_preference: [],
    time_commitment: [],
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
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to skip questionnaire");
      }

      // Redirect to resume upload
      navigate("/upload-resume");
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
          },
          body: JSON.stringify({
            target_role: answers.target_role,
            primary_goal: answers.primary_goal,
            learning_preference: answers.learning_preference,
            time_commitment: answers.time_commitment,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to save questionnaire");
      }

      // Redirect to resume upload
      navigate("/upload-resume");
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save your answers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-primary">
      <div className="w-full max-w-2xl">
        <Card className="bg-card/95 backdrop-blur-xl border-border/20 shadow-2xl transition-all duration-300">
          {/* Header */}
          <CardHeader className="text-center space-y-3">
            <CardTitle className="text-3xl font-bold text-primary">
              Let's Get to Know You!
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Just a few quick questions to personalize your learning experience
            </CardDescription>

            {/* Progress Bar */}
            <div className="pt-2 space-y-2">
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(currentStep / 4) * 100}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Question {currentStep} of 4
              </p>
            </div>
          </CardHeader>

          {/* Question Content */}
          <CardContent className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-foreground">
                {currentQuestion.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {currentQuestion.description}
              </p>
            </div>

            {/* Options */}
            <div className="grid gap-2">
              {currentQuestion.options.map((option) => {
                const isChecked = answers[currentQuestion.field].includes(
                  option.value,
                );
                return (
                  <label
                    key={option.value}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
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
          <CardFooter className="flex flex-col gap-3 border-t border-border pt-6">
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

              {currentStep < 4 ? (
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
              {currentStep === 4 ? "Skip Questionnaire" : "Skip for Now"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default Onboarding;
