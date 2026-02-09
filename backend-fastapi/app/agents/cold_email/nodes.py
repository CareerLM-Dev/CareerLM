# app/agents/cold_email/nodes.py

from typing import Dict, Any
from app.agents.llm_config import EMAIL_LLM
from .state import ColdEmailState
import logging

logger = logging.getLogger(__name__)


def writer_agent(state: ColdEmailState) -> Dict[str, Any]:
    """
    Agent: Write cold email using user template with actual data
    """
    logger.info("Writer Agent: Writing cold email")

    user_name = state["user_name"]
    skills = state.get("user_skills", [])
    experience = state.get("user_experience", "")
    target_company = state["target_company"]
    target_role = state["target_role"]
    job_desc = state.get("job_description", "")

    USER_PROVIDED_TEMPLATE = """
Hello [NAME-OF-THE-INDIVIDUAL],

I am [YOUR-NAME], a [YOUR-YEAR] undergraduate and Software Engineer Intern at [COMPANY-NAME] (if applicable), set to graduate in [GRADUATION-MONTH AND YEAR]. I am actively seeking internships and full-time opportunities. My expertise lies in Full-Stack Web Development, Data Science, Machine Learning, and DevOps. I have experience in product development and research.

In software development, I have built and scaled systems and worked with multiple clients across domains. Below are some deployed projects I have worked on:

Deployed Projects:
- [Project Name] – [Link]
- [Project Name] – [Link]

I would appreciate any suitable openings or referrals you could consider me for.

Best regards,
[YOUR-NAME]
"""

    prompt = f"""
Write a professional cold email for a job application.

USE THIS EXACT TEMPLATE STRUCTURE:
{USER_PROVIDED_TEMPLATE}

KNOWN INFORMATION (fill these in):
- Name: {user_name}
- Skills: {', '.join(skills[:6]) if skills else 'various technical skills'}
- Experience: {experience if experience else 'relevant technical experience'}
- Target Company: {target_company}
- Target Role: {target_role}

RULES:
1. Use the EXACT template structure above
2. Fill in [YOUR-NAME] with {user_name}
3. Fill in skills based on the provided list: {', '.join(skills) if skills else 'technical skills'}
4. Keep [NAME-OF-THE-INDIVIDUAL], [YOUR-YEAR], [COMPANY-NAME], [GRADUATION-MONTH AND YEAR] as placeholders
5. Keep project placeholders as [Project Name] – [Link]
6. Adapt the experience line based on: {experience if experience else 'technical background'}
7. Professional tone, concise, 200-250 words

Also create a subject line for {target_company} {target_role}.

Format as:
SUBJECT: [subject line under 60 chars]

BODY:
[email body]
"""

    response = EMAIL_LLM.invoke(prompt)
    email_content = response.content if hasattr(response, 'content') else str(response)
    
    # Parse subject and body
    parts = email_content.split("BODY:", 1)
    subject = parts[0].replace("SUBJECT:", "").strip()
    body = parts[1].strip() if len(parts) > 1 else email_content

    return {
        "email_subject": subject,
        "email_body": body
    }
