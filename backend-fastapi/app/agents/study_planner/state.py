"""
State definition for the study planner agent.
"""

from typing import TypedDict, Optional
from typing_extensions import NotRequired


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


class SkillRoadmap(TypedDict):
    """Roadmap for a single skill."""
    skill: str
    learning_path: list[RoadmapStep]


class StudyPlannerState(TypedDict):
    """State for the study planner workflow."""
    target_career: str
    missing_skills: list[str]
    questionnaire_answers: NotRequired[Optional[dict]]
    skill_gap_report: NotRequired[list[SkillRoadmap]]
    study_plan: NotRequired[list[dict]]
    error: NotRequired[Optional[str]]
