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
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  
  // Speech API refs
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  
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
      setIsListening(false);
    };
    
    recognitionRef.current.onend = () => {
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
    if (recognitionRef.current && !isListening) {
      setCurrentAnswer("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  };
  
  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
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
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(""));
      setCurrentQuestionIndex(0);
      setActiveRole(finalRole); // Store the role being used
      setSessionState("interview");
      
      // Speak first question
      await speakText(data.questions[0].question);
      
    } catch (err) {
      console.error("Error generating questions:", err);
      setError(err.message);
      setSessionState("setup");
    }
  };
  
  // Submit current answer and move to next question
  const submitAnswer = async () => {
    stopListening();
    
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
      await speakText(questions[nextIndex].question);
    } else {
      // All questions answered - generate feedback
      await generateFeedback(newAnswers);
    }
  };
  
  // Skip current question
  const skipQuestion = async () => {
    stopListening();
    
    // Save empty answer
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = currentAnswer || "[Skipped]";
    setAnswers(newAnswers);
    
    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setCurrentAnswer("");
      await speakText(questions[nextIndex].question);
    } else {
      await generateFeedback(newAnswers);
    }
  };
  
  // Go to previous question
  const goToPreviousQuestion = async () => {
    stopListening();
    
    if (currentQuestionIndex > 0) {
      // Save current answer before going back
      const newAnswers = [...answers];
      newAnswers[currentQuestionIndex] = currentAnswer;
      setAnswers(newAnswers);
      
      // Move to previous question
      const prevIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(prevIndex);
      setCurrentAnswer(answers[prevIndex] || "");
      
      // Optionally speak the previous question
      await speakText(questions[prevIndex].question);
    }
  };
  
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
    setFeedback("");
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
      setFeedback(data.feedback);
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
    setFeedback("");
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
              Start Interview (15 Questions)
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
    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
    
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Progress bar */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span className="text-sm text-muted-foreground">{currentQuestion.category}</span>
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
              {currentQuestion.follow_up_hint && (
                <p className="text-sm text-muted-foreground">{currentQuestion.follow_up_hint}</p>
              )}
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
            
            {currentQuestionIndex > 0 && (
              <button
                onClick={goToPreviousQuestion}
                className="px-6 py-3 bg-muted text-muted-foreground rounded-lg font-medium hover:bg-muted/80 transition-colors flex items-center gap-2"
              >
                ← Previous
              </button>
            )}
            
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
              Skip
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
    // Parse metrics from feedback
    const parseMetrics = (feedbackText) => {
      const metrics = {
        totalQuestions: 0,
        answered: 0,
        skipped: 0,
        qualityScore: 0,
        technicalCompetency: 'N/A',
        communicationSkills: 'N/A'
      };
      
      if (!feedbackText) return metrics;
      
      // Extract total questions
      const totalMatch = feedbackText.match(/Total Questions:\*\*\s*(\d+)/i);
      if (totalMatch) metrics.totalQuestions = parseInt(totalMatch[1]);
      
      // Extract answered
      const answeredMatch = feedbackText.match(/Questions Answered:\*\*\s*(\d+)/i);
      if (answeredMatch) metrics.answered = parseInt(answeredMatch[1]);
      
      // Extract skipped
      const skippedMatch = feedbackText.match(/Questions Skipped:\*\*\s*(\d+)/i);
      if (skippedMatch) metrics.skipped = parseInt(skippedMatch[1]);
      
      // Extract quality score
      const qualityMatch = feedbackText.match(/Answer Quality Score:\*\*\s*(\d+)/i);
      if (qualityMatch) metrics.qualityScore = parseInt(qualityMatch[1]);
      
      // Extract technical competency
      const techMatch = feedbackText.match(/Technical Competency:\*\*\s*(Strong|Moderate|Weak)/i);
      if (techMatch) metrics.technicalCompetency = techMatch[1];
      
      // Extract communication skills
      const commMatch = feedbackText.match(/Communication Skills:\*\*\s*(Strong|Moderate|Weak)/i);
      if (commMatch) metrics.communicationSkills = commMatch[1];
      
      return metrics;
    };
    
    const metrics = parseMetrics(feedback);
    
    // Helper to get color for skill level
    const getSkillColor = (level) => {
      switch(level.toLowerCase()) {
        case 'strong': return 'bg-gradient-to-r from-green-600 to-green-500 text-white';
        case 'moderate': return 'bg-gradient-to-r from-yellow-500 to-yellow-400 text-white';
        case 'weak': return 'bg-gradient-to-r from-red-600 to-red-500 text-white';
        default: return 'bg-gradient-to-r from-gray-600 to-gray-500 text-white';
      }
    };
    
    // Helper to get quality score color
    const getQualityColor = (score) => {
      if (score >= 80) return 'bg-gradient-to-r from-green-600 to-green-500';
      if (score >= 60) return 'bg-gradient-to-r from-yellow-500 to-yellow-400';
      if (score >= 40) return 'bg-gradient-to-r from-orange-500 to-orange-400';
      return 'bg-gradient-to-r from-red-600 to-red-500';
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
              
              {/* Answer Quality Score */}
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
                <h4 className="font-semibold text-sm text-muted-foreground mb-4 uppercase tracking-wide">Answer Quality Score</h4>
                <div className="flex flex-col items-center justify-center">
                  <div className="relative mb-4">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="12"
                        className="text-muted/30"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="12"
                        className={metrics.qualityScore >= 80 ? 'text-green-500' : metrics.qualityScore >= 60 ? 'text-yellow-500' : metrics.qualityScore >= 40 ? 'text-orange-500' : 'text-red-500'}
                        strokeDasharray={`${(metrics.qualityScore / 100) * 351.86} 351.86`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-bold text-foreground">{metrics.qualityScore}</span>
                      <span className="text-xs text-muted-foreground font-medium">out of 100</span>
                    </div>
                  </div>
                  <div className="w-full space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Poor</span>
                      <span>Excellent</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden shadow-inner">
                      <div 
                        className={`h-full transition-all duration-1000 ease-out ${getQualityColor(metrics.qualityScore)}`}
                        style={{ width: `${metrics.qualityScore}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Technical Competency */}
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
                <h4 className="font-semibold text-sm text-muted-foreground mb-4 uppercase tracking-wide">Technical Competency</h4>
                <div className="flex items-center justify-center h-24">
                  <div className={`px-10 py-4 rounded-xl font-bold text-xl shadow-lg transform hover:scale-105 transition-transform ${getSkillColor(metrics.technicalCompetency)}`}>
                    {metrics.technicalCompetency.toUpperCase()}
                  </div>
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${metrics.technicalCompetency.toLowerCase() === 'weak' ? 'bg-red-600' : 'bg-muted'}`}></div>
                  <div className={`w-2 h-2 rounded-full ${metrics.technicalCompetency.toLowerCase() === 'moderate' ? 'bg-yellow-500' : 'bg-muted'}`}></div>
                  <div className={`w-2 h-2 rounded-full ${metrics.technicalCompetency.toLowerCase() === 'strong' ? 'bg-green-600' : 'bg-muted'}`}></div>
                </div>
              </div>
              
              {/* Communication Skills */}
              <div className="bg-gradient-to-br from-background to-muted/30 rounded-lg p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
                <h4 className="font-semibold text-sm text-muted-foreground mb-4 uppercase tracking-wide">Communication Skills</h4>
                <div className="flex items-center justify-center h-24">
                  <div className={`px-10 py-4 rounded-xl font-bold text-xl shadow-lg transform hover:scale-105 transition-transform ${getSkillColor(metrics.communicationSkills)}`}>
                    {metrics.communicationSkills.toUpperCase()}
                  </div>
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${metrics.communicationSkills.toLowerCase() === 'weak' ? 'bg-red-600' : 'bg-muted'}`}></div>
                  <div className={`w-2 h-2 rounded-full ${metrics.communicationSkills.toLowerCase() === 'moderate' ? 'bg-yellow-500' : 'bg-muted'}`}></div>
                  <div className={`w-2 h-2 rounded-full ${metrics.communicationSkills.toLowerCase() === 'strong' ? 'bg-green-600' : 'bg-muted'}`}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Detailed Feedback Report */}
        <div className="bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 px-6 py-4 border-b border-border">
            <h3 className="text-xl font-bold flex items-center gap-3">
              <FileText className="w-6 h-6 text-primary" />
              <span>Detailed Feedback Report</span>
            </h3>
          </div>
          <div className="p-8">
            <div 
              className="prose prose-sm max-w-none dark:prose-invert markdown-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(feedback) }}
            />
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}

export default MockInterview;
