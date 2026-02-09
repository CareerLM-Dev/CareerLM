# app/agents/llm_config.py
"""
LLM configuration for different modules
Each module can use specialized models based on its needs
"""
from langchain_groq import ChatGroq
import os
from dotenv import load_dotenv

load_dotenv()

# ===== RESUME MODULE (ACTIVE) =====
RESUME_LLM = ChatGroq(
    api_key=os.getenv("GROQ_API_KEY"),
    model="llama-3.1-8b-instant",
    temperature=0.7
)

# ===== SKILL/LEARNING MODULE =====
# SKILL_LLM = ChatGroq(
#     api_key=os.getenv("GROQ_API_KEY"),
#     model="llama-3.1-70b-versatile",  # Better reasoning for skill assessment
#     temperature=0.7
# )

# ===== INTERVIEW MODULE =====
# INTERVIEW_LLM = ChatGroq(
#     api_key=os.getenv("GROQ_API_KEY"),
#     model="llama-3.1-70b-versatile",  # Deep reasoning for questions & evaluation
#     temperature=0.8
# )
# 
# INTERVIEW_SERVICES = {
#     "tts": "openai",  # Text-to-Speech for reading questions
#     "stt": "groq-whisper",  # Speech-to-Text for recording answers
# }

# ===== COLD EMAIL MODULE =====
# EMAIL_LLM = ChatGroq(
#     api_key=os.getenv("GROQ_API_KEY"),
#     model="llama-3.1-8b-instant",  # Fast, creative for email writing
#     temperature=0.9  # Higher creativity for personalization
# )

# ===== STUDY PROGRESS MODULE =====
# PROGRESS_LLM = ChatGroq(
#     api_key=os.getenv("GROQ_API_KEY"),
#     model="llama-3.1-70b-versatile",  # Better knowledge for course recommendations
#     temperature=0.7
# )

# Export active LLMs
__all__ = [
    "RESUME_LLM",
    # "SKILL_LLM",
    # "INTERVIEW_LLM",
    # "EMAIL_LLM",
    # "PROGRESS_LLM",
]
