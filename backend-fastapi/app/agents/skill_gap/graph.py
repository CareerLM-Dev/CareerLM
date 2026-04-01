"""
LangGraph workflow for skill gap analysis.
"""

from langgraph.graph import StateGraph, START, END
from .state import SkillGapState
from .nodes import (
    extract_skills_node,
    calculate_career_probabilities_node,
    get_ai_recommendations_node,
    compile_results_node
)


def build_skill_gap_graph() -> StateGraph:
    """
    Build the skill gap analysis workflow graph.
    
    Returns:
        Configured StateGraph for skill gap analysis.
    """
    graph = StateGraph(SkillGapState)
    
    # Add nodes
    graph.add_node("extract_skills", extract_skills_node)
    graph.add_node("calculate_probabilities", calculate_career_probabilities_node)
    graph.add_node("get_recommendations", get_ai_recommendations_node)
    graph.add_node("compile_results", compile_results_node)
    
    # Add edges
    graph.add_edge(START, "extract_skills")
    graph.add_edge("extract_skills", "calculate_probabilities")
    graph.add_edge("calculate_probabilities", "get_recommendations")
    graph.add_edge("get_recommendations", "compile_results")
    graph.add_edge("compile_results", END)
    
    return graph


# Create the compiled workflow
skill_gap_workflow = build_skill_gap_graph().compile()


def analyze_skill_gap(
    resume_text: str,
    filename: str | None = None,
    sections: dict | None = None,
    questionnaire_answers: dict | None = None,
) -> dict:
    """
    Main function to analyze skill gaps and recommend careers based on clustering.

    Args:
        resume_text: The extracted resume text (already parsed).
        filename: Optional filename for logging purposes.
        sections: Optional dict with parsed resume sections
                  (keys: 'skills', 'projects', etc.).  When provided the
                  skill-extractor focuses on skills + project tech-stacks
                  instead of the full resume text.
        questionnaire_answers: Optional dict with user preferences including preferred_tech_stack.

    Returns:
        Dictionary containing skill analysis, career matches, and recommendations.
    """
    try:
        # Prepare initial state
        initial_state: SkillGapState = {
            "resume_text": resume_text,
            "filename": filename,
            "questionnaire_answers": questionnaire_answers,
        }

        # Feed structured sections when available
        if sections:
            initial_state["skills_text"] = sections.get("skills") or None
            initial_state["projects_text"] = sections.get("projects") or None
            initial_state["experience_text"] = (
                sections.get("experience")
                or sections.get("work_experience")
                or None
            )
        
        # Run the workflow
        result = skill_gap_workflow.invoke(initial_state)
        
        # Always return results, even if there's an error flag (for graceful degradation)
        return {
            "user_skills": result.get("user_skills", []),
            "normalized_skills": result.get("normalized_skills", []),
            "total_skills_found": result.get("total_skills_found", 0),
            "target_role": result.get("target_role"),
            "selected_cluster_source": result.get("selected_cluster_source"),
            "selected_cluster_confidence": result.get("selected_cluster_confidence"),
            "timeline_weeks": result.get("timeline_weeks"),
            "skill_proficiency": result.get("skill_proficiency", {}),
            "skill_confidence_levels": result.get("skill_confidence_levels", {
                "high_confidence": [],
                "medium_confidence": [],
                "low_confidence": [],
            }),
            "skill_confidence_details": result.get("skill_confidence_details", []),
            "gap_buckets": result.get("gap_buckets", {}),
            "resume_optimizer_skills": result.get("resume_optimizer_skills", []),
            "study_planner_skills": result.get("study_planner_skills", []),
            "out_of_scope_skills": result.get("out_of_scope_skills", []),
            "timeline_note": result.get("timeline_note"),
            "selected_target_career_match": result.get("selected_target_career_match"),
            "career_matches": result.get("career_matches", []),
            "top_3_careers": result.get("top_3_careers", []),
            "ai_recommendations": result.get("ai_recommendations", ""),
            "analysis_summary": result.get("analysis_summary", {})
        }
    
    except Exception as e:
        return {
            "error": f"Analysis failed: {str(e)}"
        }
