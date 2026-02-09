# app/services/resume_optimizer.py
"""
Resume optimization service using simplified 3-agent workflow
"""
import re
import pdfplumber
import io
from app.agents.resume import resume_workflow
from app.agents.resume.state import ResumeState


def parse_resume_sections(resume_text):
    """Parse resume into common sections"""
    sections = {
        "Contact": "",
        "Summary": "", 
        "Experience": "", 
        "Education": "",
        "Skills": "", 
        "Projects": "",
        "Certifications": "",
        "Other": ""
    }
    
    current = "Other"
    for line in resume_text.splitlines():
        line = line.strip()
        if not line:
            continue
            
        # Try to identify section headers
        if re.match(r"contact|email|phone|address", line, re.I):
            current = "Contact"
        elif re.match(r"summary|objective|profile", line, re.I):
            current = "Summary"
        elif re.match(r"experience|work|employment|job", line, re.I):
            current = "Experience"
        elif re.match(r"education|degree|university|college|school", line, re.I):
            current = "Education"
        elif re.match(r"skills?|technologies|tools|languages", line, re.I):
            current = "Skills"
        elif re.match(r"projects?|portfolio", line, re.I):
            current = "Projects"
        elif re.match(r"certifications?|licenses", line, re.I):
            current = "Certifications"
            
        # Add content to the current section
        sections[current] += line + "\n"
    
    return sections


def extract_text_from_pdf(file_bytes):
    """Extract text from PDF file bytes"""
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""
    return text


def optimize_resume_logic(resume_content, job_description, filename=None):
    """
    Simplified 3-Agent Version - Uses LangGraph workflow with linear flow
    """
    
    # ===== EXTRACT TEXT =====
    if filename and filename.lower().endswith('.pdf'):
        resume_text = extract_text_from_pdf(resume_content)
    else:
        try:
            resume_text = resume_content.decode("utf-8")
        except Exception:
            resume_text = str(resume_content)
    
    # ===== PARSE SECTIONS =====
    sections = parse_resume_sections(resume_text)
    
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
    print("\n🚀 Starting simplified 3-agent workflow...\n")
    final_state = resume_workflow.invoke(initial_state)
    print(f"\n✅ Workflow complete! Iterations: {final_state['iteration_count']}\n")
    
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