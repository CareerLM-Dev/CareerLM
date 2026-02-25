# app/agents/resume/graph.py
"""
Linear Resume Workflow — Career Advisor Framework
Flow: Structure & Completeness → Relevance & Keywords → Impact & Specificity
"""

from langgraph.graph import StateGraph, END
from app.agents.resume.state import ResumeState
from app.agents.resume.nodes import (
    structure_completeness_agent,
    relevance_agent,
    impact_advisor_agent,
)


def create_resume_workflow():
    """Creates a simple linear 3-agent workflow."""
    print("Building Resume workflow (career advisor framework)...")

    workflow = StateGraph(ResumeState)

    workflow.add_node("structure_completeness", structure_completeness_agent)
    workflow.add_node("relevance", relevance_agent)
    workflow.add_node("impact_advisor", impact_advisor_agent)

    workflow.set_entry_point("structure_completeness")
    workflow.add_edge("structure_completeness", "relevance")
    workflow.add_edge("relevance", "impact_advisor")
    workflow.add_edge("impact_advisor", END)
    
    # ===== COMPILE =====
    print("  → Compiling graph...")
    app = workflow.compile()
    print("Resume workflow ready! (3 agents, linear flow)")
    
    return app


# Create singleton
print("Creating resume_workflow singleton...")
resume_workflow = create_resume_workflow()
print("resume_workflow ready!")