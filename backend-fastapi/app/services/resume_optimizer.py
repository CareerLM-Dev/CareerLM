# app/services/resume_optimizer.py
"""
Resume optimization service using the 3-agent resume workflow.
"""
from app.agents.resume import resume_workflow
from app.agents.resume.state import ResumeState
from app.services.resume_parser import ResumeParser


def parse_resume_sections(resume_text):
    """
    Parse resume into sections using hybrid keyword+LLM approach.
    
    Returns:
        Dictionary mapping section names to content
    """
    parser = ResumeParser()
    return parser.parse_sections(resume_text)


def extract_text_from_pdf(file_bytes):
    """Extract text from PDF file bytes."""
    parser = ResumeParser()
    return parser.extract_text_from_pdf(file_bytes)


def optimize_resume_logic(
    resume_content,
    job_description,
    filename=None,
    resume_text=None,
    sections=None,
    role_type=None,
    year_of_study=None,
):
    """
    Run the 3-agent career advisor workflow.

    Args:
        resume_content: Raw resume bytes.
        job_description: Job description text (empty string if not provided).
        filename: Optional filename for type detection.
        resume_text: Optional pre-extracted resume text.
        sections: Optional pre-parsed sections.
        role_type: Role archetype key (e.g. 'software_engineer').
        year_of_study: Student year (e.g. '2', 'final').
    """
    parser = ResumeParser()
    if resume_text is None:
        resume_text = parser.extract_text(resume_content, filename=filename)
    if sections is None:
        sections = parser.parse_sections(resume_text)

    initial_state: ResumeState = {
        # Inputs
        "resume_text": resume_text,
        "job_description": job_description or "",
        "resume_sections": sections,
        "role_type": role_type,
        "year_of_study": year_of_study,

        # Context flags
        "has_job_description": bool(job_description and len(job_description.strip()) > 50),

        # Dimension scores
        "structure_score": None,
        "completeness_score": None,
        "relevance_score": None,
        "impact_score": None,

        # Overall score
        "ats_score": None,
        "score_zone": None,
        "ats_components": {},
        "ats_justification": [],

        # Structure + completeness outputs
        "structure_suggestions": [],
        "readability_issues": [],
        "needs_template": False,

        # Relevance outputs
        "keyword_gap_table": [],
        "skills_analysis": [],
        "overall_readiness": None,
        "ready_skills": [],
        "critical_gaps": [],
        "learning_priorities": [],
        "ats_issues": [],

        # Impact outputs
        "honest_improvements": [],
        "bullet_rewrites": [],
        "bullet_quality_breakdown": {},
        "human_reader_issues": [],
        "redundancy_issues": [],
        "learning_roadmap": [],
        "job_readiness_estimate": None,

        # Legacy/UI compatibility
        "gaps": [],
        "alignment_suggestions": [],

        # Control
        "completed_steps": [],
        "iteration_count": 0,
        "max_iterations": 3,
        "messages": [],

        # Status
        "_status": "processing",
    }

    final_state = resume_workflow.invoke(initial_state)

    return {
        # Overall score + zone
        "ats_score": final_state.get("ats_score"),
        "score_zone": final_state.get("score_zone"),

        # Dimension scores
        "structure_score": final_state.get("structure_score"),
        "completeness_score": final_state.get("completeness_score"),
        "relevance_score": final_state.get("relevance_score"),
        "impact_score": final_state.get("impact_score"),

        # ATS analysis wrapper (legacy UI compat)
        "ats_analysis": {
            "component_scores": final_state.get("ats_components", {}),
            "justification": final_state.get("ats_justification", []),
            "issues": final_state.get("ats_issues", []),
            "readability_issues": final_state.get("readability_issues", []),
            "needs_template": final_state.get("needs_template", False),
        },

        # Legacy analysis wrapper
        "analysis": {
            "gaps": final_state.get("gaps", []),
            "alignment_suggestions": final_state.get("alignment_suggestions", []),
            "structure_suggestions": final_state.get("structure_suggestions", []),
        },

        # Keyword & relevance
        "keyword_gap_table": final_state.get("keyword_gap_table", []),
        "has_job_description": final_state.get("has_job_description", False),
        "skills_analysis": final_state.get("skills_analysis", []),
        "overall_readiness": final_state.get("overall_readiness"),
        "ready_skills": final_state.get("ready_skills", []),
        "critical_gaps": final_state.get("critical_gaps", []),
        "learning_priorities": final_state.get("learning_priorities", []),

        # Impact & specificity
        "honest_improvements": final_state.get("honest_improvements", []),
        "bullet_rewrites": final_state.get("bullet_rewrites", []),
        "bullet_quality_breakdown": final_state.get("bullet_quality_breakdown", {}),
        "human_reader_issues": final_state.get("human_reader_issues", []),
        "redundancy_issues": final_state.get("redundancy_issues", []),
        "learning_roadmap": final_state.get("learning_roadmap", []),
        "job_readiness_estimate": final_state.get("job_readiness_estimate"),

        # Metadata
        "agent_execution_log": final_state.get("messages", []),
        "completed_steps": final_state.get("completed_steps", []),
        "_status": final_state.get("_status", "completed"),
    }