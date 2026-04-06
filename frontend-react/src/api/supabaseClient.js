import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "careerlm-auth",
  },
});

// ── Study Planner API helpers ───────────────────────────────────────────────

const API_BASE = "http://localhost:8000/api/v1/orchestrator";

/**
 * Fetch all cached study plans for the authenticated user.
 * Returns both standard and quick_prep plans merged into a flat array.
 */
export async function fetchAllStudyPlans(token) {
  const res = await fetch(`${API_BASE}/study-materials-cache`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

/**
 * Generate a Quick Prep day-by-day plan via LangGraph.
 * @param {string} token - Supabase access token
 * @param {object} opts
 * @param {string} opts.targetCareer
 * @param {string} opts.quickGoal
 * @param {number} opts.deadlineDays  (1-31)
 * @param {string} [opts.specificRequirements]
 */
export async function generateQuickPlan(token, { targetCareer, quickGoal, deadlineDays, specificRequirements = "" }) {
  const formData = new FormData();
  formData.append("target_career", targetCareer);
  formData.append("quick_goal", quickGoal);
  formData.append("deadline_days", String(deadlineDays));
  if (specificRequirements) formData.append("specific_requirements", specificRequirements);

  const res = await fetch(`${API_BASE}/generate-quick-plan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return res.json();
}

/**
 * Delete a study plan of a specific type for the authenticated user.
 * (Calls the existing DELETE /study-materials-cache/{career} endpoint;
 *  plan_type filtering is handled server-side via the unique constraint)
 * @param {string} token
 * @param {string} targetCareer
 */
export async function deleteStudyPlan(token, targetCareer) {
  const res = await fetch(
    `${API_BASE}/study-materials-cache/${encodeURIComponent(targetCareer)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.json();
}

/**
 * Delete only the quick_prep plan for a career.
 * Uses the same DELETE endpoint; the backend filters by plan_type.
 * @param {string} token
 * @param {string} targetCareer
 */
export async function cancelQuickPlan(token, targetCareer) {
  const res = await fetch(
    `${API_BASE}/study-materials-cache/${encodeURIComponent(targetCareer)}?plan_type=quick_prep`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.json();
}
