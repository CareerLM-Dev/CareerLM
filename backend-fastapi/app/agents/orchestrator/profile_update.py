"""
Profile update node.

Builds user profile passively from every interaction.
Most importantly: computes score delta (55 → 71) that motivates re-engagement.

After resume analysis completes, this node:
1. Gets the new score
2. Compares to previous score (from score_history)
3. Calculates delta
4. Updates profile.score_history with new entry
5. Merges new skills and gaps found
6. Updates best_score_ever
"""

from app.agents.orchestrator.state import CareerLMState
from datetime import datetime


def profile_update_node(state: CareerLMState) -> CareerLMState:
    """
    Update user profile based on latest analysis results.
    
    Runs after resume_analysis_wrapper_node completes.
    """
    
    print("[PROFILE_UPDATE] Entered profile_update_node")
    
    messages = state.get("messages", [])
    profile = state.get("profile", {}) or {}
    resume_analysis = state.get("resume_analysis", {}) or {}
    
    # ===== GET LATEST SCORE =====
    
    new_score = resume_analysis.get("overall_score")
    
    if new_score is None:
        messages.append("[PROFILE_UPDATE] No overall_score in resume_analysis, skipping profile update")
        state["messages"] = messages
        return state
    
    messages.append(f"[PROFILE_UPDATE] Updating profile with new score: {new_score}")
    
    # ===== GET SCORE HISTORY =====
    
    score_history = profile.get("score_history", [])
    
    # Calculate delta: difference from last score
    score_delta = None
    if score_history and len(score_history) > 0:
        last_entry = score_history[-1]
        last_score = last_entry.get("score")
        if last_score is not None:
            score_delta = new_score - last_score
            messages.append(f"[PROFILE_UPDATE] Score delta: {last_score} → {new_score} (Δ {score_delta:+d})")
    else:
        messages.append(f"[PROFILE_UPDATE] First resume upload, no delta yet")
    
    # ===== ADD NEW SCORE TO HISTORY =====
    
    new_history_entry = {
        "timestamp": datetime.now().isoformat(),
        "score": new_score,
        "delta": score_delta,
        "role_analyzed": resume_analysis.get("analyzed_for_role"),
    }
    
    score_history.append(new_history_entry)
    
    # ===== UPDATE BEST SCORE EVER =====
    
    best_score = profile.get("best_score_ever")
    if best_score is None or new_score > best_score:
        profile["best_score_ever"] = new_score
        messages.append(f"[PROFILE_UPDATE] New best score: {new_score}")
    
    # ===== MERGE SKILLS =====
    
    confirmed_skills = profile.get("confirmed_skills", [])
    new_skills = resume_analysis.get("skill_gaps", [])  # These are skills found in resume
    
    # Add any new skills found
    for skill in new_skills:
        if skill not in confirmed_skills and skill:
            confirmed_skills.append(skill)
    
    if new_skills and len(new_skills) > 0:
        messages.append(f"[PROFILE_UPDATE] Confirmed {len(new_skills)} skills")
    
    # ===== MERGE GAPS =====
    
    known_gaps = profile.get("known_gaps", [])
    new_gaps = resume_analysis.get("critical_fixes", [])  # Critical gaps to fix
    
    # Track recurring gaps (user keeps getting told about same gap)
    for gap in new_gaps:
        if gap not in known_gaps and gap:
            known_gaps.append(gap)
    
    if new_gaps and len(new_gaps) > 0:
        messages.append(f"[PROFILE_UPDATE] Identified {len(new_gaps)} critical gaps")
    
    # ===== UPDATE PROFILE =====
    
    profile["score_history"] = score_history
    profile["confirmed_skills"] = confirmed_skills
    profile["known_gaps"] = known_gaps
    
    state["profile"] = profile
    state["messages"] = messages
    
    print("[PROFILE_UPDATE] Profile updated successfully")
    messages.append("[PROFILE_UPDATE] Profile updated successfully")
    state["messages"] = messages
    
    return state
