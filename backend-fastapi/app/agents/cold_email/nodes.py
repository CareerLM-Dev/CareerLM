# app/agents/cold_email/nodes.py

from typing import Dict, Any
from app.agents.llm_config import EMAIL_LLM
from .state import ColdEmailState
import logging
import re

logger = logging.getLogger(__name__)


def _sanitize_contact_details(text: str) -> str:
    text = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[YOUR-EMAIL]", text)
    text = re.sub(r"\+?\d[\d\s().-]{7,}\d", "[YOUR-NUMBER]", text)
    return text


def writer_agent(state: ColdEmailState) -> Dict[str, Any]:
    """
    Agent: Write personalized cold email using actual resume content - NO GENERATION
    """
    logger.info("Writer Agent: Writing cold email from resume content")

    user_name = state["user_name"]
    skills = state.get("user_skills", [])
    experience = state.get("user_experience", "")
    target_company = state["target_company"]
    target_role = state["target_role"]
    job_desc = state.get("job_description", "")
    resume_text = state.get("resume_text", "")
    projects_section = state.get("projects_section", "")

    # Organize skills
    skills_str = ', '.join(skills[:10]) if skills else 'various technical skills'
    
    # Build context-rich prompt using actual resume data
    prompt = f"""
Write a professional, personalized cold email using ONLY the information provided from the candidate's actual resume. DO NOT generate, invent, or create any fake projects, experiences, or details.

CANDIDATE INFORMATION:
- Name: {user_name}
- Skills: {skills_str}
- Experience Summary: {experience if experience else 'See resume text below'}

--- ACTUAL RESUME CONTENT ---
{resume_text if resume_text else 'No full resume text provided'}

--- PROJECTS SECTION FROM RESUME ---
{projects_section if projects_section else 'No projects section provided'}
--- END RESUME CONTENT ---

TARGET POSITION:
- Company: {target_company}
- Role: {target_role}
- Job Description: {job_desc if job_desc else 'Not provided'}

INSTRUCTIONS:
1. Start with "Hello [Hiring Manager],"
2. Opening paragraph: Introduce {user_name} as a professional expressing interest in the {target_role} role at {target_company}
3. Skills paragraph: Mention 3-4 most relevant skills from the provided skills list that match the role
4. Experience paragraph:
    - Use ONLY work experience from the resume text
    - Do NOT mention projects here
    - If no experience exists, keep it brief and general
5. Projects paragraph:
    - Use ONLY the projects section
    - Do NOT mention work experience here
    - If no projects section exists, keep it brief and general
5. Value proposition: Brief statement about interest in {target_company} and how skills align
6. Closing: Professional call to action

CRITICAL RULES:
- Use ONLY information present in the resume text provided
- Extract and use real project names and descriptions from the resume
- DO NOT create fictional projects or experiences
- DO NOT include any phone numbers or email addresses; use [YOUR-NUMBER] and [YOUR-EMAIL] placeholders
- If information is missing, keep that section brief and general
- 200-250 words maximum
- Professional tone
- No bold, italics, or markdown formatting
- Do not use em dashes

Generate a subject line (under 60 chars) specific to {target_company} and {target_role}.

Output format:
SUBJECT: [your subject line]

BODY:
[complete email body using actual resume content]
"""

    response = EMAIL_LLM.invoke(prompt)
    email_content = response.content if hasattr(response, 'content') else str(response)
    
    # Parse subject and body
    parts = email_content.split("BODY:", 1)
    subject = parts[0].replace("SUBJECT:", "").strip()
    body = parts[1].strip() if len(parts) > 1 else email_content

    body = _sanitize_contact_details(body)
    body = body.replace("—", "-")

    return {
        "email_subject": subject,
        "email_body": body
    }
