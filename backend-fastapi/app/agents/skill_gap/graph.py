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


def analyze_skill_gap(resume_text: str, filename: str = None) -> dict:
    """
    Main function to analyze skill gaps and recommend careers based on clustering.
    
    Args:
        resume_text: The extracted resume text (already parsed).
        filename: Optional filename for logging purposes.
        
    Returns:
        Dictionary containing skill analysis, career matches, and recommendations.
    """
    try:
        # Prepare initial state
        initial_state: SkillGapState = {
            "resume_text": resume_text,
            "filename": filename
        }
        
        # Run the workflow
        result = skill_gap_workflow.invoke(initial_state)
        
        # Always return results, even if there's an error flag (for graceful degradation)
        return {
            "user_skills": result.get("user_skills", []),
            "total_skills_found": result.get("total_skills_found", 0),
            "career_matches": result.get("career_matches", []),
            "top_3_careers": result.get("top_3_careers", []),
            "ai_recommendations": result.get("ai_recommendations", ""),
            "analysis_summary": result.get("analysis_summary", {})
        }
    
    except Exception as e:
        return {
            "error": f"Analysis failed: {str(e)}"
        }
