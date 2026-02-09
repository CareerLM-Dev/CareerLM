"""
State definition for Cold Email agent workflow
"""

from typing import TypedDict, Optional, List


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
    
    # Output
    email_subject: Optional[str]
    email_body: Optional[str]
    personalization_notes: Optional[str]
    
    # Metadata
    error: Optional[str]
