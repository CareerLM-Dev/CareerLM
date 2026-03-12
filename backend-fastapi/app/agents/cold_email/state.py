"""
State definition for Cold Email agent workflow
"""

from typing import TypedDict, Optional, List, Dict


class ColdEmailState(TypedDict):
    """State for cold email generation workflow"""
    
    # Input
    user_name: str
    user_skills: List[str]
    user_experience: Optional[str]
    target_company: str
    target_role: str
    job_description: Optional[str]
    company_info: Optional[str]  # Info about the company
    resume_text: Optional[str]  # Full resume text
    projects_section: Optional[str]  # Parsed projects section
    template_subject: Optional[str]  # Saved template subject
    template_body: Optional[str]  # Saved template body
    outreach_type: Optional[str]  # Type: referral, recruiter, alumni, internship, general
    tone: Optional[str]  # Tone: professional or casual
    format_type: Optional[str]  # Format: email or message
    form_data: Optional[Dict]  # Additional outreach-specific data
    
    # Output
    email_subject: Optional[str]
    email_body: Optional[str]
    personalization_notes: Optional[str]
    
    # Metadata
    error: Optional[str]
