// src/components/MockInterview.js
import React, { useState, useEffect, useRef } from "react";
import { 
  MessageSquare, 
  Mic, 
  MicOff, 
  Volume2, 
  PlayCircle,
  CheckCircle,
  AlertCircle,
  FileText,
  Loader2,
  XCircle
} from "lucide-react";
import { supabase } from "../api/supabaseClient";

const ROLE_LABELS = {
  "software_engineer": "Software Engineer",
  "data_scientist": "Data Scientist",
  "data_analyst": "Data Analyst",
  "devops_engineer": "DevOps Engineer",
  "full_stack_developer": "Full Stack Developer",
  "ml_engineer": "Machine Learning Engineer",
  "product_manager": "Product Manager",
  "ux_ui_designer": "UI/UX Designer",
  "cloud_architect": "Cloud Architect",
  "cybersecurity_analyst": "Cybersecurity Analyst",
  "business_analyst": "Business Analyst",
  "mobile_developer": "Mobile Developer",
  "undecided": "Undecided"
};

// Markdown renderer
const renderMarkdown = (text) => {
  if (!text) return "";
  
  let html = text
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-6 mb-3">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-6 mb-4">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    // Bullet points
    .replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>')
    .replace(/^• (.*$)/gim, '<li class="ml-4">$1</li>')
    // Horizontal rule
    .replace(/^---$/gim, '<hr class="my-6 border-border" />')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/\n/g, '<br />');
  
  // Wrap in paragraph tags
  html = '<p class="mb-4">' + html + '</p>';
  
  // Wrap consecutive list items in ul tags
  html = html.replace(/(<li class="ml-4">.*?<\/li>)+/gs, '<ul class="list-disc mb-4">$&</ul>');
  
  return html;
};

function MockInterview({ resumeData }) {
  // State management
  const [sessionState, setSessionState] = useState("setup"); // setup, loading, interview, completed
  const [targetRole, setTargetRole] = useState("");
  const [selectedRoleOption, setSelectedRoleOption] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [savedRoles, setSavedRoles] = useState([]);
  const [activeRole, setActiveRole] = useState(""); // Role used in current interview session
  const [difficulty, setDifficulty] = useState("medium");
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [questionTimes, setQuestionTimes] = useState([]);
  const [currentQuestionElapsed, setCurrentQuestionElapsed] = useState(0);
  const [error, setError] = useState("");
  
  // Speech API refs
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const questionStartRef = useRef(null);
  const questionTimesRef = useRef([]);
  
  // Fetch user's saved roles on mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const response = await fetch("http://localhost:8000/api/v1/user/profile-details", {
          headers: {
            "Authorization": `Bearer ${session.access_token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const questionnaire = data.data?.questionnaire_answers;
          if (questionnaire?.target_role && Array.isArray(questionnaire.target_role)) {
            setSavedRoles(questionnaire.target_role);
            // Pre-select first role if available
            if (questionnaire.target_role.length > 0) {
              const firstRole = questionnaire.target_role[0];
              setSelectedRoleOption(firstRole);
              setTargetRole(ROLE_LABELS[firstRole] || firstRole);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    };
    
    fetchUserProfile();
  }, []);
  
  // Initialize Speech Recognition
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) {
      setError("Speech recognition is not supported in this browser. Please use Chrome.");
      return;
    }
    
    const SpeechRecognition = window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    
    recognitionRef.current.onresult = (event) => {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        }
      }
      
      setCurrentAnswer(prev => prev + finalTranscript);
    };
    
    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      // Always reset listening state on error to prevent state mismatch
      setIsListening(false);
      
      // Show user-friendly error messages for common errors
      if (event.error === 'no-speech') {
        setError("No speech detected. Please try again.");
      } else if (event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`);
      }
    };
    
    recognitionRef.current.onend = () => {
      // Always ensure listening state is reset when recognition ends
      setIsListening(false);
    };
    
    const synth = synthRef.current;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synth) {
        synth.cancel();
      }
    };
  }, []);

  // Load saved answer when question index changes
  useEffect(() => {
    if (sessionState === "interview" && answers.length > 0) {
      // Load the saved answer for this question
      setCurrentAnswer(answers[currentQuestionIndex] || "");
    }
  }, [currentQuestionIndex, sessionState, answers]);

  useEffect(() => {
    if (sessionState !== "interview" || !questions.length) return;

    questionStartRef.current = Date.now();
    setCurrentQuestionElapsed(0);

    const timer = setInterval(() => {
      if (!questionStartRef.current) return;
      const elapsed = Math.floor((Date.now() - questionStartRef.current) / 1000);
      setCurrentQuestionElapsed(Math.max(0, elapsed));
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionState, currentQuestionIndex, questions.length]);

  const formatDuration = (seconds) => {
    const totalSeconds = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const captureCurrentQuestionTime = () => {
    if (sessionState !== "interview" || !questions.length) {
      return questionTimesRef.current;
    }

    if (!questionStartRef.current) {
      questionStartRef.current = Date.now();
      return questionTimesRef.current;
    }

    const elapsed = Math.max(0, Math.floor((Date.now() - questionStartRef.current) / 1000));
    const updatedTimes = [...questionTimesRef.current];
    updatedTimes[currentQuestionIndex] = (updatedTimes[currentQuestionIndex] || 0) + elapsed;

    questionTimesRef.current = updatedTimes;
    setQuestionTimes(updatedTimes);
    questionStartRef.current = Date.now();
    setCurrentQuestionElapsed(0);

    return updatedTimes;
  };
  
  // Speech synthesis function
  const speakText = (text) => {
    return new Promise((resolve) => {
      if (synthRef.current.speaking) {
        synthRef.current.cancel();
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };
      
      synthRef.current.speak(utterance);
    });
  };
  
  // Start listening to user
  const startListening = () => {
    if (!recognitionRef.current) return;
    
    try {
      // Check if already listening by checking internal state
      if (isListening) {
        console.warn("Speech recognition already running");
        return;
      }
      
      recognitionRef.current.start();
      setIsListening(true);
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      // If error occurs, ensure state is reset
      setIsListening(false);
    }
  };
  
  // Stop listening
  const stopListening = () => {
    if (!recognitionRef.current) return;
    
    try {
      if (isListening) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    } catch (error) {
      console.error("Error stopping speech recognition:", error);
      setIsListening(false);
    }
  };
  
  // Generate questions from backend
  const generateQuestions = async () => {
    // Determine final target role
    const finalRole = selectedRoleOption === "other" ? customRole : targetRole;
    
    if (!finalRole.trim()) {
      setError("Please select or enter a target role");
      return;
    }
    
    setSessionState("loading");
    setError("");
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      const response = await fetch("http://localhost:8000/api/v1/interview/generate-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          user_id: session.user.id,
          target_role: finalRole,
          difficulty: difficulty
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to generate questions");
      }
      
      const data = await response.json();
      const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
      const sanitizedQuestions = rawQuestions
        .filter((item) => item && typeof item === "object")
        .map((item, index) => ({
          id: typeof item.id === "number" ? item.id : index + 1,
          category: typeof item.category === "string" && item.category.trim() ? item.category : "General",
          question: typeof item.question === "string" && item.question.trim() ? item.question : "Please describe your relevant experience for this role."
        }));

      if (!sanitizedQuestions.length) {
        throw new Error("No valid questions returned. Please try again.");
      }

      setQuestions(sanitizedQuestions);
      setAnswers(new Array(sanitizedQuestions.length).fill(""));
      const initialQuestionTimes = new Array(sanitizedQuestions.length).fill(0);
      setQuestionTimes(initialQuestionTimes);
      questionTimesRef.current = initialQuestionTimes;
      questionStartRef.current = Date.now();
      setCurrentQuestionIndex(0);
      setActiveRole(finalRole); // Store the role being used
      setSessionState("interview");
      
      // Speak first question
      await speakText(sanitizedQuestions[0].question);
      
    } catch (err) {
      console.error("Error generating questions:", err);
      setError(err.message);
      setSessionState("setup");
    }
  };
  
  // Submit current answer and move to next question
  const submitAnswer = async () => {
    stopListening();
    captureCurrentQuestionTime();
    
    // Save current answer
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = currentAnswer;
    setAnswers(newAnswers);
    
    // Check if more questions remain
    if (currentQuestionIndex < questions.length - 1) {
      // Move to next question
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setCurrentAnswer("");
      
      // Speak next question
      if (questions[nextIndex]?.question) {
        await speakText(questions[nextIndex].question);
      }
    } else {
      // All questions answered - generate feedback
      await generateFeedback(newAnswers);
    }
  };
  
  // Skip current question
  const skipQuestion = async () => {
    stopListening();
    captureCurrentQuestionTime();
    
    // Save empty answer
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = currentAnswer || "[Skipped]";
    setAnswers(newAnswers);
    
    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setCurrentAnswer("");
      if (questions[nextIndex]?.question) {
        await speakText(questions[nextIndex].question);
      }
    } else {
      await generateFeedback(newAnswers);
    }
  };
  
  // Go to previous question
  // const goToPreviousQuestion = async () => {
  //   stopListening();
  //   captureCurrentQuestionTime();
    
  //   if (currentQuestionIndex > 0) {
  //     // Save current answer before going back
  //     const newAnswers = [...answers];
  //     newAnswers[currentQuestionIndex] = currentAnswer;
  //     setAnswers(newAnswers);
      
  //     // Move to previous question
  //     const prevIndex = currentQuestionIndex - 1;
  //     setCurrentQuestionIndex(prevIndex);
  //     setCurrentAnswer(answers[prevIndex] || "");
      
  //     // Optionally speak the previous question
  //     if (questions[prevIndex]?.question) {
  //       await speakText(questions[prevIndex].question);
  //     }
  //   }
  // };
  
  // Quit interview and return to setup
  const quitInterview = () => {
    stopListening();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSessionState("setup");
    setQuestions([]);
    setAnswers([]);
    setCurrentQuestionIndex(0);
    setCurrentAnswer("");
    setFeedback(null);
    setQuestionTimes([]);
    questionTimesRef.current = [];
    questionStartRef.current = null;
    setCurrentQuestionElapsed(0);
    setError("");
  };
  
  // Generate feedback report
  const generateFeedback = async (finalAnswers) => {
    setSessionState("loading");
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      const response = await fetch("http://localhost:8000/api/v1/interview/generate-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          user_id: session.user.id,
          target_role: activeRole, // Use the stored active role
          questions: questions,
          answers: finalAnswers
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to generate feedback");
      }
      
      const data = await response.json();

      if (!data.feedback || (typeof data.feedback === 'object' && Object.keys(data.feedback).length === 0)) {
        throw new Error("Feedback report is empty. Please retry the interview feedback generation.");
      }

      setFeedback(typeof data.feedback === 'string' ? JSON.parse(data.feedback) : data.feedback);
      setSessionState("completed");
      
    } catch (err) {
      console.error("Error generating feedback:", err);
      setError(err.message);
      setSessionState("interview");
    }
  };
  
  // Restart interview
  const restartInterview = () => {
    setSessionState("setup");
    setTargetRole("");
    setSelectedRoleOption("");
    setCustomRole("");
    setActiveRole("");
    setDifficulty("medium");
    setQuestions([]);
    setAnswers([]);
    setCurrentQuestionIndex(0);
    setCurrentAnswer("");
    setFeedback(null);
    setQuestionTimes([]);
    questionTimesRef.current = [];
    questionStartRef.current = null;
    setCurrentQuestionElapsed(0);
    setError("");
    synthRef.current.cancel();
  };
  
  // ========== RENDER STATES ==========
  
  // Setup screen
  if (sessionState === "setup") {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="text-center mb-8">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Real-Time Mock Interview</h2>
            <p className="text-muted-foreground">
              Voice-powered AI interview with personalized feedback
            </p>
          </div>
          
          {resumeData && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Resume Loaded: {resumeData.filename}</span>
              </div>
            </div>
          )}
          
          {!resumeData && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">No resume found. Upload one first for better questions.</span>
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Target Job Role</label>
              {savedRoles.length > 0 ? (
                <>
                  <select
                    value={selectedRoleOption}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedRoleOption(value);
                      if (value === "other") {
                        setTargetRole("");
                      } else {
                        setTargetRole(ROLE_LABELS[value] || value);
                        setCustomRole("");
                      }
                    }}
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary mb-3"
                  >
                    <option value="" disabled>Select a role...</option>
                    {savedRoles.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role] || role}
                      </option>
                    ))}
                    <option value="other">Other (Custom Role)</option>
                  </select>
                  
                  {selectedRoleOption === "other" && (
                    <input
                      type="text"
                      value={customRole}
                      onChange={(e) => setCustomRole(e.target.value)}
                      placeholder="Enter your target role"
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-2">
                    Roles from your profile. Update them in <a href="/profile" className="text-primary hover:underline">Profile Settings</a>
                  </p>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g., Full Stack Developer, Data Scientist"
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Set your preferred roles in <a href="/profile" className="text-primary hover:underline">Profile Settings</a> for quick access
                  </p>
                </>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Difficulty Level</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setDifficulty("easy")}
                  className={`py-3 px-4 rounded-lg font-medium transition-all ${
                    difficulty === "easy"
                      ? "bg-green-500 text-white ring-2 ring-green-500 ring-offset-2"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Easy
                  <span className="block text-xs mt-1 opacity-80">Basic concepts</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDifficulty("medium")}
                  className={`py-3 px-4 rounded-lg font-medium transition-all ${
                    difficulty === "medium"
                      ? "bg-amber-500 text-white ring-2 ring-amber-500 ring-offset-2"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Medium
                  <span className="block text-xs mt-1 opacity-80">Standard questions</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDifficulty("hard")}
                  className={`py-3 px-4 rounded-lg font-medium transition-all ${
                    difficulty === "hard"
                      ? "bg-red-500 text-white ring-2 ring-red-500 ring-offset-2"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Hard
                  <span className="block text-xs mt-1 opacity-80">Advanced topics</span>
                </button>
              </div>
            </div>
            
            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}
            
            <button
              onClick={generateQuestions}
              disabled={selectedRoleOption === "other" ? !customRole.trim() : !targetRole.trim()}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <PlayCircle className="w-5 h-5" />
              Start Interview
            </button>
            
            <div className="text-xs text-muted-foreground text-center pt-2">
              <p>Free voice-powered AI - Real-time transcription - Detailed feedback report</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Loading screen
  if (sessionState === "loading") {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Processing...</h3>
          <p className="text-muted-foreground">
            {sessionState === "loading" && currentQuestionIndex === 0 
              ? "Generating personalized questions..." 
              : "Analyzing your responses and generating feedback..."}
          </p>
        </div>
      </div>
    );
  }
  
  // Interview screen
  if (sessionState === "interview") {
    const currentQuestion = questions[currentQuestionIndex] || {
      id: currentQuestionIndex + 1,
      category: "General",
      question: "Question is unavailable. Please go to the next question."
    };
    const questionCount = Math.max(questions.length, 1);
    const progress = ((currentQuestionIndex + 1) / questionCount) * 100;
    
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Progress bar */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span className="text-sm text-muted-foreground">{currentQuestion.category}</span>
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            Time on this question: {formatDuration(currentQuestionElapsed)}
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        
        {/* Question card */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="bg-primary/10 rounded-full p-3">
              <MessageSquare className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2">{currentQuestion.question}</h3>
            </div>
            <button
              onClick={() => speakText(currentQuestion.question)}
              disabled={isSpeaking}
              className="p-2 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
              title="Repeat question"
            >
              <Volume2 className={`w-5 h-5 text-primary ${isSpeaking ? 'animate-pulse' : ''}`} />
            </button>
          </div>
        </div>
        
        {/* Answer input */}
        <div className="bg-card border border-border rounded-lg p-6">
          <label className="block text-sm font-medium mb-2">Your Answer</label>
          <textarea
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            placeholder="Speak or type your answer here..."
            className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary min-h-[120px]"
          />
          
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={isListening ? stopListening : startListening}
              className={`flex-1 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                isListening 
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  Start Recording
                </>
              )}
            </button>
            
            {/* {currentQuestionIndex > 0 && (
              <button
                onClick={}
                disabled={answers[currentQuestionIndex - 1] && answers[currentQuestionIndex - 1] !== "[Skipped]"}
                className="px-6 py-3 bg-muted text-muted-foreground rounded-lg font-medium hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                title={answers[currentQuestionIndex - 1] && answers[currentQuestionIndex - 1] !== "[Skipped]" ? "Cannot go back to answered questions" : ""}
              >
                ← Previous
              </button>
            )} */}
            
            <button
              onClick={submitAnswer}
              disabled={!currentAnswer.trim()}
              className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish Interview'}
            </button>
            
            <button
              onClick={skipQuestion}
              className="px-6 py-3 bg-muted text-muted-foreground rounded-lg font-medium hover:bg-muted/80 transition-colors"
            >
              {currentQuestionIndex < questions.length - 1 ? 'Skip' : 'Skip & Submit'}
            </button>
          </div>
          
          {/* Quit Interview Button */}
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={quitInterview}
              className="w-full py-2 bg-destructive/10 text-destructive rounded-lg font-medium hover:bg-destructive/20 transition-colors flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Quit Interview
            </button>
          </div>
        </div>
        
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }
  
  // Completed screen with feedback
  if (sessionState === "completed") {
    // Parse metrics from feedback JSON
    const parseMetrics = (feedbackJson) => {
      const metrics = {
        totalQuestions: questions?.length || 0,
        answered: answers?.filter(a => a && a !== '[Skipped]').length || 0,
        skipped: answers?.filter(a => !a || a === '[Skipped]').length || 0,
        overallReadiness: 'N/A',
        confidenceTone: 'N/A',
        verbosity: 'N/A',
        averageTimeSeconds: 0
      };
      
      if (!feedbackJson || typeof feedbackJson !== 'object') return metrics;
      
      // Extract from new JSON structure
      metrics.overallReadiness = feedbackJson.overall_readiness || 'N/A';
      
      if (feedbackJson.quantitative_metrics) {
        metrics.confidenceTone = feedbackJson.quantitative_metrics.confidence_tone || 'N/A';
        metrics.verbosity = feedbackJson.quantitative_metrics.verbosity || 'N/A';
      }

      if ((questions?.length || 0) > 0) {
        const totalTime = (questionTimes || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
        metrics.averageTimeSeconds = Math.round(totalTime / questions.length);
      }
      
      return metrics;
    };
    
    const metrics = parseMetrics(feedback);
    
    // Helper to get color for readiness level
    const getReadinessColor = (level) => {
      if (!level) return 'bg-gradient-to-r from-gray-600 to-gray-500 text-white';
      switch(level.toLowerCase()) {
        case 'interview ready': return 'bg-gradient-to-r from-green-600 to-green-500 text-white';
        case 'nearly ready': return 'bg-gradient-to-r from-green-500 to-green-400 text-white';
        case 'needs practice': return 'bg-gradient-to-r from-yellow-500 to-yellow-400 text-white';
        case 'early stage': return 'bg-gradient-to-r from-blue-500 to-blue-400 text-white';
        default: return 'bg-gradient-to-r from-gray-600 to-gray-500 text-white';
      }
    };
    
    // Helper to get color for stage performance
    const getStageColor = (level) => {
      if (!level) return 'bg-gradient-to-r from-gray-600 to-gray-500 text-white';
      switch(level.toLowerCase()) {
        case 'strong': return 'bg-gradient-to-r from-green-600 to-green-500 text-white';
        case 'solid': return 'bg-gradient-to-r from-green-500 to-green-400 text-white';
        case 'growing': return 'bg-gradient-to-r from-yellow-500 to-yellow-400 text-white';
        case 'needs work': return 'bg-gradient-to-r from-blue-500 to-blue-400 text-white';
        default: return 'bg-gradient-to-r from-gray-600 to-gray-500 text-white';
      }
    };
    
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Success Header */}
        <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl p-8 text-center shadow-lg">
          <div className="bg-gradient-to-br from-green-500 to-green-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
            Interview Complete!
          </h2>
          <div className="flex items-center justify-center gap-6 mb-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Role:</span>
              <span className="font-semibold text-foreground px-3 py-1 bg-primary/10 rounded-full">{activeRole}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Difficulty:</span>
              <span className="font-semibold text-foreground px-3 py-1 bg-primary/10 rounded-full capitalize">{difficulty}</span>
            </div>
          </div>
          <button
            onClick={restartInterview}
            className="px-8 py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all hover:scale-105"
          >
            Start New Interview
          </button>
        </div>
        
        {/* Visual Metrics Dashboard */}
        {metrics.totalQuestions > 0 && (
          <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 px-6 py-4 border-b border-border">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <span className="text-3xl"></span>
                <span>Performance Metrics</span>
              </h3>
            </div>
            
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Questions Answered Chart */}
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
                <h4 className="font-semibold text-sm text-muted-foreground mb-4 uppercase tracking-wide">Questions Completion</h4>
                <div className="flex items-center justify-center gap-6">
                  {/* Pie Chart Visual */}
                  <div className="relative w-36 h-36">
                    <svg viewBox="0 0 100 100" className="transform -rotate-90 drop-shadow-md">
                      {/* Background circle */}
                      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="20" className="text-muted/30"/>
                      {/* Answered arc */}
                      <circle 
                        cx="50" 
                        cy="50" 
                        r="40" 
                        fill="none" 
                        strokeWidth="20"
                        className="text-green-500"
                        stroke="currentColor"
                        strokeDasharray={`${(metrics.answered / metrics.totalQuestions) * 251.2} 251.2`}
                        strokeLinecap="round"
                      />
                      {/* Skipped arc (if any) */}
                      {metrics.skipped > 0 && (
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="40" 
                          fill="none" 
                          strokeWidth="20"
                          className="text-red-500"
                          stroke="currentColor"
                          strokeDasharray={`${(metrics.skipped / metrics.totalQuestions) * 251.2} 251.2`}
                          strokeDashoffset={`-${(metrics.answered / metrics.totalQuestions) * 251.2}`}
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-foreground">{metrics.answered}</span>
                      <span className="text-sm text-muted-foreground">of {metrics.totalQuestions}</span>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 bg-green-500 rounded shadow-sm"></div>
                      <div>
                        <div className="text-sm font-semibold">Answered</div>
                        <div className="text-xs text-muted-foreground">{metrics.answered} questions</div>
                      </div>
                    </div>
                    {metrics.skipped > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 bg-red-500 rounded shadow-sm"></div>
                        <div>
                          <div className="text-sm font-semibold">Skipped</div>
                          <div className="text-xs text-muted-foreground">{metrics.skipped} questions</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Overall Readiness */}
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
                <h4 className="font-semibold text-sm text-muted-foreground mb-4 uppercase tracking-wide">Overall Readiness</h4>
                <div className="flex items-center justify-center h-24">
                  <div className={`px-10 py-4 rounded-xl font-bold text-xl shadow-lg transform hover:scale-105 transition-transform ${getReadinessColor(metrics.overallReadiness)}`}>
                    {metrics.overallReadiness.toUpperCase()}
                  </div>
                </div>
              </div>
              
              {/* Confidence & Communication */}
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
                <h4 className="font-semibold text-sm text-muted-foreground mb-4 uppercase tracking-wide">Confidence & Communication</h4>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Confidence Tone</div>
                    <div className="text-lg font-semibold">{metrics.confidenceTone}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Verbosity</div>
                    <div className="text-lg font-semibold">{metrics.verbosity}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Average Time / Question</div>
                    <div className="text-lg font-semibold">{formatDuration(metrics.averageTimeSeconds)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stage Performance Breakdown */}
        {feedback?.stage_performance && (
          <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 px-6 py-4 border-b border-border">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <span>Stage Performance</span>
              </h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-4 border border-border">
                <div className="text-xs text-muted-foreground mb-2">Resume Validation</div>
                <div className={`px-4 py-2 rounded-lg font-bold text-center ${getStageColor(feedback.stage_performance.resume_validation)}`}>
                  {feedback.stage_performance.resume_validation}
                </div>
              </div>
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-4 border border-border">
                <div className="text-xs text-muted-foreground mb-2">Project Deep Dive</div>
                <div className={`px-4 py-2 rounded-lg font-bold text-center ${getStageColor(feedback.stage_performance.project_deep_dive)}`}>
                  {feedback.stage_performance.project_deep_dive}
                </div>
              </div>
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-4 border border-border">
                <div className="text-xs text-muted-foreground mb-2">Core Technical</div>
                <div className={`px-4 py-2 rounded-lg font-bold text-center ${getStageColor(feedback.stage_performance.core_technical)}`}>
                  {feedback.stage_performance.core_technical}
                </div>
              </div>
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-4 border border-border">
                <div className="text-xs text-muted-foreground mb-2">Behavioral</div>
                <div className={`px-4 py-2 rounded-lg font-bold text-center ${getStageColor(feedback.stage_performance.behavioral)}`}>
                  {feedback.stage_performance.behavioral}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Executive Summary & Action Plan */}
        <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 px-6 py-4 border-b border-border">
            <h3 className="text-xl font-bold flex items-center gap-3">
              <FileText className="w-6 h-6 text-primary" />
              <span>Detailed Feedback</span>
            </h3>
          </div>
          <div className="p-8 space-y-6">
            {/* Executive Summary */}
            {feedback?.executive_summary && (
              <div>
                <h4 className="text-lg font-semibold mb-3 text-primary">Executive Summary</h4>
                <p className="text-foreground leading-relaxed">{feedback.executive_summary}</p>
              </div>
            )}
            
            {/* Action Plan */}
            {feedback?.action_plan && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {feedback.action_plan.stop_doing?.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <h5 className="font-semibold text-red-700 dark:text-red-400 mb-2">🛑 Stop Doing</h5>
                    <ul className="space-y-1">
                      {feedback.action_plan.stop_doing.map((item, idx) => (
                        <li key={idx} className="text-sm text-foreground">• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {feedback.action_plan.start_doing?.length > 0 && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <h5 className="font-semibold text-green-700 dark:text-green-400 mb-2">✅ Start Doing</h5>
                    <ul className="space-y-1">
                      {feedback.action_plan.start_doing.map((item, idx) => (
                        <li key={idx} className="text-sm text-foreground">• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {feedback.action_plan.study_focus?.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h5 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">📚 Study Focus</h5>
                    <ul className="space-y-1">
                      {feedback.action_plan.study_focus.map((item, idx) => (
                        <li key={idx} className="text-sm text-foreground">• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {feedback.action_plan.next_steps?.length > 0 && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                    <h5 className="font-semibold text-purple-700 dark:text-purple-400 mb-2">🎯 Next Steps</h5>
                    <ul className="space-y-1">
                      {feedback.action_plan.next_steps.map((item, idx) => (
                        <li key={idx} className="text-sm text-foreground">• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {/* Question Breakdown */}
            {feedback?.question_breakdown?.length > 0 && (
              <div className="mt-8">
                <h4 className="text-lg font-semibold mb-4 text-primary">Question-by-Question Breakdown</h4>
                <div className="space-y-4">
                  {feedback.question_breakdown.map((item, idx) => (
                    <div key={idx} className="bg-muted/50 border border-border rounded-lg p-4">
                      <div className="font-semibold text-sm text-primary mb-2">
                        Q{idx + 1}: {item.question}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        <strong>Your Answer:</strong> {item.user_answer_summary}
                      </div>
                      {item.improvement_needed && (
                        <div className="text-xs text-yellow-700 dark:text-yellow-400 mb-2">
                          <strong>Improvement Needed:</strong> {item.improvement_needed}
                        </div>
                      )}
                      <div className="text-xs text-green-700 dark:text-green-400">
                        <strong>Ideal Answer:</strong> {item.ideal_golden_answer}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}

export default MockInterview;
