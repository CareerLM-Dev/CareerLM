"""
Central orchestrator state for CareerLM system.

This is the single source of truth that travels through all agents.
Every node reads what it needs from this state, and writes back its results.
The full state gets checkpointed after every node completes.
"""

from typing import TypedDict, Optional, List, Dict, Any
from datetime import datetime


class UserProfile(TypedDict, total=False):
    """User identity and profile data."""
    user_id: str
    email: str
    name: str
    status: Optional[str]  # "exploring" | "building" | "applying" | "interview_upcoming"
    target_roles: List[str]  # Selected role archetypes (multi-select from onboarding)
    
    # Passively built from interactions
    score_history: List[Dict[str, Any]]  # [{timestamp, score, delta}]
    confirmed_skills: List[str]
    known_gaps: List[str]
    resume_versions: List[Dict[str, Any]]  # [{version_id, upload_date, score}]
    roles_targeted: List[str]
    best_score_ever: Optional[int]
    active_interview_date: Optional[datetime]


class ActiveJob(TypedDict, total=False):
    """The job currently being analyzed. Flows to all modules."""
    job_id: Optional[str]
    company_name: str
    job_title: str
    job_description: str
    key_requirements: List[str]
    seniority_level: Optional[str]
    industry: Optional[str]
    
    # Set by resume analysis
    matched_requirements: List[str]
    unmatched_requirements: List[str]


class ResumeAnalysisResults(TypedDict, total=False):
    """Results from the resume analysis module."""
    resume_text: Optional[str]
    parsed_sections: Optional[Dict[str, str]]
    
    # Scores
    structure_score: Optional[int]
    completeness_score: Optional[int]
    relevance_score: Optional[int]
    impact_score: Optional[int]
    overall_score: Optional[int]
    score_zone: Optional[str]
    
    # Findings
    skill_gaps: List[Dict[str, Any]]  # Critical skill gaps identified
    critical_fixes: List[str]  # Top 3 structural issues to fix
    
    # RAG-generated insights (from knowledge base)
    strengths: List[Dict[str, Any]]
    weaknesses: List[Dict[str, Any]]
    suggestions: List[Dict[str, Any]]
    
    # Internal
    analyzed_for_role: Optional[str]
    analysis_timestamp: Optional[datetime]
    has_job_description: Optional[bool]
    skills_analysis: List[Dict[str, Any]]
    overall_readiness: Optional[str]
    ready_skills: List[str]
    critical_gaps: List[str]
    learning_priorities: List[str]
    job_readiness_estimate: Optional[str]


class InterviewPrepResults(TypedDict, total=False):
    """Results from interview prep module."""
    prep_plan: Optional[Dict[str, Any]]
    questions_generated: List[Dict[str, Any]]
    practice_topics: List[str]
    focus_areas: List[str]
    readiness_assessment: Optional[str]


class ColdEmailResults(TypedDict, total=False):
    """Results from cold email module."""
    email_draft: Optional[str]
    personalization_notes: Optional[str]
    company_insights: Optional[Dict[str, Any]]


class StudyPlanResults(TypedDict, total=False):
    """Results from study plan module."""
    learning_plan: Optional[Dict[str, Any]]
    topics: List[str]
    estimated_hours: Optional[int]
    resources: List[Dict[str, Any]]


class BulletRewriteRequest(TypedDict, total=False):
    """Human-in-the-loop bullet rewrite flow."""
    weak_bullets: List[Dict[str, Any]]  # Each: {id, original_text, question_to_user}
    user_answers: Optional[Dict[str, str]]  # {bullet_id: user_answer}
    rewrites_generated: Optional[List[Dict[str, Any]]]  # [{bullet_id, original, rewrite}]
    waiting_for_user: bool


class RecommendedAction(TypedDict, total=False):
    """A single recommended action for the user."""
    action_id: str          # e.g., "tailor_resume", "cold_email", "mock_interview"
    label: str              # e.g., "Tailor Resume to JD"
    description: str        # e.g., "Paste a job description to match your resume to it"
    page: str               # Frontend route key, e.g., "resume_optimizer"
    priority: str           # "primary" | "secondary"
    estimated_time: str     # e.g., "5 min", "10 min", "Ongoing"
    track: str              # Which status track this belongs to


class TrackRecommendations(TypedDict, total=False):
    """
    Dynamic recommendations computed by the supervisor for the user's current track.
    
    Rather than forcing the user into a single path, the supervisor computes
    a primary action (the highest-value next step) and a list of parallel
    secondary actions they can pick from freely.
    
    The frontend Floating Helper consumes this directly.
    """
    track: str                              # "applying" | "building" | "exploring" | "interview_upcoming"
    primary: RecommendedAction              # The most impactful next step for this track
    secondary: List[RecommendedAction]      # Side-by-side alternatives the user can pick freely
    reasoning: str                          # Human-readable explanation of why (shown in Helper UI)
    loop_key: str                           # What to suggest after each action completes (e.g., "next_application")
    computed_at: Optional[str]              # ISO timestamp so frontend can cache-check


class CareerLMState(TypedDict, total=False):
    """
    Central state object that flows through the entire supervisor-driven system.
    
    After every node completes, the entire state is checkpointed to Supabase.
    When resuming, the full state is restored, and nodes extract only what they need.
    
    Sections:
    - User Profile: Identity, preferences, history
    - Active Job: What they're analyzing for
    - Work Completed: Results from each specialist
    - Recommendations: Dynamic next-step suggestions (replaces rigid current_phase routing)
    - Human-in-loop: Data for pause/resume flows
    """
    
    # ===== USER PROFILE =====
    profile: UserProfile
    
    # ===== ACTIVE JOB =====
    active_job: ActiveJob
    
    # ===== WORK COMPLETED BY SPECIALISTS =====
    resume_analysis: ResumeAnalysisResults
    interview_prep: InterviewPrepResults
    cold_email: ColdEmailResults
    study_plan: StudyPlanResults
    
    # ===== HUMAN-IN-LOOP =====
    bullet_rewrite: BulletRewriteRequest
    
    # ===== DYNAMIC RECOMMENDATIONS (replaces rigid current_phase routing) =====
    recommendations: TrackRecommendations
    
    # ===== ROUTING & CONTROL =====
    # current_phase is now ONLY used internally during graph execution to route
    # between nodes. It is not the "final answer" to the user.
    current_phase: Optional[str]
    prev_phase: Optional[str]
    
    # Completion flags — used by supervisor to avoid re-triggering completed work
    resume_analysis_complete: bool
    resume_analysis_failed: bool
    fix_resume_complete: bool
    interview_prep_complete: bool
    cold_email_complete: bool
    study_plan_complete: bool
    skill_gap_complete: bool
    bullet_rewrite_complete: bool
    
    # Track completion counters — prevent infinite loops
    # Each time a node runs, increment its counter. If counter > max_runs, skip.
    resume_analysis_runs: int
    interview_prep_runs: int
    cold_email_runs: int
    study_plan_runs: int
    
    waiting_for_user: bool  # True if paused for human input
    waiting_for_input_type: Optional[str]  # "bullet_answers" | etc
    
    # ===== METADATA =====
    thread_id: str  # Session identifier for checkpointing
    _checkpoint_id: Optional[str]  # Last checkpoint ID (internal, not a channel)
    created_at: datetime
    last_updated: datetime
    messages: List[str]  # Running log of what happened
