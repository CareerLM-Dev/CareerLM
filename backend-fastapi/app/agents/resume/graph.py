# app/agents/resume/graph.py
"""
Simplified Linear Resume Workflow (3 agents, no complex routing)
Flow: Resume Analyzer → Skill Intelligence → Optimization Advisor → Done
"""

from langgraph.graph import StateGraph, END
from app.agents.resume.state import ResumeState
from app.agents.resume.nodes import (
    resume_analyzer_agent,
    skill_intelligence_agent,
    optimization_advisor_agent
)


def create_resume_workflow():
    """
    Creates a simple linear workflow with 3 agents.
    No coordinator needed - just sequential execution.
    """
    
    print("🔧 Building simplified Resume workflow...")
    
    workflow = StateGraph(ResumeState)
    
    # ===== ADD 3 AGENTS =====
    print("  → Adding resume_analyzer node")
    workflow.add_node("resume_analyzer", resume_analyzer_agent)
    
    print("  → Adding skill_intelligence node")
    workflow.add_node("skill_intelligence", skill_intelligence_agent)
    
    print("  → Adding optimization_advisor node")
    workflow.add_node("optimization_advisor", optimization_advisor_agent)
    
    # ===== LINEAR FLOW (NO BRANCHING) =====
    print("  → Setting up linear flow: analyzer → skills → advisor → end")
    workflow.set_entry_point("resume_analyzer")
    workflow.add_edge("resume_analyzer", "skill_intelligence")
    workflow.add_edge("skill_intelligence", "optimization_advisor")
    workflow.add_edge("optimization_advisor", END)
    
    # ===== COMPILE =====
    print("  → Compiling graph...")
    app = workflow.compile()
    print("✓ Resume workflow ready! (3 agents, linear flow)")
    
    return app


# Create singleton
print("📦 Creating resume_workflow singleton...")
resume_workflow = create_resume_workflow()
print("✓ resume_workflow ready!")
resume_workflow = create_resume_workflow()
print("✓ resume_workflow ready!")