# app/agents/llm_config.py
"""
LLM configuration for different modules
Each module can use specialized models based on its needs.
All LLM / API clients are defined here so the rest of the codebase
just imports them instead of creating its own instances.
"""
from langchain_groq import ChatGroq
from groq import Groq
from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

# ──────────────────────────────────────────────
# Raw Groq client (used by services & agents
# that call client.chat.completions.create())
# ──────────────────────────────────────────────
GROQ_CLIENT = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ──────────────────────────────────────────────
# Gemini client (used by study planner for
# Google Search grounding)
# ──────────────────────────────────────────────
_gemini_key = os.getenv("GEMINI_API_KEY")
GEMINI_CLIENT = genai.Client(api_key=_gemini_key) if _gemini_key else None

# ──────────────────────────────────────────────
# LangChain-wrapped LLMs (used by LangGraph agents)
# ──────────────────────────────────────────────

# ===== RESUME MODULE =====
RESUME_LLM = ChatGroq(
    api_key=os.getenv("GROQ_API_KEY"),
    model="llama-3.1-8b-instant",
    temperature=0.7
)

# ===== COLD EMAIL MODULE =====
EMAIL_LLM = ChatGroq(
    api_key=os.getenv("OSS_API_KEY"),
    model="openai/gpt-oss-20b",
    temperature=0.9
)

# ──────────────────────────────────────────────
# Model name constants (for services that pass
# the model name to GROQ_CLIENT manually)
# ──────────────────────────────────────────────
GROQ_DEFAULT_MODEL = "llama-3.1-8b-instant"
GROQ_PLANNING_MODEL = "mixtral-8x7b-32768"
GEMINI_MODEL = "gemini-2.0-flash"

# Export active objects
__all__ = [
    "GROQ_CLIENT",
    "GEMINI_CLIENT",
    "RESUME_LLM",
    "EMAIL_LLM",
    "GROQ_DEFAULT_MODEL",
    "GROQ_PLANNING_MODEL",
    "GEMINI_MODEL",
]
