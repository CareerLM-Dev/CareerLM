import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useUser } from "../context/UserContext";
import {
  User,
  FileText,
  Pencil,
  Save,
  X,
  Loader2,
  ChevronDown,
  Plus,
  Briefcase,
  GraduationCap,
  Target,
  Mail,
  Building2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { ProfileItemCard, AddItemButton } from "../components/ProfileItemCard";
import {
  parseProjects,
  parseExperience,
  serializeProjects,
  serializeExperience,
} from "../utils/profileParser";
import ProfileCompletionWidget from "../components/ProfileCompletionWidget";

const questions = [
  {
    field: "status",
    title: "Where Are You Right Now?",
    subtitle: "Help us understand your current career phase",
    icon: Briefcase,
    options: [
      { value: "exploring", label: "Exploring Options" },
      { value: "applying", label: "Actively Applying" },
      { value: "building", label: "Building Skills" },
      { value: "interview_upcoming", label: "Interview Upcoming" },
    ],
  },
  {
    field: "target_role",
    title: "What's Your Target Role?",
    subtitle: "We'll tailor recommendations to this goal",
    icon: Target,
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
];

const profileSections = [
  { key: "intro", title: "Professional Summary", type: "text", icon: User, description: "A brief overview of your professional background" },
  { key: "areas_of_interest", title: "Areas of Interest", type: "text", icon: Sparkles, description: "Industries and domains you're passionate about" },
  { key: "expertise", title: "Core Expertise", type: "text", icon: CheckCircle2, description: "Your primary areas of specialization" },
  { key: "skills", title: "Technical Skills", type: "skills", icon: Briefcase, description: "Tools, technologies, and competencies" },
  { key: "education", title: "Education", type: "text", icon: GraduationCap, description: "Academic background and qualifications" },
  { key: "projects", title: "Projects", type: "cards", icon: Building2, description: "Key projects you've worked on" },
  { key: "experience", title: "Work Experience", type: "cards", icon: Briefcase, description: "Professional employment history" },
  { key: "certifications", title: "Certifications", type: "text", icon: CheckCircle2, description: "Professional certifications and licenses" },
  { key: "coursework", title: "Relevant Coursework", type: "text", icon: BookOpen, description: "Courses and training completed" },
  {
    key: "co_curricular_achievements",
    title: "Achievements & Awards",
    type: "text",
    icon: Sparkles,
    description: "Recognition, awards, and notable accomplishments"
  },
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

  const first = lines[0]
    .toLowerCase()
    .replace(/[:-]+$/, "")
    .trim();
  if (candidates.has(first)) {
    return lines.slice(1).join("\n").trim();
  }
  return value;
};

const parseSkillsValue = (rawSkills) => {
  const source = Array.isArray(rawSkills)
    ? rawSkills.join(",")
    : typeof rawSkills === "string"
      ? rawSkills
      : "";

  if (!source.trim()) return [];

  const normalized = source
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const parts = normalized
    .split(/[\n,;•]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const cleaned = [];
  const labelTokens = new Set([
    "skills",
    "technical skills",
    "core skills",
    "languages",
    "backend",
    "frontend",
    "databases",
    "tools",
    "ml/ai",
    "ml",
    "ai",
  ]);

  for (let token of parts) {
    token = token.replace(/^[-*–—]\s*/, "").trim();

    // Generic cleanup: remove label fragments ending with ':'
    token = token.replace(/(^|[.])\s*[^:]{1,70}:\s*/g, "$1").trim();

    // If any colon remains, keep only the right-most content.
    if (token.includes(":")) {
      token = token.split(":").pop()?.trim() || "";
    }

    // Remove trailing punctuation-only leftovers.
    token = token.replace(/^[:;,.\-\s]+|[:;,.\-\s]+$/g, "").trim();

    if (!token || labelTokens.has(token.toLowerCase())) continue;
    cleaned.push(token);
  }

  // De-duplicate while preserving order.
  const seen = new Set();
  return cleaned.filter((skill) => {
    const key = skill.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function Profile() {
  const navigate = useNavigate();
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
  const [draftEducationLines, setDraftEducationLines] = useState([]);
  const [skillInput, setSkillInput] = useState("");
  const [savingProfileSection, setSavingProfileSection] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // New state for accordion: multiple sections can be open at once
  const [expandedSections, setExpandedSections] = useState(new Set(["intro"])); 
  const [addingNewItem, setAddingNewItem] = useState({
    key: null,
    isAdding: false,
  });
  const scrollRef = useRef(null);
  const singleSelectFields = new Set(["status"]);

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

        let profileData = data.user_profile || {};
        if (typeof profileData === "string") {
          try {
            profileData = JSON.parse(profileData);
          } catch (parseErr) {
            profileData = {};
          }
        }

        // Fallback: if only resume_parsed_sections exist, map to profile fields.
        if (profileData.resume_parsed_sections && !profileData.intro) {
          const sections = profileData.resume_parsed_sections || {};
          profileData = {
            ...profileData,
            intro: profileData.intro || sections.summary || "",
            skills: profileData.skills || sections.skills || "",
            education: profileData.education || sections.education || "",
            projects: profileData.projects || sections.projects || "",
            experience: profileData.experience || sections.experience || "",
            certifications:
              profileData.certifications || sections.certifications || "",
            coursework: profileData.coursework || sections.coursework || "",
            co_curricular_achievements:
              profileData.co_curricular_achievements || sections.awards || "",
          };
        }

        setUserProfileSections(profileData);

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

    setDraftValues((prev) => {
      if (singleSelectFields.has(editingField)) {
        return [value];
      }
      return prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value];
    });

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
      const skills = parseSkillsValue(userProfileSections?.skills);
      setDraftSkills(skills);
      setSkillInput("");
      setDraftProfileText("");
      setDraftEducationLines([]);
      return;
    }
    if (key === "education") {
      const section = profileSections.find((item) => item.key === key);
      const rawValue = userProfileSections?.[key] || "";
      const normalized = stripSectionHeader(rawValue, key, section?.title);
      const lines = normalized
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      setDraftEducationLines(lines.length ? lines : [""]);
      setDraftProfileText("");
      setDraftSkills([]);
      setSkillInput("");
      return;
    }
    const section = profileSections.find((item) => item.key === key);
    const rawValue = userProfileSections?.[key] || "";
    setDraftProfileText(stripSectionHeader(rawValue, key, section?.title));
    setDraftSkills([]);
    setDraftEducationLines([]);
    setSkillInput("");
  };

  const cancelProfileEdit = () => {
    setEditingProfileSection(null);
    setDraftProfileText("");
    setDraftSkills([]);
    setDraftEducationLines([]);
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
      const educationText =
        key === "education"
          ? draftEducationLines
              .map((line) => line.trim())
              .filter(Boolean)
              .join("\n")
          : null;
      const updated = {
        ...userProfileSections,
        [key]:
          key === "skills"
            ? draftSkills
            : key === "education"
              ? educationText
              : draftProfileText.trim(),
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

  // Handler for saving individual project/experience items
  const handleSaveItem = async (key, updatedItem, originalItem) => {
  try {
    const currentText = userProfileSections?.[key] || "";

    // Preserve original line structure so profile parsers can detect entries reliably.
    const normalizedText = currentText.replace(/\r/g, "").trim();

    const parser = key === "projects" ? parseProjects : parseExperience;
    const serializer =
      key === "projects" ? serializeProjects : serializeExperience;

    const items = parser(normalizedText);

    if (originalItem) {
      const index = items.findIndex(
        (item) =>
          item.title === originalItem.title &&
          item.bullets?.[0] === originalItem.bullets?.[0]
      );

      if (index >= 0) {
        items[index] = updatedItem;
      }
    } else {
      items.push(updatedItem);
      setAddingNewItem({ key: null, isAdding: false });
    }

    const updatedText = serializer(items);

    const updated = {
      ...userProfileSections,
      [key]: updatedText,
    };

    await axios.patch(
      "http://localhost:8000/api/v1/user/profile-user-profile",
      { user_profile: updated },
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    setUserProfileSections(updated);
  } catch (err) {
    console.error(`Failed to update ${key}:`, err);
    setError(`Unable to save your ${key}.`);
  }
};

  // Handler for deleting individual project/experience items
  const handleDeleteItem = async (key, itemToDelete) => {
  try {
    const currentText = userProfileSections?.[key] || "";

    // Preserve original line structure so profile parsers can detect entries reliably.
    const normalizedText = currentText.replace(/\r/g, "").trim();

    const parser = key === "projects" ? parseProjects : parseExperience;
    const serializer =
      key === "projects" ? serializeProjects : serializeExperience;

    const items = parser(normalizedText);

    const filtered = items.filter(
      (item) =>
        item.title !== itemToDelete.title ||
        item.bullets?.[0] !== itemToDelete.bullets?.[0]
    );

    const updatedText = serializer(filtered);

    const updated = {
      ...userProfileSections,
      [key]: updatedText,
    };

    await axios.patch(
      "http://localhost:8000/api/v1/user/profile-user-profile",
      { user_profile: updated },
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    setUserProfileSections(updated);
  } catch (err) {
    console.error(`Failed to delete ${key} item:`, err);
    setError(`Unable to delete ${key} item.`);
  }
};

  // Handler for adding new project/experience
  const handleAddNewItem = (key) => {
    setAddingNewItem({ key, isAdding: true });
  };

  // Handler for canceling add new item
  const handleCancelAddItem = () => {
    setAddingNewItem({ key: null, isAdding: false });
  };

  const formatAnswer = (field) => {
    const values = questionnaireAnswers?.[field] || [];
    const normalized = Array.isArray(values) ? values : values ? [values] : [];
    if (normalized.length === 0) {
      return "Not answered";
    }

    return normalized
      .map((value) => optionsByField[field]?.[value] || value)
      .join(", ");
  };

  const formatProfileValue = (key) => {
    if (key === "skills") {
      const skills = parseSkillsValue(userProfileSections?.skills);
      return skills.length ? skills : null;
    }
    if (
      key === "coursework" &&
      !userProfileSections?.coursework &&
      userProfileSections?.coursework_projects
    ) {
      const fallback = userProfileSections.coursework_projects;
      return stripSectionHeader(fallback, key, "Coursework");
    }
    const value = userProfileSections?.[key];
    if (!value || typeof value !== "string" || !value.trim()) return null;
    const section = profileSections.find((item) => item.key === key);
    return stripSectionHeader(value, key, section?.title);
  };

  const formatEducationCards = () => {
    const value = userProfileSections?.education;
    if (!value || typeof value !== "string" || !value.trim()) return [];
    const normalized = stripSectionHeader(value, "education", "Education");
    const lines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const cards = [];
    for (let i = 0; i < lines.length; i += 2) {
      cards.push({
        title: lines[i],
        subtitle: lines[i + 1] || "",
      });
    }
    return cards;
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

  const toggleSection = (key) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpandedSections(new Set(profileSections.map((s) => s.key)));
  const collapseAll = () => setExpandedSections(new Set());

  const handleResetUploadedData = async () => {
    if (!session?.access_token) return;
    try {
      setIsResetting(true);
      await axios.post(
        "http://localhost:8000/api/v1/user/reset-uploaded-data",
        {},
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      setUserProfileSections({});
      setLatestResume(null);
      setShowResetConfirm(false);
    } catch (err) {
      console.error("Failed to reset uploaded data:", err);
      setError("Unable to reset your uploaded data right now.");
    } finally {
      setIsResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-gray-50 pb-12">
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Start fresh?</h3>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              This will delete your uploaded resume data and clear the resume
              profile sections. This cannot be undone.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="inline-flex items-center justify-center rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetUploadedData}
                disabled={isResetting}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isResetting ? "Clearing..." : "Delete resume data"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Top Banner Cover */}
      <div className="h-48 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
      </div>

      {/* Main Content Container */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: Sidebar */}
          <div className="lg:col-span-4 space-y-4">
            <div className="sticky top-6 space-y-4">
            
            {/* Profile Identity Card */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="h-20 bg-gradient-to-r from-blue-500/20 to-violet-500/20 relative">
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
                  <div className="h-20 w-20 rounded-full border-4 border-white bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                    {profile?.first_name ? profile.first_name.charAt(0).toUpperCase() : (profile?.name ? profile.name.charAt(0).toUpperCase() : <User className="h-8 w-8"/>)}
                  </div>
                </div>
              </div>
              
              <div className="pt-12 pb-6 px-6 text-center">
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                  {profile?.name || "User"}
                </h2>
                <p className="text-sm text-gray-600 mb-3">
                  {profile?.email}
                </p>
                
                <div className="flex justify-center gap-2 mb-4 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700">
                    <Briefcase className="w-3 h-3" />
                    {statusLabel}
                  </span>
                  {questionnaireAnswers?.target_role && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-700">
                      <Target className="w-3 h-3" />
                      {formatAnswer('target_role')}
                    </span>
                  )}
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-200">
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900">
                      {(() => {
                        const exp = userProfileSections?.experience || "";
                        const items = parseExperience(stripSectionHeader(exp, "experience", "Experience") || "");
                        return items.length;
                      })()}
                    </div>
                    <div className="text-xs text-gray-600">Experience</div>
                  </div>
                  <div className="text-center border-x border-gray-200">
                    <div className="text-lg font-bold text-gray-900">
                      {(() => {
                        const proj = userProfileSections?.projects || "";
                        const items = parseProjects(stripSectionHeader(proj, "projects", "Projects") || "");
                        return items.length;
                      })()}
                    </div>
                    <div className="text-xs text-gray-600">Projects</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900">
                      {parseSkillsValue(userProfileSections?.skills).length}
                    </div>
                    <div className="text-xs text-gray-600">Skills</div>
                  </div>
                </div>
              </div>
  
               {/* Resume Metadata */}
               <div className="px-6 pb-6">
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold uppercase text-gray-600 tracking-wider">Latest Resume</p>
                      {/* <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                        Upload New
                      </button> */}
                    </div>
                    <div className="flex items-start gap-3">
                       <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                         <FileText className="h-5 w-5 text-blue-600" />
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {latestResume?.filename || "No resume uploaded"}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {latestResume ? formatDate(latestResume.created_at) : "Upload to get started"}
                          </p>
                       </div>
                       {/* {latestResume && (
                         <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                           <Download className="h-4 w-4 text-gray-600" />
                         </button>
                       )} */}
                    </div>
                  </div>
               </div>
            </div>
  
            {/* Completion Widget */}
            <ProfileCompletionWidget />
            </div>
          </div>
  
          {/* RIGHT COLUMN: Main Content */}
          <div className="lg:col-span-8 space-y-4">
            
            {error && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium shadow-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
  
            {/* Tab Navigation */}
            <div className="bg-white border border-gray-200 rounded-2xl p-1.5 shadow-sm">
              <div className="flex gap-1">
                {[
                  { id: 'basic', label: 'Overview', icon: User },
                  { id: 'questionnaire', label: 'Career Goals', icon: Target },
                  { id: 'resume', label: 'Resume Details', icon: FileText }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200
                        ${isActive 
                          ? 'bg-blue-600 text-white shadow-md' 
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
                      `}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content Area */}
            <div className="min-h-[500px]">
              {/* Basic Information Content */}
              {activeTab === 'basic' && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-300">
                  <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <User className="h-5 w-5 text-blue-600" />
                      Basic Information
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">Your account details and current status</p>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                       <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                         <User className="h-3.5 w-3.5" />
                         Full Name
                       </label>
                       <div className="flex h-11 w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-900">
                         {profile?.name || "Not provided"}
                       </div>
                     </div>
                     
                     <div className="space-y-2">
                       <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                         <Mail className="h-3.5 w-3.5" />
                         Email Address
                       </label>
                       <div className="flex h-11 w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900">
                         {profile?.email || "Not provided"}
                       </div>
                     </div>
      
                     <div className="space-y-2">
                       <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                         <Building2 className="h-3.5 w-3.5" />
                         Current Company
                       </label>
                       <div className="flex h-11 w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900">
                         {profile?.current_company || "Not set"}
                       </div>
                     </div>

                     <div className="space-y-2">
                       <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                         <Target className="h-3.5 w-3.5" />
                         Target Role
                       </label>
                       <div className="flex h-11 w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-900">
                          {questionnaireAnswers?.target_role ? formatAnswer('target_role') : "Not set"} 
                       </div>
                     </div>
                  </div>
                </div>
              )}
    
              {/* Questionnaire Content */}
              {activeTab === 'questionnaire' && (
                <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-300">
                  <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-100">
                          <Target className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-gray-900">
                            Career Goals
                          </h2>
                          <p className="text-sm text-gray-600">
                            Help us personalize your experience
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg"
                        onClick={() => navigate(`/onboarding/${session?.user?.id}`)}
                      >
                        Retake Assessment
                      </button>
                    </div>
                  </div>
        
                  <div className="divide-y divide-gray-200">
                    {questions.map((question) => {
                      const QuestionIcon = question.icon;
                      const isEditing = editingField === question.field;
                      return (
                        <div key={question.field} className="px-6 py-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-gray-100 mt-0.5">
                                <QuestionIcon className="h-4 w-4 text-gray-600" />
                              </div>
                              <div>
                                <h3 className="text-base font-semibold text-gray-900">
                                  {question.title}
                                </h3>
                                <p className="text-sm text-gray-600 mt-0.5">
                                  {question.subtitle}
                                </p>
                              </div>
                            </div>
                            {!isEditing && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg"
                                onClick={() => startEdit(question.field)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                            )}
                          </div>
        
                          {isEditing ? (
                            <div className="mt-4 pl-11 space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {question.options.map((option) => {
                                  const isSelected = draftValues.includes(option.value);
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => toggleDraftValue(option.value)}
                                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                                        isSelected
                                          ? "border-blue-600 bg-blue-50 text-gray-900 shadow-sm"
                                          : "border-gray-200 bg-white hover:border-blue-300 text-gray-700 hover:bg-gray-50"
                                      }`}
                                    >
                                      <div
                                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                          isSelected
                                            ? "border-blue-600 bg-blue-600"
                                            : "border-gray-300"
                                        }`}
                                      >
                                        {isSelected && (
                                          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                                        )}
                                      </div>
                                      <span className="text-sm font-medium">{option.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                                  onClick={() => saveAnswers(question.field)}
                                  disabled={savingField === question.field}
                                >
                                  {savingField === question.field ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Saving...
                                    </>
                                  ) : (
                                    <>
                                      <Save className="h-4 w-4" />
                                      Save Changes
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all"
                                  onClick={cancelEdit}
                                >
                                  <X className="h-4 w-4" />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="pl-11">
                              <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-100 text-violet-800 rounded-lg text-sm font-semibold">
                                {formatAnswer(question.field)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
    
              {/* Resume Profile Content */}
              {activeTab === 'resume' && (
                <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-blue-100">
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                          Resume Profile
                        </h2>
                        <p className="text-sm text-gray-600">
                          Manage your professional details
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors border border-red-200"
                        onClick={() => setShowResetConfirm(true)}
                      >
                        Start fresh
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors border border-blue-200"
                        onClick={expandAll}
                      >
                        Expand All
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors border border-gray-200"
                        onClick={collapseAll}
                      >
                        Collapse All
                      </button>
                    </div>
                  </div>
        
                  <div className="divide-y divide-gray-200">
                    {profileSections.map((section) => {
                      const SectionIcon = section.icon;
                      const isEditing = editingProfileSection === section.key;
                      const displayValue = formatProfileValue(section.key);
                      const isExpanded = expandedSections.has(section.key);

                      return (
                        <div key={section.key} className="transition-all duration-200">
                          {/* Accordion Header */}
                          <div 
                            className={`flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50/70' : ''}`}
                            onClick={() => toggleSection(section.key)}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                                <SectionIcon className="h-4 w-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900">
                                  {section.title}
                                </h3>
                                <p className="text-xs text-gray-600 mt-0.5">
                                  {section.description}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                {section.type === "cards" && !isExpanded && (
                                   <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
                                      {(() => {
                                         const currentText = userProfileSections?.[section.key] || "";
                                          const normalizedCardText = stripSectionHeader(
                                           currentText,
                                           section.key,
                                           section.title
                                          );
                                         const parser = section.key === "projects" ? parseProjects : parseExperience;
                                          return `${parser(normalizedCardText || "").length} items`;
                                      })()}
                                   </span>
                                )}
                                {!isEditing && section.type !== "cards" && isExpanded && (
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        startProfileEdit(section.key);
                                    }}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                </button>
                                )}
                                <div className={`p-1 rounded-lg transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                  <ChevronDown className="h-4 w-4 text-gray-500" />
                                </div>
                            </div>
                          </div>
        
                          {/* Accordion Content */}
                          {isExpanded && (
                            <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
                                {isEditing ? (
                                    <div className="mt-3 space-y-4">
                                    {section.type === "skills" ? (
                                        <div className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            {draftSkills.length > 0 ? (
                                            draftSkills.map((skill) => (
                                                <span
                                                key={skill}
                                                className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-800 px-3 py-1.5 text-sm font-medium border border-blue-200"
                                                >
                                                {skill}
                                                <button
                                                    type="button"
                                                    onClick={() => removeSkill(skill)}
                                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                                </span>
                                            ))
                                            ) : (
                                            <p className="text-sm text-gray-600 italic">
                                                No skills added yet. Start typing below...
                                            </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                            value={skillInput}
                                            onChange={(e) => setSkillInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                                            placeholder="Add a skill (e.g., React, Python)..."
                                            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                            />
                                            <button
                                            type="button"
                                            onClick={addSkill}
                                            className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                            >
                                            Add
                                            </button>
                                        </div>
                                        </div>
                                    ) : section.key === "education" ? (
                                        <div className="space-y-3">
                                          <div className="space-y-2">
                                            {draftEducationLines.map((line, index) => (
                                              <div key={index} className="flex items-center gap-2">
                                                <input
                                                  type="text"
                                                  value={line}
                                                  onChange={(e) => {
                                                    const updated = [...draftEducationLines];
                                                    updated[index] = e.target.value;
                                                    setDraftEducationLines(updated);
                                                  }}
                                                  placeholder="Institution - Degree - Year"
                                                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const updated = draftEducationLines.filter((_, i) => i !== index);
                                                    setDraftEducationLines(updated.length ? updated : [""]);
                                                  }}
                                                  className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-red-600 transition-colors"
                                                >
                                                  <X className="h-4 w-4" />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setDraftEducationLines([...draftEducationLines, ""])}
                                            className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-blue-400 transition-all"
                                          >
                                            <Plus className="h-4 w-4" />
                                            Add Education Entry
                                          </button>
                                        </div>
                                    ) : (
                                        <textarea
                                        value={draftProfileText}
                                        onChange={(e) => setDraftProfileText(e.target.value)}
                                        rows={6}
                                        placeholder={`Enter your ${section.title.toLowerCase()}...`}
                                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                                        />
                                    )}
                                    <div className="flex items-center gap-3 pt-2">
                                        <button
                                        type="button"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                                        onClick={() => saveProfileSection(section.key)}
                                        disabled={savingProfileSection === section.key}
                                        >
                                        {savingProfileSection === section.key ? (
                                            <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Saving...
                                            </>
                                        ) : (
                                            <>
                                            <Save className="h-4 w-4" />
                                            Save Changes
                                            </>
                                        )}
                                        </button>
                                        <button
                                        type="button"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all"
                                        onClick={cancelProfileEdit}
                                        >
                                        <X className="h-4 w-4" />
                                        Cancel
                                        </button>
                                    </div>
                                    </div>
                                ) : section.type === "skills" ? (
                                    displayValue ? (
                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {displayValue.map((skill) => (
                                        <span
                                            key={skill}
                                            className="inline-flex items-center rounded-full bg-gray-100 text-gray-800 px-3 py-1.5 text-sm font-medium border border-gray-200"
                                        >
                                            {skill}
                                        </span>
                                        ))}
                                    </div>
                                    ) : (
                                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300">
                                      <AlertCircle className="h-4 w-4 text-gray-500" />
                                      Not set. Click edit to add your skills.
                                    </div>
                                    )
                                ) : section.type === "cards" ? (
                                    (() => {
                                    const currentText =
                                        userProfileSections?.[section.key] || "";
                                    const normalizedCardText = stripSectionHeader(
                                      currentText,
                                      section.key,
                                      section.title
                                    );
                                    const parser =
                                        section.key === "projects"
                                        ? parseProjects
                                        : parseExperience;
                                    const items = parser(normalizedCardText || "");
                                    const isAddingNew =
                                        addingNewItem.key === section.key &&
                                        addingNewItem.isAdding;
                                    const newItem =
                                        section.key === "projects"
                                        ? {
                                            title: "",
                                            description: "",
                                            techStack: "",
                                            date: "",
                                            bullets: [],
                                            }
                                        : {
                                            title: "",
                                            company: "",
                                            location: "",
                                            dateRange: "",
                                            bullets: [],
                                            };
                
                                    return (
                                        <div className="space-y-3 pt-2">
                                        {items.length > 0 &&
                                            items.map((item, index) => (
                                            <ProfileItemCard
                                                key={index}
                                                item={item}
                                                type={
                                                section.key === "projects"
                                                    ? "project"
                                                    : "experience"
                                                }
                                                onSave={(updatedItem) =>
                                                handleSaveItem(section.key, updatedItem, item)
                                                }
                                                onDelete={(itemToDelete) =>
                                                handleDeleteItem(section.key, itemToDelete)
                                                }
                                            />
                                            ))}
                                        {isAddingNew && (
                                            <ProfileItemCard
                                            key="new"
                                            item={newItem}
                                            type={
                                                section.key === "projects"
                                                ? "project"
                                                : "experience"
                                            }
                                            onSave={(updatedItem) =>
                                                handleSaveItem(section.key, updatedItem, null)
                                            }
                                            onDelete={handleCancelAddItem}
                                            startInEditMode={true}
                                            />
                                        )}
                                        {!isAddingNew && (
                                            <AddItemButton
                                            type={
                                                section.key === "projects"
                                                ? "project"
                                                : "experience"
                                            }
                                            onClick={() => handleAddNewItem(section.key)}
                                            />
                                        )}
                                        </div>
                                    );
                                    })()
                                ) : section.key === "education" ? (
                                    (() => {
                                      const cards = formatEducationCards();
                                      if (!cards.length) {
                                        return (
                                          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300">
                                            <AlertCircle className="h-4 w-4 text-gray-500" />
                                            No education details added yet.
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="space-y-3 pt-2">
                                          {cards.map((card, index) => (
                                            <div
                                              key={`${card.title}-${index}`}
                                              className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
                                            >
                                              <div className="flex items-start gap-3">
                                                <div className="p-2 rounded-lg bg-blue-100 mt-0.5">
                                                  <GraduationCap className="h-4 w-4 text-blue-600" />
                                                </div>
                                                <div>
                                                  <h4 className="text-sm font-semibold text-gray-900">
                                                    {card.title}
                                                  </h4>
                                                  {card.subtitle && (
                                                    <p className="text-sm text-gray-600 mt-0.5">
                                                      {card.subtitle}
                                                    </p>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()
                                ) : displayValue ? (
                                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                                        {displayValue}
                                      </p>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300">
                                      <AlertCircle className="h-4 w-4 text-gray-500" />
                                      Not set. Click edit to add details.
                                    </div>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;