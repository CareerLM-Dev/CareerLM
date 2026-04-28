"""
LangGraph workflow for the study planner agent.

Two graphs are defined:
  1. study_planner_workflow  — standard long-term skill-gap plan (existing)
  2. quick_plan_workflow     — deadline-driven quick-prep plan (new)

The main entry-point functions are:
  - generate_study_plan(target_career, missing_skills, questionnaire_answers)
  - generate_quick_plan(quick_goal, target_career, deadline_days, specific_requirements)
"""

from langgraph.graph import StateGraph, START, END
from .state import StudyPlannerState
from .nodes import (
    # Standard plan nodes
    validate_input_node,
    sequence_skills_node,
    fetch_live_resources_node,
    validate_urls_node,
    build_schedule_node,
    fallback_resources_node,
    # Quick prep nodes
    validate_quick_plan_input_node,
    build_quick_plan_node,
)


# ────────────────────────────────────────────────────────
# Conditional edge functions — Standard plan
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


# ────────────────────────────────────────────────────────
# Conditional edge functions — Quick prep plan
# ────────────────────────────────────────────────────────

def should_continue_after_quick_validation(state: StudyPlannerState) -> str:
    """Skip build if quick-plan validation failed."""
    if state.get("error"):
        return END
    return "build_quick_plan"


# ────────────────────────────────────────────────────────
# Graph builders
# ────────────────────────────────────────────────────────

def build_study_planner_graph() -> StateGraph:
    """
    Build the standard study planner workflow graph.

    Flow:
        START → validate_input
            ─(error)─→ END
            ─(ok)─→ sequence_skills → fetch_live_resources
                ─(has results)─→ validate_urls → build_schedule → END
                ─(total failure)─→ fallback_resources → build_schedule → END
    """
    graph = StateGraph(StudyPlannerState)

    graph.add_node("validate_input", validate_input_node)
    graph.add_node("sequence_skills", sequence_skills_node)
    graph.add_node("fetch_live_resources", fetch_live_resources_node)
    graph.add_node("validate_urls", validate_urls_node)
    graph.add_node("build_schedule", build_schedule_node)
    graph.add_node("fallback_resources", fallback_resources_node)

    graph.add_edge(START, "validate_input")
    graph.add_conditional_edges("validate_input", should_continue_after_validation)
    graph.add_edge("sequence_skills", "fetch_live_resources")
    graph.add_conditional_edges("fetch_live_resources", should_fallback)
    graph.add_edge("validate_urls", "build_schedule")
    graph.add_edge("fallback_resources", "build_schedule")
    graph.add_edge("build_schedule", END)

    return graph


def build_quick_plan_graph() -> StateGraph:
    """
    Build the quick-prep workflow graph.

    Flow:
        START → validate_quick_plan_input
            ─(error)─→ END
            ─(ok)─→ build_quick_plan → END
    """
    graph = StateGraph(StudyPlannerState)

    graph.add_node("validate_quick_plan_input", validate_quick_plan_input_node)
    graph.add_node("build_quick_plan", build_quick_plan_node)

    graph.add_edge(START, "validate_quick_plan_input")
    graph.add_conditional_edges("validate_quick_plan_input", should_continue_after_quick_validation)
    graph.add_edge("build_quick_plan", END)

    return graph


# ────────────────────────────────────────────────────────
# Compiled workflows (module-level singletons)
# ────────────────────────────────────────────────────────

study_planner_workflow = build_study_planner_graph().compile()
quick_plan_workflow = build_quick_plan_graph().compile()


# ────────────────────────────────────────────────────────
# Public entry-point functions
# ────────────────────────────────────────────────────────

def generate_study_plan(
    target_career: str,
    missing_skills: list[str],
    questionnaire_answers: dict | None = None,
) -> dict:
    """
    Main entry-point: generate a standard long-term learning roadmap.

    Args:
        target_career: The career the user is targeting.
        missing_skills: List of skills the user needs to learn.
        questionnaire_answers: Optional onboarding questionnaire data.

    Returns:
        Dictionary with ``skill_gap_report``, ``study_plan``, and ``schedule_summary``.
    """
    try:
        initial_state: StudyPlannerState = {
            "target_career": target_career,
            "missing_skills": missing_skills,
            "plan_type": "standard",
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


def generate_quick_plan(
    quick_goal: str,
    target_career: str,
    deadline_days: int,
    specific_requirements: str = "",
    learning_profile: dict | None = None,
    feedback_signals: dict | None = None,
) -> dict:
    """
    Entry-point: generate a deadline-driven day-by-day quick prep plan.

    Args:
        quick_goal: The user's short-term goal (e.g. "React frontend interview").
        target_career: Career context.
        deadline_days: Number of days until the deadline (1-31).
        specific_requirements: Any additional constraints from the user.

    Returns:
        Dictionary with ``detected_skills``, ``quick_plan_days``, and optional ``error``.
    """
    try:
        initial_state: StudyPlannerState = {
            "target_career": target_career,
            "missing_skills": [],          # Not used in quick path
            "plan_type": "quick_prep",
            "quick_goal": quick_goal,
            "deadline_days": deadline_days,
            "specific_requirements": specific_requirements,
            "learning_profile": learning_profile or {},
            "feedback_signals": feedback_signals or {},
        }

        result = quick_plan_workflow.invoke(initial_state)

        return {
            "target_career": result.get("target_career", target_career),
            "quick_goal": result.get("quick_goal", quick_goal),
            "deadline_days": result.get("deadline_days", deadline_days),
            "detected_skills": result.get("detected_skills", []),
            "quick_plan_days": result.get("quick_plan_days", []),
            "quick_context": result.get("quick_context", {}),
            "error": result.get("error"),
        }

    except Exception as exc:
        return {"error": f"Quick plan generation failed: {exc}"}
