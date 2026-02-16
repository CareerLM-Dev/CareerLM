"""
Cold Email workflow graph
Single agent workflow: Writer only
"""

from langgraph.graph import StateGraph, END
from .nodes import writer_agent
from .state import ColdEmailState
import logging

logger = logging.getLogger(__name__)


def create_cold_email_workflow():
    """
    Create a simple workflow for cold email generation
    
    Flow:
    START → Writer Agent → END
    """
    workflow = StateGraph(ColdEmailState)
    
    # Add node
    workflow.add_node("writer", writer_agent)
    
    # Define flow
    workflow.set_entry_point("writer")
    workflow.add_edge("writer", END)
    
    # Compile workflow
    app = workflow.compile()
    
    logger.info("Cold email workflow created: writer only")
    return app


# Create workflow instance
cold_email_workflow = create_cold_email_workflow()
