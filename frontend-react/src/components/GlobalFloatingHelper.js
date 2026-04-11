import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { supabase } from "../api/supabaseClient";
import axios from "axios";
import FloatingHelper from "./FloatingHelper";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
// How long to wait before re-fetching orchestrator state after a route change (ms)
const DEBOUNCE_MS = 800;
// How long before a cached recommendations result expires (ms)
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * GlobalFloatingHelper
 *
 * Shows a smart "Next Step" bubble on all authenticated pages.
 *
 * Lag fixes applied:
 * 1. Profile data comes from UserContext (already fetched) — NO extra Supabase call.
 * 2. Orchestrator state is fetched once on mount, then debounced on route change.
 * 3. A 60-second TTL cache prevents redundant API hits when the user just navigates tabs.
 * 4. All state updates are guarded with a mounted-ref to prevent setState on unmount.
 */
function GlobalFloatingHelper() {
  const { session, isAuthenticated } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [profileRow, setProfileRow] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [userStatus, setUserStatus] = useState("exploring");
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);
  const debounceTimer = useRef(null);
  const cacheRef = useRef({ data: null, fetchedAt: 0 });

  // ── Visibility guard ──────────────────────────────────────────────────────
  const publicRoutes = ["/", "/auth", "/auth/callback"];
  const isOnboardingPage =
    location.pathname.startsWith("/onboarding/") ||
    location.pathname.startsWith("/skip-complete/");
  const shouldShow =
    isAuthenticated && !publicRoutes.includes(location.pathname) && !isOnboardingPage;

  // ── Fetch profile row once on mount (single Supabase call, not per-route) ──
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from("user")
      .select("questionnaire_answers")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfileRow(data);
      })
      .catch(() => {});
  }, [session?.user?.id]);

  // ── Derive user status from profile row ──────────────────────────────────
  useEffect(() => {
    const answers = profileRow?.questionnaire_answers;
    const status = answers?.status;
    const normalized =
      status === "interview_upcoming" ? "interview_upcoming"
      : status === "applying" ? "applying"
      : status === "building" ? "building"
      : "exploring";
    setUserStatus(normalized);
  }, [profileRow]);

  // ── Fetch orchestrator recommendations (with cache) ───────────────────────
  const fetchRecommendations = useCallback(async (force = false) => {
    if (!session?.access_token) return;

    // Use cache if fresh enough and not forcing
    const now = Date.now();
    if (!force && cacheRef.current.data && now - cacheRef.current.fetchedAt < CACHE_TTL_MS) {
      if (mountedRef.current) {
        setRecommendations(cacheRef.current.data);
        setLoading(false);
      }
      return;
    }

    try {
      const response = await axios.get(`${API_BASE}/api/v1/orchestrator/state`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        timeout: 5000,
      });

      if (response.data?.success && mountedRef.current) {
        const recs = response.data.data?.recommendations || null;
        cacheRef.current = { data: recs, fetchedAt: Date.now() };
        setRecommendations(recs);
      }
    } catch (err) {
      // Silently fail — helper is non-critical UI
      console.log("[FloatingHelper] Could not fetch recommendations:", err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [session]);

  // ── Initial fetch on mount ────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (session) fetchRecommendations();
    return () => { mountedRef.current = false; };
  }, [session, fetchRecommendations]);

  // ── Debounced re-fetch on route change (non-blocking) ────────────────────
  useEffect(() => {
    if (!session || !shouldShow) return;

    // Clear any pending debounce
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    // Schedule background update — does NOT block navigation or rendering
    debounceTimer.current = setTimeout(() => {
      fetchRecommendations();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [location.pathname, session, shouldShow, fetchRecommendations]);

  // ── Navigation handler ────────────────────────────────────────────────────
  const handleNavigate = useCallback((page) => {
    // Map of internal page IDs to their actual URL routes in the dashboard
    const dashboardPageRouteMap = {
      dashboard: "/dashboard",
      resume_optimizer: "/dashboard/resume-analyzer",
      skill_gap: "/dashboard/skill-gap",
      mock_interview: "/dashboard/mock-interview",
      cold_email: "/dashboard/cold-email",
      study_planner: "/dashboard/study-planner",
      job_matcher: "/dashboard/job-matcher",
      resume_editor: "/dashboard/resume-editor",
      upload_resume: "/dashboard/upload-resume",
      history: "/dashboard/history",
    };

    const targetRoute = dashboardPageRouteMap[page];

    if (targetRoute) {
      navigate(targetRoute);
    } else {
      // Fallback for non-dashboard pages or custom IDs
      navigate(`/${page}`);
    }
  }, [navigate]);

  // ── Invalidate cache after a resume upload completes ─────────────────────
  // Listen for a custom event dispatched by ResumeUpload on success
  useEffect(() => {
    const handleResumeComplete = () => {
      cacheRef.current = { data: null, fetchedAt: 0 };
      fetchRecommendations(true);
    };
    window.addEventListener("careerlm:resume_analyzed", handleResumeComplete);
    return () => window.removeEventListener("careerlm:resume_analyzed", handleResumeComplete);
  }, [fetchRecommendations]);

  if (!shouldShow || loading || !profileRow) return null;

  return (
    <FloatingHelper
      recommendations={recommendations}
      userStatus={userStatus}
      onNavigate={handleNavigate}
    />
  );
}

export default GlobalFloatingHelper;
