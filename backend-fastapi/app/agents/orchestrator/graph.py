"""
Main orchestrator graph.

Supervisor-driven recommendation engine. The supervisor computes a dynamic
recommendations object for the user's current track, then yields to human
input via the frontend Floating Helper.

Flow:
  START → SUPERVISOR
       ↓
       supervisor computes recommendations, sets phase → ready_for_next_action
       ↓
       END  ← graph terminates here; frontend uses recommendations object

  When resume is present but un-analyzed:
  START → SUPERVISOR → resume_analysis_wrapper → profile_update → SUPERVISOR
                                                                 ↓ (second pass)
                                                               END

  The graph does NOT automatically trigger cold_email, interview_prep,
  skill_gap, or study_plan. These are user-initiated via the Floating Helper.
  Each tool module has its own independent API endpoint.

Infinite Loop Prevention:
  - The supervisor checks resume_analysis_runs before auto-triggering analysis.
  - Only one automated analysis per session; all other runs are user-initiated.
  - ready_for_next_action → END (no cycles back into the graph).
"""

from langgraph.graph import StateGraph, END
from app.agents.orchestrator.state import CareerLMState
from app.agents.orchestrator.nodes import supervisor_node
from app.agents.resume.orchestrator_wrapper import resume_analysis_wrapper_node
from app.agents.orchestrator.profile_update import profile_update_node
from app.agents.orchestrator.checkpointer import SupabaseCheckpointer


def _increment_resume_runs(state: CareerLMState) -> CareerLMState:
    """Increment the resume analysis run counter before running analysis."""
    state["resume_analysis_runs"] = state.get("resume_analysis_runs", 0) + 1
    return state


def create_orchestrator_graph(use_checkpointer: bool = False):
    """
    Creates the supervisor-driven orchestrator graph.

    The graph is intentionally lean:
    - Supervisor computes recommendations and exits
    - Only resume analysis is automated (once per session)
    - All other modules are user-initiated from the frontend
    """
    print("Building Orchestrator graph (recommendation engine)...")

    workflow = StateGraph(CareerLMState)

    # ===== NODES =====
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("increment_resume_runs", _increment_resume_runs)
    workflow.add_node("resume_analysis_wrapper", resume_analysis_wrapper_node)
    workflow.add_node("profile_update", profile_update_node)

    # ===== ENTRY POINT =====
    workflow.set_entry_point("supervisor")

    # ===== ROUTING FROM SUPERVISOR =====
    def route_from_supervisor(state: CareerLMState) -> str:
        phase = state.get("current_phase", "ready_for_next_action")
        if phase == "resume_analysis":
            return "resume_analysis"
        # All other phases (ready_for_next_action, or anything unexpected) → END
        return "end"

    workflow.add_conditional_edges(
        "supervisor",
        route_from_supervisor,
        {
            "resume_analysis": "increment_resume_runs",
            "end": END,
        }
    )

    # ===== RESUME ANALYSIS CHAIN =====
    # increment counter → run analysis → update profile → supervisor (second pass)
    workflow.add_edge("increment_resume_runs", "resume_analysis_wrapper")
    workflow.add_edge("resume_analysis_wrapper", "profile_update")
    workflow.add_edge("profile_update", "supervisor")

    # ===== COMPILE =====
    print("  → Compiling graph...")

    if use_checkpointer:
        try:
            checkpointer = SupabaseCheckpointer()
            app = workflow.compile(checkpointer=checkpointer)
            print("  → Checkpointer enabled (Supabase)")
        except Exception as e:
            print(f"  → WARNING: Could not initialize checkpointer: {e}")
            print("  → Compiling without checkpointer")
            app = workflow.compile()
    else:
        app = workflow.compile()

    print("  → Orchestrator graph ready (recommendation engine, no placeholder loops)")
    return app


# Create singleton with checkpointing enabled
print("Creating orchestrator_graph singleton...")
orchestrator_graph = create_orchestrator_graph(use_checkpointer=True)
print("orchestrator_graph ready!")
