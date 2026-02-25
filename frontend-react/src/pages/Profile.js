import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";
import { User, FileText, ClipboardList, Pencil, Save, X, Loader2 } from "lucide-react";

const questions = [
  {
    field: "target_role",
    title: "What's Your Target Role?",
    options: [
      { value: "software_engineer", label: "Software Engineer" },
      { value: "data_scientist", label: "Data Scientist" },
      { value: "data_analyst", label: "Data Analyst" },
      { value: "devops_engineer", label: "DevOps Engineer" },
      { value: "full_stack_developer", label: "Full Stack Developer" },
      { value: "ml_engineer", label: "Machine Learning Engineer" },
      { value: "product_manager", label: "Product Manager" },
      { value: "ux_ui_designer", label: "UI/UX Designer" },
      { value: "cloud_architect", label: "Cloud Architect" },
      { value: "cybersecurity_analyst", label: "Cybersecurity Analyst" },
      { value: "business_analyst", label: "Business Analyst" },
      { value: "mobile_developer", label: "Mobile Developer" },
      { value: "undecided", label: "I'm Still Undecided" },
    ],
  },
  {
    field: "primary_goal",
    title: "What's Your Primary Goal?",
    options: [
      { value: "get_first_job", label: "Get My First Tech Job" },
      { value: "switch_careers", label: "Switch to a New Career" },
      { value: "upskill", label: "Upskill in Current Role" },
      { value: "freelance", label: "Start Freelancing" },
      { value: "build_projects", label: "Build Own Projects" },
      { value: "interview_prep", label: "Prepare for Interviews" },
      { value: "learn_technology", label: "Learn a Specific Technology" },
    ],
  },
  {
    field: "learning_preference",
    title: "How Do You Prefer to Learn?",
    options: [
      { value: "video_tutorials", label: "Video Tutorials and Courses" },
      { value: "hands_on", label: "Hands-On Projects and Coding" },
      { value: "reading", label: "Reading and Documentation" },
      { value: "interactive", label: "Interactive Platforms" },
      { value: "mentor", label: "Mentorship and Guidance" },
      { value: "mixed", label: "Mix of Everything" },
    ],
  },
  {
    field: "time_commitment",
    title: "How Much Time Can You Dedicate?",
    options: [
      { value: "5_hours_week", label: "5 hours/week" },
      { value: "10_hours_week", label: "10 hours/week" },
      { value: "20_hours_week", label: "20 hours/week" },
      { value: "30_hours_week", label: "30+ hours/week (Full-time)" },
      { value: "flexible", label: "Flexible/As Available" },
    ],
  },
  {
    field: "year_of_study",
    title: "What Year of Study Are You In?",
    options: [
      { value: "1", label: "Year 1 / Freshman" },
      { value: "2", label: "Year 2 / Sophomore" },
      { value: "3", label: "Year 3 / Junior" },
      { value: "4", label: "Year 4 / Senior (Final Year)" },
      { value: "postgrad", label: "Postgraduate / Masters" },
      { value: "recent_grad", label: "Recent Graduate" },
    ],
  },
];

const profileSections = [
  { key: "intro", title: "Intro / Summary", type: "text" },
  { key: "skills", title: "Skills", type: "skills" },
  { key: "education", title: "Education", type: "text" },
  { key: "projects", title: "Projects", type: "text" },
  { key: "experience", title: "Experience", type: "text" },
  { key: "certifications", title: "Certifications", type: "text" },
  { key: "coursework", title: "Coursework", type: "text" },
  { key: "co_curricular_achievements", title: "Co-curricular Achievements", type: "text" },
];

const stripSectionHeader = (value, sectionKey, title) => {
  if (!value || typeof value !== "string") return value;
  const lines = value.split(/\r?\n/).map((line) => line.trim());
  if (lines.length === 0) return value;

  const headerMap = {
    intro: ["summary", "professional summary", "profile", "objective"],
    skills: ["skills", "technical skills", "core skills"],
    education: ["education", "academic"],
    projects: ["projects", "key projects"],
    experience: ["experience", "work experience", "employment"],
    certifications: ["certifications", "licenses"],
    coursework: ["coursework", "relevant coursework", "courses"],
    co_curricular_achievements: ["awards", "achievements", "honors"],
  };

  const candidates = new Set([
    ...(headerMap[sectionKey] || []),
    (title || "").toLowerCase(),
  ]);

  const first = lines[0].toLowerCase().replace(/[:\-]+$/, "").trim();
  if (candidates.has(first)) {
    return lines.slice(1).join("\n").trim();
  }
  return value;
};

function Profile() {
  const { session, loading: authLoading } = useUser();
  const [profile, setProfile] = useState(null);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState({});
  const [userProfileSections, setUserProfileSections] = useState({});
  const [latestResume, setLatestResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [draftValues, setDraftValues] = useState([]);
  const [savingField, setSavingField] = useState(null);
  const [editingProfileSection, setEditingProfileSection] = useState(null);
  const [draftProfileText, setDraftProfileText] = useState("");
  const [draftSkills, setDraftSkills] = useState([]);
  const [skillInput, setSkillInput] = useState("");
  const [savingProfileSection, setSavingProfileSection] = useState(null);
  const scrollRef = useRef(null);

  const optionsByField = useMemo(() => {
    return questions.reduce((acc, question) => {
      acc[question.field] = question.options.reduce((map, option) => {
        map[option.value] = option.label;
        return map;
      }, {});
      return acc;
    }, {});
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (authLoading) return; // Wait for auth to resolve
      if (!session) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [profileResponse, resumeResponse] = await Promise.all([
          axios.get("http://localhost:8000/api/v1/user/profile-details", {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }),
          axios.get("http://localhost:8000/api/v1/user/history?limit=1", {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }),
        ]);

        const data = profileResponse.data.data;
        setProfile(data);
        setQuestionnaireAnswers(data.questionnaire_answers || {});
        setUserProfileSections(data.user_profile || {});

        const history = resumeResponse.data.data || [];
        setLatestResume(history.length > 0 ? history[0] : null);
      } catch (err) {
        console.error("Failed to fetch profile:", err);
        setError("Unable to load profile right now.");
        setLatestResume(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [session, authLoading]);

  const startEdit = (field) => {
    const current = questionnaireAnswers?.[field] || [];
    const normalized = Array.isArray(current)
      ? current
      : current
      ? [current]
      : [];
    setEditingField(field);
    setDraftValues(normalized);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setDraftValues([]);
  };

  const toggleDraftValue = (value) => {
    const container = scrollRef.current;
    const previousScrollTop = container?.scrollTop ?? 0;
    const previousWindowScroll = window.scrollY;

    setDraftValues((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );

    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = previousScrollTop;
      }
      if (window.scrollY !== previousWindowScroll) {
        window.scrollTo(0, previousWindowScroll);
      }
    });
  };

  const saveAnswers = async (field) => {
    try {
      setSavingField(field);
      const updatedAnswers = {
        ...questionnaireAnswers,
        [field]: draftValues,
      };

      await axios.patch(
        "http://localhost:8000/api/v1/user/profile-questionnaire",
        { questionnaire_answers: updatedAnswers },
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      setQuestionnaireAnswers(updatedAnswers);
      setEditingField(null);
      setDraftValues([]);
    } catch (err) {
      console.error("Failed to update questionnaire:", err);
      setError("Unable to save your changes.");
    } finally {
      setSavingField(null);
    }
  };

  const startProfileEdit = (key) => {
    setEditingProfileSection(key);
    if (key === "skills") {
      const skills = Array.isArray(userProfileSections?.skills)
        ? userProfileSections.skills
        : userProfileSections?.skills
        ? userProfileSections.skills.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      setDraftSkills(skills);
      setSkillInput("");
      setDraftProfileText("");
      return;
    }
    const section = profileSections.find((item) => item.key === key);
    const rawValue = userProfileSections?.[key] || "";
    setDraftProfileText(stripSectionHeader(rawValue, key, section?.title));
    setDraftSkills([]);
    setSkillInput("");
  };

  const cancelProfileEdit = () => {
    setEditingProfileSection(null);
    setDraftProfileText("");
    setDraftSkills([]);
    setSkillInput("");
  };

  const addSkill = () => {
    const cleaned = skillInput.trim();
    if (!cleaned) return;
    if (draftSkills.some((s) => s.toLowerCase() === cleaned.toLowerCase())) {
      setSkillInput("");
      return;
    }
    setDraftSkills((prev) => [...prev, cleaned]);
    setSkillInput("");
  };

  const removeSkill = (value) => {
    setDraftSkills((prev) => prev.filter((s) => s !== value));
  };

  const saveProfileSection = async (key) => {
    try {
      setSavingProfileSection(key);
      const updated = {
        ...userProfileSections,
        [key]: key === "skills" ? draftSkills : draftProfileText.trim(),
      };

      await axios.patch(
        "http://localhost:8000/api/v1/user/profile-user-profile",
        { user_profile: updated },
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      setUserProfileSections(updated);
      setEditingProfileSection(null);
      setDraftProfileText("");
      setDraftSkills([]);
      setSkillInput("");
    } catch (err) {
      console.error("Failed to update profile sections:", err);
      setError("Unable to save your profile sections.");
    } finally {
      setSavingProfileSection(null);
    }
  };

  const formatAnswer = (field) => {
    const values = questionnaireAnswers?.[field] || [];
    const normalized = Array.isArray(values)
      ? values
      : values
      ? [values]
      : [];
    if (normalized.length === 0) {
      return "Not answered";
    }

    return normalized
      .map((value) => optionsByField[field]?.[value] || value)
      .join(", ");
  };

  const formatProfileValue = (key) => {
    if (key === "skills") {
      const skills = Array.isArray(userProfileSections?.skills)
        ? userProfileSections.skills
        : userProfileSections?.skills
        ? userProfileSections.skills.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      return skills.length ? skills : null;
    }
    if (key === "coursework" && !userProfileSections?.coursework && userProfileSections?.coursework_projects) {
      const fallback = userProfileSections.coursework_projects;
      return stripSectionHeader(fallback, key, "Coursework");
    }
    const value = userProfileSections?.[key];
    if (!value || typeof value !== "string" || !value.trim()) return null;
    const section = profileSections.find((item) => item.key === key);
    return stripSectionHeader(value, key, section?.title);
  };

  const statusLabel = (() => {
    if (!profile?.status) return "Not set";
    if (profile.status === "professional" || profile.status === "prof") {
      return "Professional";
    }
    if (profile.status === "student") {
      return "Student";
    }
    return profile.status;
  })();

  const formatDate = (value) => {
    if (!value) return "Not available";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary mb-2">
            Profile
          </p>
          <h1 className="text-3xl font-bold text-foreground">
            Your profile, shaped around your goals
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Review your basics and keep your questionnaire answers fresh as your
            plans evolve.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Basic Details */}
        <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Basic details</h2>
                <p className="text-sm text-muted-foreground">Snapshot of your account details.</p>
              </div>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
              Read-only for now
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 px-6 py-5">
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</span>
              <p className="text-sm font-medium text-foreground">{profile?.name || "Not set"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</span>
              <p className="text-sm font-medium text-foreground">{profile?.email || "Not set"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</span>
              <p className="text-sm font-medium text-foreground">{statusLabel}</p>
            </div>
            {(profile?.status === "professional" || profile?.status === "prof") && (
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current company</span>
                <p className="text-sm font-medium text-foreground">
                  {profile?.current_company || "Not set"}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Latest Resume */}
        <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Latest resume</h2>
              <p className="text-sm text-muted-foreground">Quick snapshot of your most recent upload.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 px-6 py-5">
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">File name</span>
              <p className="text-sm font-medium text-foreground">
                {latestResume?.filename || "No resume uploaded yet"}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Uploaded</span>
              <p className="text-sm font-medium text-foreground">
                {latestResume ? formatDate(latestResume.created_at) : "Not available"}
              </p>
            </div>
          </div>
        </section>

        {/* Questionnaire */}
        <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Questionnaire</h2>
                <p className="text-sm text-muted-foreground">Edit answers to keep recommendations relevant.</p>
              </div>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
              Inline editing
            </span>
          </div>

          <div className="divide-y divide-border">
            {questions.map((question) => (
              <div key={question.field} className="px-6 py-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">{question.title}</h3>
                  {editingField !== question.field && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                      onClick={() => startEdit(question.field)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                </div>

                {editingField === question.field ? (
                  <div className="mt-3 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {question.options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleDraftValue(option.value)}
                          aria-pressed={draftValues.includes(option.value)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                            draftValues.includes(option.value)
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border bg-background hover:border-primary/40 text-muted-foreground"
                          }`}
                        >
                          <div
                            className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              draftValues.includes(option.value)
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {draftValues.includes(option.value) && (
                              <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className="text-sm">{option.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                        onClick={() => saveAnswers(question.field)}
                        disabled={savingField === question.field}
                      >
                        {savingField === question.field ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-3.5 w-3.5" />
                            Save
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                        onClick={cancelEdit}
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{formatAnswer(question.field)}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Resume Profile Sections */}
        <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Resume profile</h2>
                <p className="text-sm text-muted-foreground">Edit section details extracted from your latest resume.</p>
              </div>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
              Inline editing
            </span>
          </div>

          <div className="divide-y divide-border">
            {profileSections.map((section) => {
              const isEditing = editingProfileSection === section.key;
              const displayValue = formatProfileValue(section.key);
              return (
                <div key={section.key} className="px-6 py-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                    {!isEditing && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                        onClick={() => startProfileEdit(section.key)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-3 space-y-4">
                      {section.type === "skills" ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {draftSkills.length > 0 ? (
                              draftSkills.map((skill) => (
                                <span
                                  key={skill}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium"
                                >
                                  {skill}
                                  <button
                                    type="button"
                                    onClick={() => removeSkill(skill)}
                                    className="text-primary/70 hover:text-primary"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">No skills added yet.</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              value={skillInput}
                              onChange={(e) => setSkillInput(e.target.value)}
                              placeholder="Add a skill"
                              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={addSkill}
                              className="px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      ) : (
                        <textarea
                          value={draftProfileText}
                          onChange={(e) => setDraftProfileText(e.target.value)}
                          rows={5}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        />
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                          onClick={() => saveProfileSection(section.key)}
                          disabled={savingProfileSection === section.key}
                        >
                          {savingProfileSection === section.key ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-3.5 w-3.5" />
                              Save
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                          onClick={cancelProfileEdit}
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : section.type === "skills" ? (
                    displayValue ? (
                      <div className="flex flex-wrap gap-2">
                        {displayValue.map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not set</p>
                    )
                  ) : displayValue ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{displayValue}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not set</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Profile;
