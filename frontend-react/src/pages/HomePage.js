import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { supabase } from "../api/supabaseClient";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Circle,
  FileText,
  Mail,
  Mic,
  Sparkles,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";

const TRACK_SUMMARIES = {
  exploring:
    "You're just getting started - let's figure out what to learn and build first.",
  applying:
    "You're actively applying. Let's get your resume sharp and your outreach going.",
  interview_upcoming:
    "You have an interview coming up. Let's make sure you're ready.",
  building:
    "You're building your skills and portfolio. Let's make sure you're working on the right things.",
};

const MODULES = {
  resume: {
    id: "resume",
    title: "Resume Analyzer",
    description: "Upload your resume and get ATS-focused feedback with clear improvements.",
    cta: "Open Resume Analyzer",
    route: "/dashboard/resume-analyzer",
    icon: FileText,
  },
  skill_gap: {
    id: "skill_gap",
    title: "Skill Gap Analysis",
    description: "Compare your profile against your target role and close key gaps.",
    cta: "Open Skill Gap",
    route: "/dashboard/skill-gap",
    icon: BarChart3,
  },
  interview: {
    id: "interview",
    title: "Interview Prep",
    description: "Practice questions and sharpen answers before your interview.",
    cta: "Start Interview Prep",
    route: "/dashboard/mock-interview",
    icon: Mic,
  },
  outreach: {
    id: "outreach",
    title: "Cold Email Outreach",
    description: "Generate personalized outreach emails to connect with recruiters.",
    cta: "Open Outreach",
    route: "/dashboard/cold-email",
    icon: Mail,
  },
  study: {
    id: "study",
    title: "Study Plan",
    description: "Build a focused roadmap for what to learn and build next.",
    cta: "Open Study Plan",
    route: "/dashboard/study-planner",
    icon: BookOpen,
  },
};

const SECONDARY_BY_TRACK = {
  exploring: ["study", "skill_gap", "resume"],
  applying: ["resume", "outreach", "interview"],
  interview_upcoming: ["resume", "study"],
  building: ["skill_gap", "resume", "outreach"],
};

function HomePage() {
  const { session } = useUser();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [orchestratorState, setOrchestratorState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stateFallbackNotice, setStateFallbackNotice] = useState(false);
  const [interviewDate, setInterviewDate] = useState("");

  const getFirstName = () => {
    const metadataName =
      session?.user?.user_metadata?.full_name ||
      session?.user?.user_metadata?.name ||
      "";

    if (metadataName) {
      return metadataName.trim().split(" ")[0];
    }

    const emailName = session?.user?.email?.split("@")[0] || "there";
    return emailName;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      if (!session) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data: profileData, error } = await supabase
          .from("user")
          .select("questionnaire_answers, user_profile")
          .eq("id", session.user.id)
          .single();

        if (error) throw error;

        setUserProfile(profileData || null);
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }

      try {
        const response = await fetch(
          `http://localhost:8000/api/v1/orchestrator/state/${session.user.id}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`State fetch failed with status ${response.status}`);
        }

        const payload = await response.json();
        setOrchestratorState(payload?.data || payload || null);
        setStateFallbackNotice(false);
      } catch (stateError) {
        console.error("Error fetching orchestrator state:", stateError);
        setOrchestratorState(null);
        setStateFallbackNotice(true);
      }
    };

    fetchUserData();
  }, [session]);

  const track =
    userProfile?.questionnaire_answers?.status ||
    userProfile?.questionnaire_answers?.track ||
    "exploring";
  const normalizedTrack = TRACK_SUMMARIES[track] ? track : "exploring";
  const targetRole = userProfile?.questionnaire_answers?.target_role;
  const targetRoleLabel = useMemo(() => {
    if (!targetRole) return "";

    if (typeof targetRole === "string") {
      return targetRole.replace(/_/g, " ");
    }

    if (Array.isArray(targetRole)) {
      return targetRole
        .map((item) => {
          if (typeof item === "string") return item.replace(/_/g, " ");
          if (item && typeof item === "object") {
            return (
              item.label ||
              item.name ||
              item.value ||
              item.role ||
              item.target_role ||
              ""
            )
              .toString()
              .replace(/_/g, " ");
          }
          return "";
        })
        .filter(Boolean)
        .join(", ");
    }

    if (typeof targetRole === "object") {
      const derived =
        targetRole.label ||
        targetRole.name ||
        targetRole.value ||
        targetRole.role ||
        targetRole.target_role;
      return derived ? derived.toString().replace(/_/g, " ") : "";
    }

    return "";
  }, [targetRole]);

  const resumeScore = useMemo(() => {
    const raw = orchestratorState?.resume_analysis?.overall_score;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }, [orchestratorState]);

  const scoreHistory = Array.isArray(orchestratorState?.profile?.score_history)
    ? orchestratorState.profile.score_history
    : [];

  const resumeAnalyzed =
    Boolean(orchestratorState?.resume_analysis_complete) || resumeScore !== null;
  const hasResumeUploaded = resumeAnalyzed || scoreHistory.length > 0;

  const primaryAction = useMemo(() => {
    if (normalizedTrack === "exploring") {
      if (!hasResumeUploaded) {
        return {
          moduleId: "study",
          headline: "Let's map out what you should learn",
          context:
            "A focused study plan helps you build momentum before resume pressure starts.",
          cta: "Create Study Plan",
        };
      }

      return {
        moduleId: "skill_gap",
        headline: "See what skills you're missing",
        context:
          "Now that we have your baseline, let's find the highest-impact skills for your target role.",
        cta: "Run Skill Gap Analysis",
      };
    }

    if (normalizedTrack === "applying") {
      if (!resumeAnalyzed) {
        return {
          moduleId: "resume",
          headline: "Upload your resume to get started",
          context:
            "We'll score it and identify what to fix before you send more applications.",
          cta: "Upload Resume",
        };
      }

      if ((resumeScore ?? 0) < 75) {
        return {
          moduleId: "resume",
          headline: "Improve your resume",
          context: `Your resume scored ${Math.round(
            resumeScore ?? 0
          )}/100. Let's improve it before your next round of applications.`,
          cta: "Improve Resume",
        };
      }

      return {
        moduleId: "outreach",
        headline: "Start your outreach sprint",
        context:
          "Your resume is in a strong place. Now focus on high-quality cold email outreach.",
        cta: "Generate Outreach Emails",
      };
    }

    if (normalizedTrack === "interview_upcoming") {
      return {
        moduleId: "interview",
        headline: "Start your interview preparation",
        context:
          "We'll focus your prep on likely questions and concise, high-impact answers.",
        cta: "Begin Interview Prep",
      };
    }

    return {
      moduleId: "study",
      headline: "Let's plan what to build and learn next",
      context:
        "A clear build-and-learn plan keeps your projects aligned with your target role.",
      cta: "Build Your Plan",
    };
  }, [hasResumeUploaded, normalizedTrack, resumeAnalyzed, resumeScore]);

  const primaryModule = MODULES[primaryAction.moduleId];

  const secondaryModules = useMemo(() => {
    const ids = SECONDARY_BY_TRACK[normalizedTrack] || SECONDARY_BY_TRACK.exploring;
    return ids
      .filter((id) => id !== primaryAction.moduleId)
      .slice(0, 3)
      .map((id) => MODULES[id]);
  }, [normalizedTrack, primaryAction.moduleId]);

  const phaseContext = `${orchestratorState?.current_phase || ""} ${
    orchestratorState?.supervisor_decision || ""
  }`.toLowerCase();

  const progressItems = [
    { key: "resume", label: "Resume", complete: resumeAnalyzed },
    {
      key: "skill_gap",
      label: "Skill Gap",
      complete: /skill[_\s-]?gap/.test(phaseContext),
    },
    {
      key: "interview",
      label: "Interview",
      complete: /interview/.test(phaseContext),
    },
    {
      key: "outreach",
      label: "Outreach",
      complete: /cold[_\s-]?email|outreach/.test(phaseContext),
    },
    {
      key: "study",
      label: "Study Plan",
      complete: /study|planner/.test(phaseContext),
    },
  ];

  const handleModuleNavigate = (module) => {
    navigate(module.route);
  };

  if (loading) {
    return (
      <div className="flex h-full bg-background">
        <main className="flex-1 overflow-auto no-scrollbar">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-20 animate-pulse">
            <div className="h-7 w-2/3 bg-muted rounded mb-3" />
            <div className="h-5 w-4/5 bg-muted rounded mb-10" />

            <div className="h-56 bg-card border border-border rounded-xl mb-8" />

            <div className="grid md:grid-cols-3 gap-4 mb-10">
              <div className="h-44 bg-card border border-border rounded-xl" />
              <div className="h-44 bg-card border border-border rounded-xl" />
              <div className="h-44 bg-card border border-border rounded-xl" />
            </div>

            <div className="h-20 bg-card border border-border rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  const firstName = getFirstName();
  const summaryLine = TRACK_SUMMARIES[normalizedTrack];

  return (
    <div className="flex h-full bg-background">
      <main className="w-full overflow-auto no-scrollbar">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pb-20">
          {/* Section 1 - Personalized greeting */}
          <section className="mb-8">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                    Welcome back, {firstName}.
                  </h1>
                  <p className="text-foreground">
                    {summaryLine}
                    {targetRoleLabel ? ` Target role: ${targetRoleLabel}.` : ""}
                  </p>
                  {orchestratorState?.supervisor_decision && (
                    <p className="text-sm text-muted-foreground">
                      {orchestratorState.supervisor_decision}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {stateFallbackNotice && (
            <Alert className="mb-6 border-primary/20 bg-primary/5 text-foreground">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertDescription>
                We could not load your latest orchestrator state, so recommendations are based on your onboarding track.
              </AlertDescription>
            </Alert>
          )}

          {/* Section 2 - Primary action */}
          <section className="mb-8">
            <div className="bg-card border-2 border-primary/30 rounded-xl p-6 md:p-7">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                <div className="space-y-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <primaryModule.icon className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-xs uppercase tracking-wide font-semibold text-primary">
                    Recommended next step
                  </p>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                    {primaryAction.headline}
                  </h2>
                  <p className="text-muted-foreground max-w-2xl">{primaryAction.context}</p>

                  {primaryAction.moduleId === "interview" && (
                    <div className="pt-2 space-y-2">
                      <label className="text-sm font-medium text-foreground" htmlFor="interview-date">
                        Interview date (optional)
                      </label>
                      <input
                        id="interview-date"
                        value={interviewDate}
                        onChange={(e) => setInterviewDate(e.target.value)}
                        placeholder="Set inside Interview Prep when ready"
                        className="w-full md:w-80 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                      />
                      <p className="text-xs text-muted-foreground">
                        You can finalize and manage interview dates inside the Interview Prep module.
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={() => handleModuleNavigate(primaryModule)}
                    className="mt-2"
                    size="lg"
                  >
                    {primaryAction.cta}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>

                {resumeScore !== null && (
                  <div className="flex md:justify-end">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-center min-w-[120px]">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                        Resume Score
                      </p>
                      <p className="text-3xl font-bold text-primary">
                        {Math.round(resumeScore)}
                        <span className="text-sm text-muted-foreground">/100</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Section 3 - Secondary modules */}
          <section className="mb-10">
            <div className="mb-3">
              <h3 className="text-xl font-bold text-foreground">Other relevant modules</h3>
              <p className="text-sm text-muted-foreground">
                Keep moving with these supporting actions based on your current track.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {secondaryModules.map((module) => {
                const Icon = module.icon;
                return (
                  <div
                    key={module.id}
                    className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <h4 className="text-lg font-semibold text-foreground">{module.title}</h4>
                      <p className="text-sm text-muted-foreground">{module.description}</p>
                    </div>

                    <Button
                      variant="outline"
                      className="mt-5 w-full"
                      onClick={() => handleModuleNavigate(module)}
                    >
                      {module.cta}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 4 - Progress indicator */}
          <section>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-sm font-semibold text-foreground mb-4">Your module progress</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {progressItems.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    {item.complete ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className={item.complete ? "text-foreground" : "text-muted-foreground"}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default HomePage;
