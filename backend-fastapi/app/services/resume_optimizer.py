# app/services/resume_optimizer.py
"""
Resume optimization service using simplified 3-agent workflow
Refactored to use centralized ResumeParser for all parsing operations.
"""
from app.agents.resume import resume_workflow
from app.agents.resume.state import ResumeState
from app.services.resume_parser import get_parser


# ===== BACKWARD COMPATIBILITY WRAPPERS =====
# These delegate to ResumeParser for centralized parsing logic

def parse_resume_sections(resume_text):
    """
    Parse resume into common sections.
    
    DEPRECATED: This is a wrapper for backward compatibility.
    Use ResumeParser.parse_sections() directly for new code.
    
    Returns sections with lowercase keys as expected by ats_checker.py.
    """
    parser = get_parser()
    return parser.parse_sections(resume_text)


def extract_text_from_pdf(file_bytes):
    """
    Extract text from PDF file bytes.
    
    DEPRECATED: This is a wrapper for backward compatibility.
    Use ResumeParser.extract_text_from_pdf() directly for new code.
    """
    parser = get_parser()
    return parser.extract_text_from_pdf(file_bytes)


def optimize_resume_logic(resume_content, job_description, filename=None, resume_text=None, sections=None):
    """
    Simplified 3-Agent Version - Uses LangGraph workflow with linear flow.
    Uses centralized ResumeParser for all text extraction and parsing.
    """
    
    # ===== EXTRACT TEXT USING RESUMEPARSER (IF NOT PROVIDED) =====
    parser = get_parser()
    if resume_text is None:
        resume_text = parser.extract_text(resume_content, filename=filename)
    
    # ===== PARSE SECTIONS USING RESUMEPARSER (IF NOT PROVIDED) =====
    # Keep lowercase keys as expected by ats_checker.py
    if sections is None:
        sections = parser.parse_sections(resume_text)
    
    # ===== INITIALIZE STATE (Simplified) =====
    initial_state: ResumeState = {
        # Input
        "resume_text": resume_text,
        "job_description": job_description,
        "resume_sections": sections,

        # ATS Analysis (from Agent 1)
        "ats_score": 0,
        "ats_components": {},
        "ats_justification": [],
        "structure_suggestions": [],
        "needs_template": False,

        # Skill Intelligence (from Agent 2)
        "skills_analysis": [],
        "overall_readiness": "0%",
        "ready_skills": [],
        "critical_gaps": [],
        "learning_priorities": [],

        # Optimization (from Agent 3)
        "honest_improvements": [],
        "learning_roadmap": [],
        "job_readiness_estimate": "",

        # Control
        "next_action": "analyze_resume",
        "completed_steps": [],
        "iteration_count": 0,
        "max_iterations": 3,  # Only 3 agents, no loops
        "messages": []
    }

    
    # ===== RUN THE SIMPLIFIED WORKFLOW =====
    print("\nStarting simplified 3-agent workflow...\n")
    final_state = resume_workflow.invoke(initial_state)
    print(f"\nWorkflow complete! Iterations: {final_state['iteration_count']}\n")
    
    # ===== RETURN RESULTS =====
    return {
        # ATS Analysis
        "ats_score": final_state["ats_score"],
        "ats_analysis": {
            "component_scores": final_state["ats_components"],
            "justification": final_state["ats_justification"],
            "needs_template": final_state["needs_template"]
        },
        
        # Skill Analysis (NEW unified structure)
        "skills_analysis": final_state.get("skills_analysis", []),
        "overall_readiness": final_state.get("overall_readiness", "Unknown"),
        "ready_skills": final_state.get("ready_skills", []),
        "critical_gaps": final_state.get("critical_gaps", []),
        
        # Learning Path
        "learning_priorities": final_state.get("learning_priorities", []),
        "learning_roadmap": final_state.get("learning_roadmap", []),
        "job_readiness_estimate": final_state.get("job_readiness_estimate", ""),
        
        # Suggestions
        "structure_suggestions": final_state.get("structure_suggestions", []),
        "honest_improvements": final_state.get("honest_improvements", []),
        "alignment_suggestions": final_state.get("honest_improvements", []),  # Legacy compatibility
        
        # Legacy fields (for backward compatibility)
        "gaps": final_state.get("critical_gaps", []),
        "user_skills": final_state.get("ready_skills", []),
        "career_matches": [],  # Not used in new version
        
        # Debug/Metadata
        "agent_execution_log": final_state["messages"],
        "total_iterations": final_state["iteration_count"],
        "completed_steps": final_state.get("completed_steps", []),
        
        "_agentic": True,
        "_version": "3.0-simplified"
    }