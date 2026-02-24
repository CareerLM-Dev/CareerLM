"""
State definition for Mock Interview agent workflow
Supports both question generation and feedback flows
"""

from typing import TypedDict, Optional, List, Dict, Any


class InterviewState(TypedDict, total=False):
    """
    State for mock interview generation and feedback workflow
    
    Sections:
    - Inputs: Data provided at workflow start
    - Context: Derived/transformed data during workflow
    - Outputs: Results after workflow completes
    - Control: Metadata for routing/error handling
    """
    
    # ===== INPUTS (Question Generation) =====
    resume_text: str
    resume_sections: Dict[str, str]
    target_role: str
    difficulty: str  # "easy", "medium", "hard"
    user_skills: Optional[List[str]]
    previous_questions: Optional[List[str]]  # Previously asked questions for this user/role
    
    # ===== INPUTS (Feedback Generation) =====
    questions: Optional[List[Dict[str, Any]]]  # List of question dicts with id, category, question, follow_up_hint
    answers: Optional[List[str]]  # Parallel list of answer texts
    
    # ===== DERIVED CONTEXT =====
    experience_excerpt: Optional[str]  # First 500 chars of experience section
    projects_excerpt: Optional[str]  # First 500 chars of projects section
    skills_excerpt: Optional[str]  # First 300 chars of skills section
    education_excerpt: Optional[str]  # First 300 chars of education section
    difficulty_desc: Optional[str]  # Guideline string for LLM
    question_distribution: Optional[Dict[str, Any]]  # {"total": 10, "breakdown": "..."}
    
    # ===== METRICS (Feedback) =====
    transcript: Optional[str]  # Built transcript of Q/A used by feedback node
    total_questions: Optional[int]
    answered_count: Optional[int]
    skipped_count: Optional[int]
    response_quality: Optional[Dict[str, Any]]  # Low-signal/gibberish quality indicators
    metrics: Optional[Dict[str, Any]]  # {"answer_quality_score": int, "technical_competency": str, ...}
    is_valid: Optional[bool]  # Validation flag for question generation
    validation_error: Optional[str]  # Validation error for retries/diagnostics
    
    # ===== OUTPUTS (Question Generation) =====
    questions_generated: Optional[List[Dict[str, Any]]]  # Output questions array
    
    # ===== OUTPUTS (Feedback Generation) =====
    feedback_json: Optional[Dict[str, Any]]  # Structured JSON feedback
    
    # ===== CONTROL / METADATA =====
    mode: Optional[str]  # "questions" or "feedback"
    error: Optional[str]  # Error message if workflow fails
