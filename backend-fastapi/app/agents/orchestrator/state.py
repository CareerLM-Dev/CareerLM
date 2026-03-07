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
    structure_issues: List[Dict[str, Any]]
    completeness_gaps: List[Dict[str, Any]]
    keyword_gaps: List[Dict[str, Any]]
    skill_gaps: List[Dict[str, Any]]
    weak_bullets: List[Dict[str, Any]]  # Bullets needing rewrite
    honest_improvements: List[Dict[str, Any]]
    human_reader_issues: List[Dict[str, Any]]
    redundancy_issues: List[Dict[str, Any]]
    strengths: List[Dict[str, Any]]
    weaknesses: List[Dict[str, Any]]
    suggestions: List[Dict[str, Any]]
    
    # Actionability
    critical_fixes: List[str]
    quick_wins: List[str]
    bullet_rewrites: List[Dict[str, Any]]
    bullet_quality_breakdown: Dict[str, Any]
    learning_roadmap: List[str]
    
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


class CareerLMState(TypedDict, total=False):
    """
    Central state object that flows through the entire supervisor-driven system.
    
    After every node completes, the entire state is checkpointed to Supabase.
    When resuming, the full state is restored, and nodes extract only what they need.
    
    Sections:
    - User Profile: Identity, preferences, history
    - Active Job: What they're analyzing for
    - Work Completed: Results from each specialist
    - Routing: Metadata for the supervisor
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
    
    # ===== ROUTING & CONTROL =====
    current_phase: Optional[str]  # Which specialist should run next
    prev_phase: Optional[str]     # Where we came from
    
    supervisor_decision: Optional[str]  # Why supervisor chose this phase
    
    resume_analysis_complete: bool
    resume_analysis_failed: bool
    fix_resume_complete: bool
    interview_prep_complete: bool
    cold_email_complete: bool
    study_plan_complete: bool
    skill_gap_complete: bool
    bullet_rewrite_complete: bool
    
    waiting_for_user: bool  # True if paused for human input
    waiting_for_input_type: Optional[str]  # "bullet_answers" | etc
    
    # ===== METADATA =====
    thread_id: str  # Session identifier for checkpointing
    _checkpoint_id: Optional[str]  # Last checkpoint ID (internal, not a channel)
    created_at: datetime
    last_updated: datetime
    messages: List[str]  # Running log of what happened
