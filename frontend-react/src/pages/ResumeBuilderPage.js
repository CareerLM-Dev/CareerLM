import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  CheckCircle,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

const emptyEducation = () => ({
  institution: "",
  degree: "",
  date_range: "",
  grade: "",
});

const emptyExperience = () => ({
  title: "",
  company: "",
  location: "",
  date_range: "",
  bullets: [""],
});

const emptyProject = () => ({
  name: "",
  tech_stack: "",
  date_range: "",
  links: "",
  bullets: [""],
});

const emptyForm = {
  contact: {
    name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
  },
  summary: "",
  education: [emptyEducation()],
  experience: [emptyExperience()],
  projects: [emptyProject()],
  skills: [],
  certifications: "",
  coursework: "",
};

function ResumeBuilderPage() {
  const { session, loading: authLoading } = useUser();
  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [skillInput, setSkillInput] = useState("");

  const formattedLastSaved = useMemo(() => {
    if (!lastSaved) return "";
    return lastSaved.toLocaleString();
  }, [lastSaved]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (authLoading) return;
      if (!session) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const response = await axios.get(
          `${API_BASE}/api/v1/user/profile-details`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        const payload = response.data?.data || {};
        let profile = payload.user_profile || {};
        if (typeof profile === "string") {
          try {
            profile = JSON.parse(profile);
          } catch (parseError) {
            profile = {};
          }
        }

        const skillsRaw = profile.skills;
        const skills = Array.isArray(skillsRaw)
          ? skillsRaw
          : typeof skillsRaw === "string"
            ? skillsRaw
                .split(",")
                .map((skill) => skill.trim())
                .filter(Boolean)
            : [];

        const education = Array.isArray(profile.education_entries)
          ? profile.education_entries
          : [];
        const experience = Array.isArray(profile.experience_entries)
          ? profile.experience_entries
          : [];
        const projects = Array.isArray(profile.project_entries)
          ? profile.project_entries
          : [];

        setFormData({
          contact: {
            name: profile.name || "",
            email: profile.email || "",
            phone: profile.phone || "",
            location: profile.location || "",
            linkedin: profile.linkedin || "",
            github: profile.github || "",
          },
          summary: profile.intro || "",
          education: education.length > 0 ? education : [emptyEducation()],
          experience: experience.length > 0 ? experience : [emptyExperience()],
          projects: projects.length > 0 ? projects : [emptyProject()],
          skills,
          certifications: profile.certifications || "",
          coursework: profile.coursework || "",
        });
      } catch (err) {
        console.error("Failed to fetch profile details:", err);
        setError("Unable to load your profile. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [authLoading, session]);

  // Safety timer to prevent stuck loader
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        setLoading(false);
        if (!error && !formData.contact.name) {
          setError("The request is taking longer than expected. Please check your connection or try again.");
        }
      }, 7000); // 7 seconds safety timeout
      return () => clearTimeout(timer);
    }
  }, [loading, error, formData.contact.name]);

  const handleContactChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      contact: {
        ...prev.contact,
        [field]: value,
      },
    }));
  };

  const handleSummaryChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      summary: value,
    }));
  };

  const updateEducation = (index, field, value) => {
    setFormData((prev) => {
      const next = [...prev.education];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, education: next };
    });
  };

  const addEducation = () => {
    setFormData((prev) => ({
      ...prev,
      education: [...prev.education, emptyEducation()],
    }));
  };

  const removeEducation = (index) => {
    setFormData((prev) => {
      const next = prev.education.filter((_, idx) => idx !== index);
      return {
        ...prev,
        education: next.length > 0 ? next : [emptyEducation()],
      };
    });
  };

  const updateExperience = (index, field, value) => {
    setFormData((prev) => {
      const next = [...prev.experience];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, experience: next };
    });
  };

  const addExperience = () => {
    setFormData((prev) => ({
      ...prev,
      experience: [...prev.experience, emptyExperience()],
    }));
  };

  const removeExperience = (index) => {
    setFormData((prev) => {
      const next = prev.experience.filter((_, idx) => idx !== index);
      return {
        ...prev,
        experience: next.length > 0 ? next : [emptyExperience()],
      };
    });
  };

  const updateExperienceBullet = (entryIndex, bulletIndex, value) => {
    setFormData((prev) => {
      const next = [...prev.experience];
      const entry = { ...next[entryIndex] };
      const bullets = [...(entry.bullets || [])];
      bullets[bulletIndex] = value;
      entry.bullets = bullets;
      next[entryIndex] = entry;
      return { ...prev, experience: next };
    });
  };

  const addExperienceBullet = (entryIndex) => {
    setFormData((prev) => {
      const next = [...prev.experience];
      const entry = { ...next[entryIndex] };
      const bullets = [...(entry.bullets || [])];
      bullets.push("");
      entry.bullets = bullets;
      next[entryIndex] = entry;
      return { ...prev, experience: next };
    });
  };

  const removeExperienceBullet = (entryIndex, bulletIndex) => {
    setFormData((prev) => {
      const next = [...prev.experience];
      const entry = { ...next[entryIndex] };
      const bullets = (entry.bullets || []).filter((_, idx) => idx !== bulletIndex);
      entry.bullets = bullets;
      next[entryIndex] = entry;
      return { ...prev, experience: next };
    });
  };

  const updateProject = (index, field, value) => {
    setFormData((prev) => {
      const next = [...prev.projects];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, projects: next };
    });
  };

  const addProject = () => {
    setFormData((prev) => ({
      ...prev,
      projects: [...prev.projects, emptyProject()],
    }));
  };

  const removeProject = (index) => {
    setFormData((prev) => {
      const next = prev.projects.filter((_, idx) => idx !== index);
      return {
        ...prev,
        projects: next.length > 0 ? next : [emptyProject()],
      };
    });
  };

  const updateProjectBullet = (entryIndex, bulletIndex, value) => {
    setFormData((prev) => {
      const next = [...prev.projects];
      const entry = { ...next[entryIndex] };
      const bullets = [...(entry.bullets || [])];
      bullets[bulletIndex] = value;
      entry.bullets = bullets;
      next[entryIndex] = entry;
      return { ...prev, projects: next };
    });
  };

  const addProjectBullet = (entryIndex) => {
    setFormData((prev) => {
      const next = [...prev.projects];
      const entry = { ...next[entryIndex] };
      const bullets = [...(entry.bullets || [])];
      bullets.push("");
      entry.bullets = bullets;
      next[entryIndex] = entry;
      return { ...prev, projects: next };
    });
  };

  const removeProjectBullet = (entryIndex, bulletIndex) => {
    setFormData((prev) => {
      const next = [...prev.projects];
      const entry = { ...next[entryIndex] };
      const bullets = (entry.bullets || []).filter((_, idx) => idx !== bulletIndex);
      entry.bullets = bullets;
      next[entryIndex] = entry;
      return { ...prev, projects: next };
    });
  };

  const handleSkillKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const value = skillInput.trim();
    if (!value) return;
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.includes(value)
        ? prev.skills
        : [...prev.skills, value],
    }));
    setSkillInput("");
  };

  const removeSkill = (skill) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((item) => item !== skill),
    }));
  };

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    setActionError("");
    try {
      const payload = {
        name: formData.contact.name,
        email: formData.contact.email,
        phone: formData.contact.phone,
        location: formData.contact.location,
        linkedin: formData.contact.linkedin,
        github: formData.contact.github,
        intro: formData.summary,
        education_entries: formData.education,
        experience_entries: formData.experience,
        project_entries: formData.projects,
        skills: formData.skills,
        certifications: formData.certifications,
        coursework: formData.coursework,
      };

      await axios.patch(
        `${API_BASE}/api/v1/user/profile-user-profile`,
        { user_profile: payload },
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      setLastSaved(new Date());
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3000);
    } catch (err) {
      console.error("Failed to save profile:", err);
      const message = err?.response?.data?.detail || "Failed to save your profile.";
      setActionError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!session) return;
    setDownloading(true);
    setActionError("");
    try {
      const response = await axios.post(
        `${API_BASE}/api/v1/resume/generate-pdf`,
        { user_id: session.user.id },
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          responseType: "blob",
        }
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "resume.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      const message = err?.response?.data?.detail || "Failed to generate PDF.";
      setActionError(message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full bg-slate-50 animate-pulse">
        <main className="flex-1 overflow-auto no-scrollbar">
          {/* Skeleton Header */}
          <div className="mx-auto w-full max-w-4xl px-4 pt-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
              <div className="h-7 w-48 bg-slate-200 rounded-md"></div>
              <div className="h-4 w-96 max-w-full bg-slate-200 rounded-md"></div>
            </div>
          </div>

          {/* Skeleton Form Sections */}
          <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card border border-border rounded-xl px-6 py-6 space-y-4">
                <div className="h-6 w-40 bg-muted rounded-md mb-2"></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="h-4 w-20 bg-muted rounded-md"></div>
                    <div className="h-10 w-full bg-muted/50 rounded-lg"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-20 bg-muted rounded-md"></div>
                    <div className="h-10 w-full bg-muted/50 rounded-lg"></div>
                  </div>
                </div>
                {i > 2 && (
                  <div className="h-20 w-full bg-muted/30 rounded-lg mt-4"></div>
                )}
              </div>
            ))}
          </div>

          {/* Skeleton Sticky Bottom */}
          <div className="sticky bottom-0 border-t border-border bg-white/95 backdrop-blur px-4 py-4">
            <div className="mx-auto max-w-4xl flex justify-between">
              <div className="h-4 w-32 bg-muted rounded-md"></div>
              <div className="flex gap-3">
                <div className="h-10 w-32 bg-muted rounded-md"></div>
                <div className="h-10 w-32 bg-muted rounded-md"></div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-50">
      <main className="flex-1 overflow-auto no-scrollbar">
        <div className="mx-auto w-full max-w-4xl px-4 pt-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Resume Builder</h1>
            <p className="mt-1 text-sm text-slate-600">
              Fill in your details to generate a professional resume. Skip any
              section you don&apos;t have yet.
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          <form className="space-y-6">
            <section className="bg-card border border-border rounded-xl px-6 py-5">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Contact Information
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Full Name
                  </label>
                  <input
                    value={formData.contact.name}
                    onChange={(event) =>
                      handleContactChange("name", event.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    type="text"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Email
                  </label>
                  <input
                    value={formData.contact.email}
                    onChange={(event) =>
                      handleContactChange("email", event.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    type="email"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Phone
                  </label>
                  <input
                    value={formData.contact.phone}
                    onChange={(event) =>
                      handleContactChange("phone", event.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    type="text"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Location
                  </label>
                  <input
                    value={formData.contact.location}
                    onChange={(event) =>
                      handleContactChange("location", event.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    type="text"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    LinkedIn URL
                  </label>
                  <input
                    value={formData.contact.linkedin}
                    onChange={(event) =>
                      handleContactChange("linkedin", event.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    type="text"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    GitHub URL
                  </label>
                  <input
                    value={formData.contact.github}
                    onChange={(event) =>
                      handleContactChange("github", event.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    type="text"
                  />
                </div>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl px-6 py-5">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Summary (optional)
              </h2>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Professional Summary
                </label>
                <textarea
                  value={formData.summary}
                  onChange={(event) => handleSummaryChange(event.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Optional — a 2-3 sentence overview of your background and goals.
                </p>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl px-6 py-5">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Education
              </h2>
              <div className="space-y-4">
                {formData.education.map((entry, index) => (
                  <div
                    key={`education-${index}`}
                    className="relative border border-border rounded-lg p-4 group"
                  >
                    <button
                      type="button"
                      onClick={() => removeEducation(index)}
                      className="absolute right-3 top-3 text-muted-foreground opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Institution Name
                        </label>
                        <input
                          value={entry.institution || ""}
                          onChange={(event) =>
                            updateEducation(index, "institution", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Degree
                        </label>
                        <input
                          value={entry.degree || ""}
                          onChange={(event) =>
                            updateEducation(index, "degree", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Date Range
                        </label>
                        <input
                          value={entry.date_range || ""}
                          onChange={(event) =>
                            updateEducation(index, "date_range", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          CGPA or Percentage
                        </label>
                        <input
                          value={entry.grade || ""}
                          onChange={(event) =>
                            updateEducation(index, "grade", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addEducation}
                  className="w-full border-2 border-dashed border-border rounded-lg p-3 text-sm font-medium text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Add Education
                  </span>
                </button>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl px-6 py-5">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Experience
              </h2>
              <div className="space-y-4">
                {formData.experience.map((entry, index) => (
                  <div
                    key={`experience-${index}`}
                    className="relative border border-border rounded-lg p-4 group"
                  >
                    <button
                      type="button"
                      onClick={() => removeExperience(index)}
                      className="absolute right-3 top-3 text-muted-foreground opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Job Title
                        </label>
                        <input
                          value={entry.title || ""}
                          onChange={(event) =>
                            updateExperience(index, "title", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Company Name
                        </label>
                        <input
                          value={entry.company || ""}
                          onChange={(event) =>
                            updateExperience(index, "company", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Location
                        </label>
                        <input
                          value={entry.location || ""}
                          onChange={(event) =>
                            updateExperience(index, "location", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Date Range
                        </label>
                        <input
                          value={entry.date_range || ""}
                          onChange={(event) =>
                            updateExperience(index, "date_range", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        Bullet points
                      </p>
                      <div className="space-y-2">
                        {(entry.bullets || []).map((bullet, bulletIndex) => (
                          <div
                            key={`exp-${index}-bullet-${bulletIndex}`}
                            className="group flex items-center gap-2"
                          >
                            <span className="text-lg text-muted-foreground">•</span>
                            <input
                              value={bullet}
                              onChange={(event) =>
                                updateExperienceBullet(
                                  index,
                                  bulletIndex,
                                  event.target.value
                                )
                              }
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                              type="text"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                removeExperienceBullet(index, bulletIndex)
                              }
                              className="text-muted-foreground opacity-0 group-hover:opacity-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addExperienceBullet(index)}
                        className="text-sm text-muted-foreground"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Plus className="h-4 w-4" /> Add bullet point
                        </span>
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addExperience}
                  className="w-full border-2 border-dashed border-border rounded-lg p-3 text-sm font-medium text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Add Experience
                  </span>
                </button>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl px-6 py-5">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Projects
              </h2>
              <div className="space-y-4">
                {formData.projects.map((entry, index) => (
                  <div
                    key={`project-${index}`}
                    className="relative border border-border rounded-lg p-4 group"
                  >
                    <button
                      type="button"
                      onClick={() => removeProject(index)}
                      className="absolute right-3 top-3 text-muted-foreground opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Project Name
                        </label>
                        <input
                          value={entry.name || ""}
                          onChange={(event) =>
                            updateProject(index, "name", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Tech Stack
                        </label>
                        <input
                          value={entry.tech_stack || ""}
                          onChange={(event) =>
                            updateProject(index, "tech_stack", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Date Range
                        </label>
                        <input
                          value={entry.date_range || ""}
                          onChange={(event) =>
                            updateProject(index, "date_range", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Links
                        </label>
                        <input
                          value={entry.links || ""}
                          onChange={(event) =>
                            updateProject(index, "links", event.target.value)
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          type="text"
                        />
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        Bullet points
                      </p>
                      <div className="space-y-2">
                        {(entry.bullets || []).map((bullet, bulletIndex) => (
                          <div
                            key={`proj-${index}-bullet-${bulletIndex}`}
                            className="group flex items-center gap-2"
                          >
                            <span className="text-lg text-muted-foreground">•</span>
                            <input
                              value={bullet}
                              onChange={(event) =>
                                updateProjectBullet(
                                  index,
                                  bulletIndex,
                                  event.target.value
                                )
                              }
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                              type="text"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                removeProjectBullet(index, bulletIndex)
                              }
                              className="text-muted-foreground opacity-0 group-hover:opacity-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addProjectBullet(index)}
                        className="text-sm text-muted-foreground"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Plus className="h-4 w-4" /> Add bullet point
                        </span>
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addProject}
                  className="w-full border-2 border-dashed border-border rounded-lg p-3 text-sm font-medium text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Add Project
                  </span>
                </button>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl px-6 py-5">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Skills
              </h2>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {formData.skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeSkill(skill)}
                        className="text-muted-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  value={skillInput}
                  onChange={(event) => setSkillInput(event.target.value)}
                  onKeyDown={handleSkillKeyDown}
                  placeholder="Type a skill and press Enter"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  type="text"
                />
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl px-6 py-5">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Certifications (optional)
              </h2>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Certifications and Achievements
                </label>
                <textarea
                  value={formData.certifications}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      certifications: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  List certifications, awards, or achievements one per line.
                </p>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl px-6 py-5">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Coursework (optional)
              </h2>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Relevant Coursework
                </label>
                <textarea
                  value={formData.coursework}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      coursework: event.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Optional — list relevant courses separated by commas.
                </p>
              </div>
            </section>
          </form>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {formattedLastSaved ? `Last saved ${formattedLastSaved}` : ""}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="min-w-[140px]"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4" /> Saving
                  </span>
                ) : (
                  "Save Profile"
                )}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="min-w-[140px]"
              >
                {downloading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4" /> Generating
                  </span>
                ) : (
                  "Download PDF"
                )}
              </Button>
              {savedFlash && (
                <span className="inline-flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle className="h-4 w-4" /> Saved
                </span>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ResumeBuilderPage;
