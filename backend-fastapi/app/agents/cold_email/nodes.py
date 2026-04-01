# app/agents/cold_email/nodes.py

from typing import Dict, Any
from app.agents.llm_config import RESUME_LLM
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
    template_subject = state.get("template_subject") or ""
    template_body = state.get("template_body") or ""
    outreach_type = state.get("outreach_type", "general")
    tone = state.get("tone", "professional")
    format_type = state.get("format_type", "email")
    form_data = state.get("form_data", {})

    # Organize skills
    skills_str = ', '.join(skills[:10]) if skills else 'various technical skills'
    
    # Build outreach-specific context
    outreach_context = ""
    greeting = "Hello [Hiring Manager],"
    
    if outreach_type == "referral":
        recipient_name = form_data.get("recipientName", "")
        recipient_position = form_data.get("recipientPosition", "")
        mutual_connection = form_data.get("mutualConnection", "")
        
        # Build context based on what info is provided
        recipient_info = ""
        if recipient_name and recipient_position:
            greeting = f"Hi {recipient_name},"
            recipient_info = f"- Recipient: {recipient_name}, {recipient_position} at {target_company}"
        elif recipient_name:
            greeting = f"Hi {recipient_name},"
            recipient_info = f"- Recipient: {recipient_name} at {target_company}"
        else:
            greeting = "Hello,"
            recipient_info = f"- Company: {target_company}"
        
        outreach_context = f"""
OUTREACH TYPE: Referral Request
{recipient_info}
- Role You're Targeting: {target_role}
- Mutual Connection: {mutual_connection if mutual_connection else 'None provided'}
- Goal: {"Ask " + recipient_name if recipient_name else "Request a referral"} for the {target_role} position

SPECIAL INSTRUCTIONS FOR REFERRAL:
- Open with warm, conversational tone (even if professional)
- If recipient name is known, address them directly and warmly
- If mutual connection exists, mention them in first sentence naturally
- Express genuine interest in the role and company
- Highlight 2-3 most relevant qualifications
- Politely ask if they'd be willing to refer you
- Keep it concise ({'50-80 words' if format_type == 'message' else '150-200 words'})
"""
    elif outreach_type == "recruiter":
        recipient_name = form_data.get("recipientName", "")
        team_domain = form_data.get("teamDomain", "")
        company_reason = form_data.get("companyReason", "")
        
        if recipient_name:
            greeting = f"Hi {recipient_name},"
        else:
            greeting = "Hello,"
            
        outreach_context = f"""
OUTREACH TYPE: Direct Outreach (Recruiter/General Application)
- Recipient: {recipient_name if recipient_name else 'General/Unknown'}
- Company: {target_company}
- Role: {target_role}
- Team/Domain: {team_domain if team_domain else 'Not specified'}
- Why This Company: {company_reason if company_reason else 'Not specified'}
- Goal: Express interest in the {target_role} position directly

SPECIAL INSTRUCTIONS FOR DIRECT OUTREACH:
- Be brief and to-the-point (busy recipients)
- Open with clear intent: interested in {target_role}
- Highlight 2-3 key qualifications that match the role
- If team_domain provided, mention specific interest in that team
- If company_reason provided, incorporate it authentically
- Mention 1 standout achievement or project
- End with clear CTA: available to discuss, resume attached/available
- Keep it very concise ({'50-80 words' if format_type == 'message' else '100-150 words'})
- Professional and direct tone
"""
    elif outreach_type == "alumni":
        recipient_name = form_data.get("recipientName", "[Alumni Name]")
        recipient_role = form_data.get("recipientRole", "")
        recipient_company = form_data.get("recipientCompany", target_company)
        reachout_reason = form_data.get("reachoutReason", "")
        greeting = f"Hi {recipient_name},"
        
        role_info = f", {recipient_role}" if recipient_role else ""
        outreach_context = f"""
OUTREACH TYPE: Alumni Networking
- Recipient: {recipient_name}{role_info} at {recipient_company}
- Shared Background: Alumni connection
- Reason for Reaching Out: {reachout_reason if reachout_reason else 'Career advice and insights'}
- Goal: Build genuine connection, seek advice about {recipient_company} or career path

SPECIAL INSTRUCTIONS FOR ALUMNI:
- Warm, friendly tone - emphasize shared alumni connection
- Show genuine curiosity about their career journey
- If reason provided, weave it naturally into message
- Ask thoughtful question about their experience
- Be humble and open to learning
- Don't immediately ask for job/referral - focus on connection
- Keep it conversational ({'60-90 words' if format_type == 'message' else '150-200 words'})
"""
    else:  # general
        outreach_context = f"""
OUTREACH TYPE: General Cold Email
- Goal: Express interest in opportunities at {target_company}

SPECIAL INSTRUCTIONS:
- Professional, direct approach
- Clear subject line
- Brief introduction with relevant qualifications
- Express interest in company and role
- Call to action
"""
    
    # Tone guidance
    tone_guidance = ""
    if tone == "casual":
        tone_guidance = """
TONE: Casual Professional
- Use contractions (I'm, I'd, I've)
- Conversational language
- Warm and friendly but respectful
- Avoid overly formal phrases
"""
    else:  # professional
        tone_guidance = """
TONE: Professional
- Clear and polished language
- Respectful and direct
- No slang or overly casual phrases
"""
    
    # Format guidance
    format_guidance = ""
    if format_type == "message":
        format_guidance = """
FORMAT: LinkedIn/Direct Message
- NO SUBJECT LINE needed (messages don't have subject lines)
- CRITICAL: Keep it VERY short: 50-100 words maximum
- Get straight to the point in the first sentence
- Use short paragraphs (1-2 sentences each)
- More conversational, less formal structure
- Optimize for mobile reading
- End with a simple, direct ask or question
"""
    else:  # email
        format_guidance = """
FORMAT: Professional Email
- Include a compelling subject line (ONE LINE, under 60 chars - no line breaks)
- Structured format with clear opening, body, closing
- Can be slightly longer (100-200 words)
- Professional email format
"""
    
    # Build context-rich prompt using actual resume data
    template_section = ""
    if template_subject or template_body:
        template_section = f"""
SAVED TEMPLATE (use structure + tone, update details with latest resume data):
SUBJECT: {template_subject or '[Use your own subject if missing]'}
BODY:
{template_body or '[No template body provided]'}
"""

    prompt = f"""
Write a personalized cold {"email" if format_type == "email" else "message"} using ONLY the information provided from the candidate's actual resume. DO NOT generate, invent, or create any fake projects, experiences, or details.

CANDIDATE INFORMATION:
- Name: {user_name}
- Skills: {skills_str}
- Experience Summary: {experience if experience else 'See resume text below'}

--- ACTUAL RESUME CONTENT ---
{resume_text if resume_text else 'No full resume text provided'}

--- PROJECTS SECTION FROM RESUME ---
{projects_section if projects_section else 'No projects section provided'}
--- END RESUME CONTENT ---

{outreach_context}

{tone_guidance}

{format_guidance}

{template_section}

TARGET POSITION:
- Company: {target_company}
- Role: {target_role}
- Job Description: {job_desc if job_desc else 'Not provided'}

GENERAL STRUCTURE:
1. Start with: {greeting}
2. Opening: Context-appropriate introduction based on outreach type
3. Qualifications: Mention 2-4 most relevant skills/experiences from resume
4. Value/Interest: Why {target_company} and how you can contribute
5. Closing: Clear, appropriate call to action for the outreach type

CRITICAL RULES:
- Use ONLY information present in the resume text provided
- Extract and use real project names and descriptions from the resume
- DO NOT create fictional projects or experiences
- DO NOT include any phone numbers or email addresses; use [YOUR-NUMBER] and [YOUR-EMAIL] placeholders
- Follow the outreach type instructions carefully
- Match the specified tone (casual or professional)
- STRICTLY follow format guidelines ({'MESSAGE format: 50-100 words, NO subject line' if format_type == 'message' else 'EMAIL format: include subject line (ONE LINE ONLY), 100-200 words'})
- Subject line must be a SINGLE line with NO line breaks
- If a saved template is provided, keep its structure and tone while updating details
- If information is missing, keep that section brief and general
- No bold, italics, or markdown formatting
- Do not use em dashes

{'' if format_type == 'message' else f'Generate a subject line (under 60 chars) appropriate for the {outreach_type} outreach type.'}

Output format:
{'' if format_type == 'message' else 'SUBJECT: [your subject line - ONE LINE ONLY, max 60 characters]\\n\\n'}BODY:
[complete {'message' if format_type == 'message' else 'email'} body using actual resume content]

IMPORTANT: The subject line MUST be a single line, no line breaks. Keep it under 60 characters.
"""

    response = RESUME_LLM.invoke(prompt)
    email_content = response.content if hasattr(response, 'content') else str(response)
    
    logger.info(f"[Cold Email] LLM response length: {len(email_content)} chars")
    
    # Parse subject and body based on format
    if format_type == "message":
        # Messages don't have subject lines
        body = email_content.replace("BODY:", "").strip()
        subject = ""
        logger.info("[Cold Email] Generated message (no subject)")
    else:
        # Emails have subject lines - extract carefully
        parts = email_content.split("BODY:", 1)
        
        if len(parts) > 1:
            # Extract subject (everything before BODY:)
            subject_part = parts[0].replace("SUBJECT:", "").strip()
            # Take only the first line as subject (in case LLM added extra content)
            subject = subject_part.split('\n')[0].strip()
            # Ensure subject is max 60 chars
            if len(subject) > 60:
                logger.warning(f"[Cold Email] Subject too long ({len(subject)} chars), truncating")
                subject = subject[:57] + "..."
            body = parts[1].strip()
            logger.info(f"[Cold Email] Generated email - Subject: '{subject}' ({len(subject)} chars)")
        else:
            # Fallback if format is wrong
            logger.warning("[Cold Email] LLM didn't follow format, using fallback parsing")
            lines = email_content.split('\n')
            subject = lines[0].replace("SUBJECT:", "").strip()[:60]
            body = '\n'.join(lines[1:]).strip()
            logger.info(f"[Cold Email] Fallback subject: '{subject}'")

    body = _sanitize_contact_details(body)
    body = body.replace("—", "-")
    
    # Final cleanup for subject line
    if subject:
        # Remove any newlines or extra whitespace from subject
        subject = " ".join(subject.split())
        # Ensure it's truly one line and under 60 chars
        subject = subject[:60].strip()
        logger.info(f"[Cold Email] Final subject after cleanup: '{subject}' ({len(subject)} chars)")

    return {
        "email_subject": subject,
        "email_body": body
    }