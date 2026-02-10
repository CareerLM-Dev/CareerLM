import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./Onboarding.css";

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
          label: "📹 Video Tutorials & Courses",
        },
        { value: "hands_on", label: "💻 Hands-On Projects & Coding" },
        { value: "reading", label: "📚 Reading & Documentation" },
        { value: "interactive", label: "🎮 Interactive Platforms" },
        { value: "mentor", label: "👨‍🏫 Mentorship & Guidance" },
        { value: "mixed", label: "🔀 Mix of Everything" },
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
    <div className="onboarding-container">
      <div className="onboarding-card">
        {/* Header */}
        <div className="onboarding-header">
          <h1>Let's Get to Know You! 👋</h1>
          <p>
            Just a few quick questions to personalize your learning experience
          </p>

          {/* Progress Bar */}
          <div className="progress-bar-wrapper">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
            <span className="progress-text">Question {currentStep} of 4</span>
          </div>
        </div>

        {/* Question Content */}
        <div className="onboarding-content">
          <h2 className="question-title">{currentQuestion.title}</h2>
          <p className="question-description">{currentQuestion.description}</p>

          {/* Options */}
          <div className="options-wrapper">
            {currentQuestion.options.map((option) => (
              <label key={option.value} className="option-label">
                <input
                  type="checkbox"
                  name={currentQuestion.field}
                  value={option.value}
                  checked={answers[currentQuestion.field].includes(
                    option.value,
                  )}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  className="option-input"
                />
                <span className="option-text">{option.label}</span>
              </label>
            ))}
          </div>

          {/* Error Message */}
          {error && <div className="error-message">{error}</div>}
        </div>

        {/* Navigation Buttons */}
        <div className="onboarding-footer">
          <div className="button-group">
            {currentStep > 1 && (
              <button
                onClick={handlePrevious}
                className="btn btn-secondary"
                disabled={loading}
              >
                ← Previous
              </button>
            )}

            {currentStep < 4 && (
              <>
                <button
                  onClick={handleNext}
                  className="btn btn-primary"
                  disabled={loading}
                >
                  Next →
                </button>
                <button
                  onClick={handleSkip}
                  className="btn btn-ghost"
                  disabled={loading}
                >
                  Skip for Now
                </button>
              </>
            )}

            {currentStep === 4 && (
              <>
                <button
                  onClick={handleComplete}
                  className="btn btn-primary complete-btn"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Create My Profile"}
                </button>
                <button
                  onClick={handleSkip}
                  className="btn btn-ghost"
                  disabled={loading}
                >
                  Skip Questionnaire
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
