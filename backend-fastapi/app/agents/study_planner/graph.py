"""
LangGraph workflow for the study planner agent.
"""

from langgraph.graph import StateGraph, START, END
from .state import StudyPlannerState
from .nodes import (
    validate_input_node,
    sequence_skills_node,
    fetch_live_resources_node,
    validate_urls_node,
    build_schedule_node,
    fallback_resources_node,
)


# ────────────────────────────────────────────────────────
# Conditional edge functions
# ────────────────────────────────────────────────────────

def should_continue_after_validation(state: StudyPlannerState) -> str:
    """Skip remaining nodes if input validation failed."""
    if state.get("error"):
        return END
    return "sequence_skills"


def should_fallback(state: StudyPlannerState) -> str:
    """
    Route after fetch_live_resources:
    - If we have results (even partial), proceed to URL validation.
    - If everything failed, go to full fallback.
    """
    has_report = state.get("skill_gap_report") and len(state.get("skill_gap_report", [])) > 0
    has_error = bool(state.get("error"))
    if has_error or not has_report:
        return "fallback_resources"
    return "validate_urls"


def build_study_planner_graph() -> StateGraph:
    """
    Build the study planner workflow graph.

    Flow:
        START → validate_input
            ─(error)─→ END
            ─(ok)─→ sequence_skills → fetch_live_resources
                ─(has results)─→ validate_urls → build_schedule → END
                ─(total failure)─→ fallback_resources → build_schedule → END
    """
    graph = StateGraph(StudyPlannerState)

    # Add nodes
    graph.add_node("validate_input", validate_input_node)
    graph.add_node("sequence_skills", sequence_skills_node)
    graph.add_node("fetch_live_resources", fetch_live_resources_node)
    graph.add_node("validate_urls", validate_urls_node)
    graph.add_node("build_schedule", build_schedule_node)
    graph.add_node("fallback_resources", fallback_resources_node)

    # Edges
    graph.add_edge(START, "validate_input")
    graph.add_conditional_edges("validate_input", should_continue_after_validation)
    graph.add_edge("sequence_skills", "fetch_live_resources")
    graph.add_conditional_edges("fetch_live_resources", should_fallback)
    graph.add_edge("validate_urls", "build_schedule")
    graph.add_edge("fallback_resources", "build_schedule")
    graph.add_edge("build_schedule", END)

    return graph


# Create the compiled workflow
study_planner_workflow = build_study_planner_graph().compile()


def generate_study_plan(target_career: str, missing_skills: list[str], questionnaire_answers: dict | None = None) -> dict:
    """
    Main entry-point: generate a learning roadmap for the given skill gaps.

    Args:
        target_career: The career the user is targeting.
        missing_skills: List of skills the user needs to learn.
        questionnaire_answers: Optional onboarding questionnaire data
            (target_role, primary_goal, learning_preference, time_commitment).

    Returns:
        Dictionary with ``skill_gap_report``, ``study_plan``, and ``schedule_summary``.
    """
    try:
        initial_state: StudyPlannerState = {
            "target_career": target_career,
            "missing_skills": missing_skills,
        }

        if questionnaire_answers:
            initial_state["questionnaire_answers"] = questionnaire_answers

        result = study_planner_workflow.invoke(initial_state)

        return {
            "target_career": result.get("target_career", target_career),
            "ordered_skills": result.get("ordered_skills", missing_skills),
            "skill_gap_report": result.get("skill_gap_report", []),
            "study_plan": result.get("study_plan", []),
            "urls_validated": result.get("urls_validated", False),
            "schedule_summary": result.get("schedule_summary"),
            "error": result.get("error"),
        }

    except Exception as exc:
        return {"error": f"Study planner failed: {exc}"}
