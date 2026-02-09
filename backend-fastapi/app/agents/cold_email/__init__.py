"""
Cold Email Agent Module
Generates personalized cold emails for job applications
"""

from .graph import create_cold_email_workflow
from .state import ColdEmailState

__all__ = ["create_cold_email_workflow", "ColdEmailState"]
