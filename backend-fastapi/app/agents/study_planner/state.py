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
