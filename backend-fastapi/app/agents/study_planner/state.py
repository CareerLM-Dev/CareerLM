"""
State definition for the study planner agent.
"""

from typing import TypedDict, Optional
from typing_extensions import NotRequired


class AltPlatform(TypedDict):
    """An alternative platform for a learning resource."""
    name: str
    url: str


class RoadmapStep(TypedDict):
    """
    A single step in a skill learning roadmap.
    
    Enhanced with:
    - Specific resource type (documentation, tutorial_video, interactive_lab, etc.)
    - Relevance, depth, credibility, usability scores for ranking
    - Resource difficulty level
    - Feedback signals for continuous improvement
    """
    step: int
    label: str
    type: str  # Now: "documentation", "tutorial_video", "interactive_lab", "cheat_sheet", etc.
    title: str
    url: str
    platform: NotRequired[str]
    est_time: str
    cost: str
    difficulty: NotRequired[str]  # "beginner", "intermediate", "advanced"
    
    # Ranking scores (0-1)
    relevance_score: NotRequired[float]  # How directly relevant to learning objective?
    depth_score: NotRequired[float]      # How comprehensive?
    credibility_score: NotRequired[float] # How trusted is the source?
    usability_score: NotRequired[float]  # Can user start immediately?
    overall_rank: NotRequired[float]     # Composite ranking score
    
    # Resource metadata
    alt_platforms: NotRequired[list[AltPlatform]]
    feedback_signals: NotRequired[dict]  # {clicks, completions, avg_rating}


class SkillRoadmap(TypedDict):
    """Roadmap for a single skill."""
    skill: str
    roadmap_url: NotRequired[str]
    learning_path: list[RoadmapStep]


class SkillScheduleEntry(TypedDict):
    """Per-skill schedule breakdown."""
    skill: str
    hours: float
    sessions: int
    track: NotRequired[int]
    start_week: NotRequired[float]
    end_week: NotRequired[float]


class ScheduleSummary(TypedDict):
    """Overall study schedule summary."""
    total_hours: float
    hours_per_week: float
    total_weeks: float
    skills: list[SkillScheduleEntry]
    parallel_tracks: NotRequired[int]
    learning_mode: NotRequired[str]
    note: str


class QuickPlanDay(TypedDict):
    """A single day entry in a Quick Prep plan."""
    day: int                       # 1-indexed day number
    date: NotRequired[str]         # ISO date string (filled in by route handler)
    topic: NotRequired[str]        # Main topic for the day
    subtopic: NotRequired[str]     # Narrow concept inside topic
    learning_objective: NotRequired[str]  # Exact objective for the day
    proficiency_level: NotRequired[str]   # "beginner" | "intermediate" | "advanced"
    focus: str                     # Short focus area for the day (e.g. "React Hooks")
    task: str                      # Concrete task description
    resource: NotRequired[dict]    # Legacy primary resource for existing UI compatibility
    resource_stack: NotRequired[list[dict]]  # [one_shot_video, docs, practice, checklist_summary]
    takeaway_summary: NotRequired[str]       # 2-3 sentence summary for retention
    checklist: NotRequired[list[str]]        # End-of-day checklist
    follow_up_recommendations: NotRequired[list[str]]  # Next-step recommendations after completion
    quick_context: NotRequired[dict]         # Quick Prep-only planning context used for this day
    deliverable: str               # What the user should produce/complete by end of day
    skill_tag: NotRequired[str]    # Which detected_skill this day maps to

    # Completion + analytics metadata (hydrated from persisted progress)
    completed: NotRequired[bool]
    skipped: NotRequired[bool]
    completion_ratio: NotRequired[float]
    completed_task_types: NotRequired[list[str]]
    rating: NotRequired[Optional[int]]


class StudyPlannerState(TypedDict):
    """State for the study planner workflow."""
    target_career: str
    missing_skills: list[str]
    ordered_skills: NotRequired[list[str]]
    questionnaire_answers: NotRequired[Optional[dict]]
    skill_gap_report: NotRequired[list[SkillRoadmap]]
    study_plan: NotRequired[list[dict]]
    urls_validated: NotRequired[bool]
    schedule_summary: NotRequired[Optional[ScheduleSummary]]
    error: NotRequired[Optional[str]]

    # ── Quick-Plan fields (only populated when plan_type == "quick_prep") ──
    plan_type: NotRequired[str]              # "standard" | "quick_prep"
    quick_goal: NotRequired[str]             # User's short-term goal text
    deadline_days: NotRequired[int]          # Days until deadline (1-31)
    specific_requirements: NotRequired[str]  # Extra constraints from user
    detected_skills: NotRequired[list[str]]  # Skills extracted by LLM from quick_goal
    quick_plan_days: NotRequired[list[QuickPlanDay]]  # Day-by-day schedule output
    learning_profile: NotRequired[Optional[dict]]      # Context profile used for personalization
    feedback_signals: NotRequired[Optional[dict]]      # Historical completion/skip/rating signals
    quick_context: NotRequired[Optional[dict]]         # Derived Quick Prep-only context for the plan
