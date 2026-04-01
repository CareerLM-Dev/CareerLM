"""
Main orchestrator graph.

Supervisor-driven multi-agent system. The supervisor decides which specialist
to call next. After each specialist completes, returns to supervisor.

Flow:
  START → SUPERVISOR (decide next phase)
       ↓
       ├→ upload_resume (if no resume)
       ├→ resume_analysis_wrapper → profile_update → supervisor (if resume ready)
       ├→ fix_resume (if score < 50)
       ├→ interview_prep (if interview soon)
       ├→ cold_email (if actively applying)
       ├→ bullet_rewrite_questions (if weak bullets)
       ├→ study_plan (if skill gaps)
       └→ idle (if all complete)
       ↓
       Each specialist returns → SUPERVISOR again
       
Checkpointing happens after every node.
Human-in-loop pauses at bullet_rewrite_questions and waits for user answers.
"""

from langgraph.graph import StateGraph, END
from app.agents.orchestrator.state import CareerLMState
from app.agents.orchestrator.nodes import supervisor_node
from app.agents.resume.orchestrator_wrapper import resume_analysis_wrapper_node
from app.agents.orchestrator.profile_update import profile_update_node
from app.agents.orchestrator.checkpointer import SupabaseCheckpointer


def create_orchestrator_graph(use_checkpointer: bool = False):
    """
    Creates the main supervisor-driven orchestrator graph.
    
    Args:
        use_checkpointer: If True, enables Supabase checkpointing.
                         Only set False for testing without DB. DEFAULT: False
    
    For now, this includes:
    - Supervisor decision node
    - Resume analysis wrapper (calls existing resume_workflow)
    - Profile update node (computes score delta)
    
    Placeholder nodes for other specialists (to be filled in).
    """
    print("Building Orchestrator graph (supervisor-driven)...")
    
    workflow = StateGraph(CareerLMState)
    
    # ===== NODES =====
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("resume_analysis_wrapper", resume_analysis_wrapper_node)
    workflow.add_node("profile_update", profile_update_node)
    
    # Placeholder nodes (to be replaced with actual subgraphs)
    def upload_resume_placeholder(state: CareerLMState) -> CareerLMState:
        messages = state.get("messages", [])
        messages.append("[PLACEHOLDER] upload_resume")
        state["messages"] = messages
        state["waiting_for_user"] = True
        state["waiting_for_input_type"] = "resume_upload"
        return state

    def fix_resume_placeholder(state: CareerLMState) -> CareerLMState:
        messages = state.get("messages", [])
        messages.append("[PLACEHOLDER] fix_resume")
        state["messages"] = messages
        state["fix_resume_complete"] = True
        state["waiting_for_user"] = True
        state["waiting_for_input_type"] = "fix_resume_instructions"
        return state

    def interview_prep_placeholder(state: CareerLMState) -> CareerLMState:
        messages = state.get("messages", [])
        messages.append("[PLACEHOLDER] interview_prep")
        state["messages"] = messages
        state["interview_prep_complete"] = True
        return state

    def cold_email_placeholder(state: CareerLMState) -> CareerLMState:
        messages = state.get("messages", [])
        messages.append("[PLACEHOLDER] cold_email")
        state["messages"] = messages
        state["cold_email_complete"] = True
        return state

    def bullet_rewrite_placeholder(state: CareerLMState) -> CareerLMState:
        messages = state.get("messages", [])
        messages.append("[PLACEHOLDER] bullet_rewrite_questions")
        state["messages"] = messages
        state["bullet_rewrite_complete"] = True
        state["waiting_for_user"] = True
        state["waiting_for_input_type"] = "bullet_rewrite_answers"
        return state

    def study_plan_placeholder(state: CareerLMState) -> CareerLMState:
        messages = state.get("messages", [])
        messages.append("[PLACEHOLDER] study_plan")
        state["messages"] = messages
        state["study_plan_complete"] = True
        return state

    def skill_gap_analysis_placeholder(state: CareerLMState) -> CareerLMState:
        messages = state.get("messages", [])
        messages.append("[PLACEHOLDER] skill_gap_analysis")
        state["messages"] = messages
        state["skill_gap_complete"] = True
        return state

    def idle_placeholder(state: CareerLMState) -> CareerLMState:
        messages = state.get("messages", [])
        messages.append("[PLACEHOLDER] idle")
        state["messages"] = messages
        return state

    workflow.add_node("upload_resume", upload_resume_placeholder)
    workflow.add_node("fix_resume", fix_resume_placeholder)
    workflow.add_node("interview_prep", interview_prep_placeholder)
    workflow.add_node("cold_email", cold_email_placeholder)
    workflow.add_node("bullet_rewrite_questions", bullet_rewrite_placeholder)
    workflow.add_node("study_plan", study_plan_placeholder)
    workflow.add_node("skill_gap_analysis", skill_gap_analysis_placeholder)
    workflow.add_node("idle", idle_placeholder)
    
    # ===== EDGES =====
    workflow.set_entry_point("supervisor")
    
    # Conditional routing based on supervisor's decision
    def route_from_supervisor(state: CareerLMState) -> str:
        phase = state.get("current_phase", "idle")
        return phase
    
    workflow.add_conditional_edges(
        "supervisor",
        route_from_supervisor,
        {
            "upload_resume": "upload_resume",
            "fix_resume": "fix_resume",
            "interview_prep": "interview_prep",
            "cold_email": "cold_email",
            "bullet_rewrite_questions": "bullet_rewrite_questions",
            "study_plan": "study_plan",
            "skill_gap_analysis": "skill_gap_analysis",
            "idle": "idle",
            # NEW: resume_analysis routes to wrapper, not directly to supervisor
            "resume_analysis": "resume_analysis_wrapper",
        }
    )
    
    # Resume analysis flow: wrapper → profile update → supervisor
    workflow.add_edge("resume_analysis_wrapper", "profile_update")
    workflow.add_edge("profile_update", "supervisor")
    
    # All other specialists route back to supervisor for re-evaluation
    workflow.add_edge("upload_resume", "supervisor")
    workflow.add_edge("fix_resume", "supervisor")
    workflow.add_edge("interview_prep", "supervisor")
    workflow.add_edge("cold_email", "supervisor")
    workflow.add_edge("bullet_rewrite_questions", "supervisor")  # After user answers
    workflow.add_edge("study_plan", "supervisor")
    workflow.add_edge("skill_gap_analysis", "supervisor")
    workflow.add_edge("idle", END)
    
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
    
    print("  → Graph compiled with recursion limit protection")
    return app


# Create singleton with checkpointing enabled
print("Creating orchestrator_graph singleton...")
orchestrator_graph = create_orchestrator_graph(use_checkpointer=True)
print("orchestrator_graph ready!")
