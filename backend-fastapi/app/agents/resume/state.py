# app/agents/resume/state.py
"""
State definitions for Resume Module (3-agent system)
"""
from typing import TypedDict, List, Dict, Optional, Literal


class SkillWithEvidence(TypedDict):
    """Skill with validation evidence and proficiency level"""
    skill: str
    status: Literal["confirmed", "transferable", "missing"]
    evidence: List[str]  # Where it appears in resume
    confidence: float  # 0.0 to 1.0
    current_level: int  # 0-3 (assessed proficiency)
    required_level: int  # 0-3 (what job needs)
    gap: int  # required_level - current_level
    learning_time: str  # "2-3 months" or "0 months" if ready


class ResumeState(TypedDict):
    """Simplified state for 3-agent Resume workflow"""
    
    # ===== INPUT =====
    resume_text: str
    job_description: str
    resume_sections: Dict[str, str]
    
    # ===== ATS ANALYSIS (Agent 1: Resume Analyzer) =====
    ats_score: int  # 0-100
    ats_components: Dict[str, int]  # structure, keywords, content, formatting
    ats_justification: List[str]  # List of issues found
    structure_suggestions: List[str]  # What to fix (if ATS < 60)
    needs_template: bool  # Flag to highlight template suggestion
    
    # ===== SKILL INTELLIGENCE (Agent 2: Skill Intelligence) =====
    skills_analysis: List[SkillWithEvidence]  # Unified: validation + gaps + levels
    overall_readiness: str  # "65% match" 
    ready_skills: List[str]  # Skills they have (gap=0)
    critical_gaps: List[str]  # Skills they MUST learn (severity=critical)
    learning_priorities: List[Dict]  # Ordered by importance with time estimates
    
    # ===== OPTIMIZATION (Agent 3: Optimization Advisor) =====
    honest_improvements: List[str]  # 3-5 evidence-based suggestions
    learning_roadmap: List[Dict]  # Priority skills → courses → timeline
    job_readiness_estimate: str  # "65% now → 85% in 3 months"
    
    # ===== CONTROL FLOW =====
    next_action: Literal["analyze_resume", "analyze_skills", "generate_advice", "complete"]
    completed_steps: List[str]
    iteration_count: int
    max_iterations: int
    messages: List[str]  # Agent execution log