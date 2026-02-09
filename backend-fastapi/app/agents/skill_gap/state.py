"""
State definition for the skill gap analyzer agent.
"""

from typing import TypedDict, Optional
from typing_extensions import NotRequired


class CareerMatch(TypedDict):
    """Career match information."""
    career: str
    probability: float
    skill_match_percentage: float
    semantic_match_percentage: float
    matched_skills: list[str]
    missing_skills: list[str]
    total_required_skills: int
    matched_skills_count: int


class AnalysisSummary(TypedDict):
    """Summary of the skill gap analysis."""
    best_match: Optional[str]
    best_match_probability: float
    skills_to_focus: list[str]


class SkillGapState(TypedDict):
    """State for the skill gap analyzer workflow."""
    resume_text: str
    filename: NotRequired[Optional[str]]
    user_skills: NotRequired[list[str]]
    career_matches: NotRequired[list[CareerMatch]]
    top_3_careers: NotRequired[list[CareerMatch]]
    ai_recommendations: NotRequired[str]
    analysis_summary: NotRequired[AnalysisSummary]
    total_skills_found: NotRequired[int]
    error: NotRequired[Optional[str]]
