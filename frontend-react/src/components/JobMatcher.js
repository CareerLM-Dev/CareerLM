// src/components/JobMatcher.js
import { useState, useCallback } from "react";
import {
  Search,
  MapPin,
  RefreshCw,
  ExternalLink,
  Briefcase,
  CheckCircle2,
  XCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../api/supabaseClient";

function JobMatcher({ resumeData, setCurrentPage }) {
  const [matchedJobs, setMatchedJobs] = useState([]);
  const [userSkills, setUserSkills] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);
  const [expandedJobs, setExpandedJobs] = useState({});
  const [generatingPlan, setGeneratingPlan] = useState(null);

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  // ── Search: match user skills vs stored jobs ──
  const searchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) {
        setError("Please sign in to use the Job Matcher.");
        return;
      }
      const params = searchQuery.trim()
        ? new URLSearchParams({ role_query: searchQuery.trim() })
        : "";
      const res = await fetch(
        `http://localhost:8000/api/v1/jobs/search${params ? `?${params}` : ""}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Search failed");
      setMatchedJobs(data.matched_jobs || []);
      setUserSkills(data.user_skills || []);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // ── Refresh: ingest fresh jobs from JSearch ──
  const refreshJobs = useCallback(async () => {
    if (!searchQuery.trim()) {
      setError("Enter a role / career to search for jobs.");
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) {
        setError("Please sign in to use the Job Matcher.");
        return;
      }
      const params = new URLSearchParams({ query: searchQuery });
      if (locationFilter.trim()) params.set("location", locationFilter.trim());

      const res = await fetch(
        `http://localhost:8000/api/v1/jobs/refresh?${params.toString()}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Refresh failed");

      // Re-run search to pick up new jobs
      await searchJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [searchQuery, locationFilter, searchJobs]);

  // ── Generate study plan for a job's missing skills ──
  const generateStudyPlan = useCallback(
    async (job) => {
      if (!job.missing_skills?.length) return;
      setGeneratingPlan(job.id);
      try {
        const token = await getAuthToken();
        const formData = new FormData();
        formData.append("target_career", job.title);
        formData.append(
          "missing_skills",
          JSON.stringify(job.missing_skills.slice(0, 7)),
        );
        const headers = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(
          "http://localhost:8000/api/v1/orchestrator/generate-study-materials-simple",
          { method: "POST", body: formData, headers },
        );
        const data = await res.json();
        if (data.success && setCurrentPage) {
          setCurrentPage("study_planner");
        } else {
          setError(data.error || "Failed to generate study plan");
        }
      } catch (err) {
        setError("Error generating study plan. Please try again.");
      } finally {
        setGeneratingPlan(null);
      }
    },
    [setCurrentPage],
  );

  const toggleJob = (id) =>
    setExpandedJobs((prev) => ({ ...prev, [id]: !prev[id] }));

  // ── Match percentage colour ──
  const matchColor = (pct) => {
    if (pct >= 75) return "text-green-600 dark:text-green-400";
    if (pct >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-500 dark:text-red-400";
  };

  const similarityBg = (sim) => {
    if (sim >= 75)
      return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
    if (sim >= 50)
      return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300";
    return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-primary" />
          Job Market Matcher
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Find jobs that match your skills using AI-powered vector search.
          Refresh to fetch the latest postings.
        </p>
      </div>

      {/* ── Search + Refresh bar ── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Role to search (e.g., Software Engineer)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="relative w-full sm:w-44">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Location (optional)"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={refreshJobs}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {refreshing ? "Fetching Jobs..." : "Fetch New Jobs"}
          </button>
          <button
            onClick={searchJobs}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {loading ? "Matching..." : "Find Matches"}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── User skills pills ── */}
      {userSkills.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Your Skills ({userSkills.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {userSkills.map((skill, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {searched && !loading && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {matchedJobs.length > 0
              ? `${matchedJobs.length} job${matchedJobs.length > 1 ? "s" : ""} matched \u2022 Sorted by relevance`
              : "No matching jobs found. Try fetching new jobs for a different role."}
          </p>

          {matchedJobs.map((job) => {
            const isExpanded = expandedJobs[job.id];
            return (
              <div
                key={job.id}
                className="bg-card border border-border rounded-xl overflow-hidden transition-shadow hover:shadow-md"
              >
                {/* Card header */}
                <button
                  onClick={() => toggleJob(job.id)}
                  className="w-full flex items-start justify-between p-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">
                        {job.title}
                      </h3>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${similarityBg(
                          job.similarity,
                        )}`}
                      >
                        {job.similarity}% match
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                      {job.company && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3.5 h-3.5" />
                          {job.company}
                        </span>
                      )}
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {job.location}
                        </span>
                      )}
                      {job.salary_range && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5" />
                          {job.salary_range}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-2 mt-1">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Skill pills (always visible) */}
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {job.matching_skills?.map((s, i) => (
                    <span
                      key={`m-${i}`}
                      className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {s}
                    </span>
                  ))}
                  {job.missing_skills?.map((s, i) => (
                    <span
                      key={`x-${i}`}
                      className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 font-medium"
                    >
                      <XCircle className="w-3 h-3" />
                      {s}
                    </span>
                  ))}
                </div>

                {/* Expanded section */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/20">
                    {/* Description excerpt */}
                    {job.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {job.description}
                      </p>
                    )}

                    {/* Skill match summary */}
                    <div className="flex items-center gap-4 text-sm">
                      <span
                        className={`font-semibold ${matchColor(job.match_percentage)}`}
                      >
                        {job.match_percentage}% skill overlap
                      </span>
                      <span className="text-muted-foreground">
                        {job.matching_skills?.length || 0}/
                        {job.required_skills?.length || 0} skills
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {job.job_url && (
                        <a
                          href={job.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View / Apply
                        </a>
                      )}
                      {job.missing_skills?.length > 0 && (
                        <button
                          onClick={() => generateStudyPlan(job)}
                          disabled={generatingPlan === job.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {generatingPlan === job.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <BookOpen className="w-3.5 h-3.5" />
                          )}
                          {generatingPlan === job.id
                            ? "Generating..."
                            : `Study Plan (${job.missing_skills.length} skills)`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {!searched && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <Briefcase className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm max-w-md">
            Enter a role above and click <strong>Fetch New Jobs</strong> to pull
            the latest postings, then <strong>Find Matches</strong> to see how
            your skills align.
          </p>
        </div>
      )}
    </div>
  );
}

export default JobMatcher;
