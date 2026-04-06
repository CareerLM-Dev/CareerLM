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
    """A single step in a skill learning roadmap."""
    step: int
    label: str
    type: str
    title: str
    url: str
    platform: NotRequired[str]
    est_time: str
    cost: str
    alt_platforms: NotRequired[list[AltPlatform]]


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
    focus: str                     # Short focus area for the day (e.g. "React Hooks")
    task: str                      # Concrete task description
    resource: NotRequired[dict]    # { title, url, est_time }
    deliverable: str               # What the user should produce/complete by end of day
    skill_tag: NotRequired[str]    # Which detected_skill this day maps to


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
