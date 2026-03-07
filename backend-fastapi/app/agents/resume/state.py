# app/agents/resume/state.py
"""
State definitions for Resume Module.

3-agent framework aligned to career advisor rubric:
  Dimension 1: Structure & Formatting
  Dimension 2: Section Completeness
  Dimension 3: Keyword & Relevance Alignment
  Dimension 4: Impact & Specificity
"""
from typing import TypedDict, List, Dict, Optional, Any


class ResumeState(TypedDict):
    """State for Resume workflow."""

    # ===== INPUTS =====
    resume_text: str
    job_description: str
    resume_sections: Dict[str, str]
    role_type: Optional[str]        # e.g. "software_engineer", "data_scientist"

    # ===== CONTEXT FLAGS ======
    has_job_description: bool       # True if a real JD was provided

    # ===== DIMENSION SCORES (0-100 each) =====
    structure_score: Optional[int]      # Dimension 1
    completeness_score: Optional[int]   # Dimension 2
    relevance_score: Optional[int]      # Dimension 3
    impact_score: Optional[int]         # Dimension 4

    # ===== OVERALL SCORE =====
    ats_score: Optional[int]            # Weighted composite (kept as "ats_score" for UI compat)
    score_zone: Optional[str]           # "Needs significant work" | "Good foundation, clear gaps" | "Strong, minor refinements needed"
    ats_components: Dict[str, Any]      # {structure, completeness, relevance, impact}
    ats_justification: List[str]        # One line per dimension

    # ===== DIMENSION 1 + 2: STRUCTURE & COMPLETENESS =====
    structure_suggestions: List[Dict[str, Any]]   # Formatting issues from LLM
    readability_issues: List[Dict[str, Any]]       # Missing section issues (context-aware)
    needs_template: Optional[bool]

    # ===== DIMENSION 3: RELEVANCE =====
    keyword_gap_table: List[Dict[str, Any]]  # [{keyword, status, jd_context, resume_evidence}]
    skills_analysis: List[Dict[str, Any]]    # [{skill, status, explanation, evidence}]
    overall_readiness: Optional[str]
    ready_skills: List[str]
    critical_gaps: List[str]
    learning_priorities: List[str]
    ats_issues: List[Dict[str, Any]]         # Missing keywords (for legacy UI)

    # ===== DIMENSION 4: IMPACT & SPECIFICITY =====
    honest_improvements: List[Dict[str, Any]]
    bullet_rewrites: List[Dict[str, Any]]
    bullet_quality_breakdown: Dict[str, Any]  # {action_verbs, metrics, clarity}
    human_reader_issues: List[Dict[str, Any]]
    redundancy_issues: List[Dict[str, Any]]
    learning_roadmap: List[str]
    job_readiness_estimate: Optional[str]

    # ===== LEGACY / FRONTEND COMPATIBILITY =====
    gaps: List[str]
    alignment_suggestions: List[str]

    # ===== CONTROL FLOW =====
    completed_steps: List[str]
    iteration_count: int
    max_iterations: int
    messages: List[str]

    # ===== STATUS =====
    _status: Optional[str]
