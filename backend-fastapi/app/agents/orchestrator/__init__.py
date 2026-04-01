"""
Orchestrator module — supervisor-driven multi-agent system.

Central decision-making layer that routes all specialists and maintains
the unified CareerLMState across all interactions.
"""

from app.agents.orchestrator.state import (
    CareerLMState,
    UserProfile,
    ActiveJob,
    ResumeAnalysisResults,
    InterviewPrepResults,
    ColdEmailResults,
    StudyPlanResults,
    BulletRewriteRequest,
)
from app.agents.orchestrator.nodes import supervisor_node
from app.agents.orchestrator.profile_update import profile_update_node
from app.agents.orchestrator.checkpointer import SupabaseCheckpointer

# NOTE: orchestrator_graph and resume_analysis_wrapper_node are intentionally
# NOT re-exported here to avoid circular imports.
# (resume/graph.py → orchestrator/__init__ → resume/orchestrator_wrapper → resume/graph.py)
# Import them directly from their respective modules where needed:
#   from app.agents.orchestrator.graph import orchestrator_graph
#   from app.agents.resume.orchestrator_wrapper import resume_analysis_wrapper_node

__all__ = [
    "CareerLMState",
    "UserProfile",
    "ActiveJob",
    "ResumeAnalysisResults",
    "InterviewPrepResults",
    "ColdEmailResults",
    "StudyPlanResults",
    "BulletRewriteRequest",
    "supervisor_node",
    "profile_update_node",
    "SupabaseCheckpointer",
]
