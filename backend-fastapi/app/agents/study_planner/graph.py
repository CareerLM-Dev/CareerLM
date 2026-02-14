"""
LangGraph workflow for the study planner agent.
"""

from langgraph.graph import StateGraph, START, END
from .state import StudyPlannerState
from .nodes import (
    validate_input_node,
    fetch_live_resources_node,
    fallback_resources_node,
)


def build_study_planner_graph() -> StateGraph:
    """
    Build the study planner workflow graph.

    Flow:
        START → validate_input → fetch_live_resources → fallback_resources → END
    """
    graph = StateGraph(StudyPlannerState)

    # Add nodes
    graph.add_node("validate_input", validate_input_node)
    graph.add_node("fetch_live_resources", fetch_live_resources_node)
    graph.add_node("fallback_resources", fallback_resources_node)

    # Add edges (sequential)
    graph.add_edge(START, "validate_input")
    graph.add_edge("validate_input", "fetch_live_resources")
    graph.add_edge("fetch_live_resources", "fallback_resources")
    graph.add_edge("fallback_resources", END)

    return graph


# Create the compiled workflow
study_planner_workflow = build_study_planner_graph().compile()


def generate_study_plan(target_career: str, missing_skills: list[str]) -> dict:
    """
    Main entry-point: generate a learning roadmap for the given skill gaps.

    Args:
        target_career: The career the user is targeting.
        missing_skills: List of skills the user needs to learn.

    Returns:
        Dictionary with ``skill_gap_report`` and ``study_plan``.
    """
    try:
        initial_state: StudyPlannerState = {
            "target_career": target_career,
            "missing_skills": missing_skills,
        }

        result = study_planner_workflow.invoke(initial_state)

        return {
            "target_career": result.get("target_career", target_career),
            "skill_gap_report": result.get("skill_gap_report", []),
            "study_plan": result.get("study_plan", []),
            "error": result.get("error"),
        }

    except Exception as exc:
        return {"error": f"Study planner failed: {exc}"}
