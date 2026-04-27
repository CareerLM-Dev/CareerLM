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
    matched_skills: list[str]
    missing_skills: list[str]
    needs_improvement_skills: NotRequired[list[str]]
    score_summary: NotRequired[str]
    match_evidence: NotRequired[list[dict]]
    missing_skills_metadata: NotRequired[list[dict]]  # Learning time + quick_fix flag per skill
    total_required_skills: int
    matched_skills_count: int


class BucketedSkill(TypedDict):
    """Missing-skill classification metadata used for routing and prioritization."""
    skill: str
    required: bool
    proficiency: int
    learning_days: int
    learning_time_label: str
    is_quick_fix: bool


class AnalysisSummary(TypedDict):
    """Summary of the skill gap analysis."""
    best_match: Optional[str]
    best_match_probability: float
    skills_to_focus: list[str]


class SkillConfidenceItem(TypedDict):
    """Per-skill confidence metadata from resume evidence."""
    skill: str
    level: str
    score: int
    evidence: list[str]
    competency_type: NotRequired[str]
    evidence_sources: NotRequired[list[str]]


class NormalizedSkill(TypedDict):
    """Normalized skill record including proficiency signal."""
    skill: str
    normalized: str
    proficiency: int
    confidence_level: str
    competency_type: NotRequired[str]


class SkillGapState(TypedDict):
    """State for the skill gap analyzer workflow."""
    resume_text: str
    filename: NotRequired[Optional[str]]
    skills_text: NotRequired[Optional[str]]      # Parsed skills section
    projects_text: NotRequired[Optional[str]]    # Parsed projects section
    experience_text: NotRequired[Optional[str]]  # Parsed experience section
    questionnaire_answers: NotRequired[Optional[dict]]  # User preferences including tech stack
    user_skills: NotRequired[list[str]]
    normalized_skills: NotRequired[list[NormalizedSkill]]
    skill_confidence_levels: NotRequired[dict[str, list[str]]]
    skill_confidence_details: NotRequired[list[SkillConfidenceItem]]
    career_matches: NotRequired[list[CareerMatch]]
    top_3_careers: NotRequired[list[CareerMatch]]
    ai_recommendations: NotRequired[str]
    analysis_summary: NotRequired[AnalysisSummary]
    total_skills_found: NotRequired[int]
    target_role: NotRequired[Optional[str]]
    selected_cluster_source: NotRequired[Optional[str]]
    selected_cluster_confidence: NotRequired[Optional[float]]
    timeline_weeks: NotRequired[Optional[int]]
    skill_proficiency: NotRequired[dict[str, int]]
    gap_buckets: NotRequired[dict[str, list[BucketedSkill]]]
    resume_optimizer_skills: NotRequired[list[str]]
    study_planner_skills: NotRequired[list[str]]
    out_of_scope_skills: NotRequired[list[dict]]
    timeline_note: NotRequired[Optional[str]]
    selected_target_career_match: NotRequired[CareerMatch]
    error: NotRequired[Optional[str]]
