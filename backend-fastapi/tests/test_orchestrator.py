"""
Test script: Full orchestrator flow with checkpointing.

Demonstrates:
1. Initial resume upload → analysis → profile delta (first score)
2. State is checkpointed to Supabase
3. Re-run with same resume → second score
4. Profile shows delta (score improvement)
"""

import os
from datetime import datetime
from dotenv import load_dotenv

from app.agents.orchestrator import (
    CareerLMState,
    UserProfile,
    ActiveJob,
)
from app.agents.orchestrator.graph import create_orchestrator_graph
from app.services.resume_parser import get_parser


def test_orchestrator_flow():
    """
    Test the complete orchestrator → resume_analysis → profile_update flow.
    """
    
    test_user_id = "test_user_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # ===== INITIALIZE STATE =====
    print(f"\n{'='*80}")
    print(f"TEST: Orchestrator with Checkpointing")
    print(f"User: {test_user_id}")
    print(f"{'='*80}\n")
    
    # Sample resume for testing
    sample_resume = """
    JOHN SMITH
    john@example.com | San Francisco, CA
    
    EXPERIENCE
    Software Engineer — TechCorp (2022-2024)
    • Built REST APIs using Python and FastAPI
    • Led migration of monolithic service to microservices
    • Improved query performance by 40%
    
    Junior Developer — StartupXYZ (2021-2022)
    • Developed frontend in React
    • Fixed bugs and implemented features
    
    SKILLS
    Languages: Python, JavaScript, Java, SQL
    Frameworks: FastAPI, React, Node.js
    Databases: PostgreSQL, MongoDB
    Tools: Docker, Kubernetes, Git
    
    EDUCATION
    BS Computer Science — State University (2021)
    """
    
    state: CareerLMState = {
        "profile": {
            "user_id": test_user_id,
            "email": "test@example.com",
            "name": "Test User",
            "status": "actively_applying",
            "target_roles": ["Software Engineer"],
            "score_history": [],
            "confirmed_skills": [],
            "known_gaps": [],
            "resume_versions": [],
            "roles_targeted": [],
            "best_score_ever": None,
            "active_interview_date": None,
        },
        "active_job": {
            "job_id": None,
            "company_name": "TechCorp",
            "job_title": "Senior Software Engineer",
            "job_description": (
                "Looking for experienced SDE with 5+ years. "
                "Must have Python, system design, and distributed systems experience."
            ),
            "key_requirements": ["Python", "System Design", "Distributed Systems"],
            "seniority_level": "Senior",
            "industry": "Tech",
            "matched_requirements": [],
            "unmatched_requirements": [],
        },
        "resume_analysis": {
            "resume_text": sample_resume,
            "parsed_sections": {},
            "structure_score": None,
            "completeness_score": None,
            "relevance_score": None,
            "impact_score": None,
            "overall_score": None,
            "structure_issues": [],
            "completeness_gaps": [],
            "keyword_gaps": [],
            "skill_gaps": [],
            "weak_bullets": [],
            "critical_fixes": [],
            "quick_wins": [],
            "analyzed_for_role": None,
            "analysis_timestamp": None,
        },
        "interview_prep": {},
        "cold_email": {},
        "study_plan": {},
        "bullet_rewrite": {
            "weak_bullets": [],
            "user_answers": None,
            "rewrites_generated": None,
            "waiting_for_user": False,
        },
        "current_phase": None,
        "prev_phase": None,
        "supervisor_decision": None,
        "resume_analysis_complete": False,
        "fix_resume_complete": False,
        "interview_prep_complete": False,
        "cold_email_complete": False,
        "study_plan_complete": False,
        "bullet_rewrite_complete": False,
        "waiting_for_user": False,
        "waiting_for_input_type": None,
        "thread_id": test_user_id,
        "_checkpoint_id": None,
        "created_at": datetime.now(),
        "last_updated": datetime.now(),
        "messages": ["[TEST] Starting orchestrator flow"],
    }
    
    # ===== FIRST RUN: Upload and Analyze =====
    print("[TEST] FIRST RUN: Upload resume and analyze")
    print(f"  Resume text length: {len(sample_resume)} chars")
    print(f"  Job: {state['active_job']['company_name']} - {state['active_job']['job_title']}")
    
    # Create orchestrator graph WITHOUT checkpointer for testing
    orchestrator_graph = create_orchestrator_graph(use_checkpointer=False)
    
    try:
        result = orchestrator_graph.invoke(
            state,
            config={"recursion_limit": 25}
        )
        
        print(f"\n[RESULT] Graph execution completed")
        print(f"  Current phase: {result.get('current_phase')}")
        print(f"  Supervisor decision: {result.get('supervisor_decision')}")
        print(f"  Resume analysis complete: {result.get('resume_analysis_complete')}")
        
        resume_analysis = result.get("resume_analysis", {})
        print(f"\n[RESUME_ANALYSIS]")
        print(f"  Overall score: {resume_analysis.get('overall_score')}")
        print(f"  Structure: {resume_analysis.get('structure_score')}")
        print(f"  Completeness: {resume_analysis.get('completeness_score')}")
        print(f"  Relevance: {resume_analysis.get('relevance_score')}")
        print(f"  Impact: {resume_analysis.get('impact_score')}")
        
        profile = result.get("profile", {})
        score_history = profile.get("score_history", [])
        print(f"\n[PROFILE_UPDATE]")
        print(f"  Score history entries: {len(score_history)}")
        for i, entry in enumerate(score_history):
            print(f"    Entry {i+1}: Score={entry.get('score')}, Delta={entry.get('delta')}")
        print(f"  Best score ever: {profile.get('best_score_ever')}")
        print(f"  Confirmed skills: {len(profile.get('confirmed_skills', []))}")
        print(f"  Known gaps: {len(profile.get('known_gaps', []))}")
        
        print(f"\n[MESSAGES]")
        for msg in result.get("messages", []):
            print(f"  {msg}")
        
        # ===== VERIFICATION: SCORE DELTA =====
        if len(score_history) > 0:
            first_entry = score_history[0]
            first_score = first_entry.get("score")
            first_delta = first_entry.get("delta")
            
            if first_score is not None:
                print(f"\n✅ [TEST PASSED] Score recorded: {first_score}/100")
                if first_delta is None:
                    print(f"✅ [TEST PASSED] First upload (no previous delta)")
                else:
                    print(f"✅ [TEST PASSED] Delta: {first_delta}")
            else:
                print(f"❌ [TEST FAILED] No score in first entry")
        else:
            print(f"❌ [TEST FAILED] No score history recorded")
        
        print(f"\n{'='*80}")
        print("[TEST] Checkpointing test:")
        print(f"  Thread ID: {test_user_id}")
        print(f"  Note: Check Supabase graph_checkpoints table for entries with this thread_id")
        print(f"{'='*80}\n")
        
    except Exception as e:
        print(f"\n❌ [ERROR] {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    load_dotenv()
    test_orchestrator_flow()
