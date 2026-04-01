"""
ATS (Applicant Tracking System) Checker Module - REFACTORING IN PROGRESS

This module previously provided ATS analysis functionality.
It is being refactored and all analysis logic has been removed.

DEPRECATED: Do not use for new features.
TODO: Reimplement ATS analysis in agents/resume/
"""


def get_ats_score(resume_text, resume_sections, job_description):
    """
    DEPRECATED: ATS scoring is being refactored.
    
    Returns stub response for backward compatibility.
    """
    return {
        "overall_score": None,
        "component_scores": {
            "structure_score": None,
            "keyword_score": None,
            "content_score": None,
            "formatting_score": None
        },
        "_status": "refactoring",
        "_message": "ATS analysis temporarily disabled during refactoring"
    }


def analyze_ats_compatibility(resume_text, job_description):
    """
    DEPRECATED: ATS analysis is being refactored.
    
    Returns stub response for backward compatibility.
    """
    return {
        "compatibility_score": None,
        "issues": [],
        "suggestions": [],
        "_status": "refactoring",
        "_message": "ATS analysis temporarily disabled during refactoring"
    }


# ===== OLD CODE REMOVED DURING REFACTORING =====
# All previous implementation details (STOP_WORDS, ACTION_VERBS, scoring functions, etc.)
# have been removed to simplify the module.
# 
# These will be reimplemented in the agents/resume/ module as part of the new agent-based architecture.
