"""
Mock Interview workflow graphs
Question generation and feedback generation flows
"""

from langgraph.graph import StateGraph, END
from .nodes import (
    prepare_context_node,
    generate_questions_node,
    validate_questions_node,
    build_transcript_node,
    generate_feedback_node
)
from .state import InterviewState
import logging

logger = logging.getLogger(__name__)


def create_question_generation_workflow():
    """
    Create workflow for generating interview questions
    
    Flow:
    START → Prepare Context → Generate Questions → Validate Questions → END
    
    Returns:
        Compiled workflow that accepts InterviewState
    """
    workflow = StateGraph(InterviewState)
    
    # Add nodes
    workflow.add_node("prepare_context", prepare_context_node)
    workflow.add_node("generate_questions", generate_questions_node)
    workflow.add_node("validate_questions", validate_questions_node)
    
    # Define flow
    workflow.set_entry_point("prepare_context")
    workflow.add_edge("prepare_context", "generate_questions")
    workflow.add_edge("generate_questions", "validate_questions")
    workflow.add_edge("validate_questions", END)
    
    # Compile workflow
    app = workflow.compile()
    
    logger.info("Question generation workflow created")
    return app


def create_feedback_generation_workflow():
    """
    Create workflow for generating interview feedback
    
    Flow:
    START → Build Transcript → Generate Feedback → END
    
    Note: Does not need prepare_context as feedback flow uses questions/answers directly
    
    Returns:
        Compiled workflow that accepts InterviewState
    """
    workflow = StateGraph(InterviewState)
    
    # Add nodes
    workflow.add_node("build_transcript", build_transcript_node)
    workflow.add_node("generate_feedback", generate_feedback_node)
    
    # Define flow
    workflow.set_entry_point("build_transcript")
    workflow.add_edge("build_transcript", "generate_feedback")
    workflow.add_edge("generate_feedback", END)
    
    # Compile workflow
    app = workflow.compile()
    
    logger.info("Feedback generation workflow created")
    return app


# Create workflow instances
question_generation_workflow = create_question_generation_workflow()
feedback_generation_workflow = create_feedback_generation_workflow()
