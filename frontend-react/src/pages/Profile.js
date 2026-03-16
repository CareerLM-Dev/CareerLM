import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useUser } from "../context/UserContext";
import {
  User,
  FileText,
  ClipboardList,
  Pencil,
  Save,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
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
    options: [
      { value: "exploring", label: "Exploring" },
      { value: "applying", label: "Applying" },
      { value: "building", label: "Building Skills" },
      { value: "interview_upcoming", label: "Interview Upcoming" },
    ],
  },
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
];

const profileSections = [
  { key: "intro", title: "Intro / Summary", type: "text" },
  { key: "areas_of_interest", title: "Areas of Interest", type: "text" },
  { key: "expertise", title: "Expertise", type: "text" },
  { key: "skills", title: "Skills", type: "skills" },
  { key: "education", title: "Education", type: "text" },
  { key: "projects", title: "Projects", type: "cards" },
  { key: "experience", title: "Experience", type: "cards" },
  { key: "certifications", title: "Certifications", type: "text" },
  { key: "coursework", title: "Coursework", type: "text" },
  {
    key: "co_curricular_achievements",
    title: "Co-curricular Achievements",
    type: "text",
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
  const [skillInput, setSkillInput] = useState("");
  const [savingProfileSection, setSavingProfileSection] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");
  // New state for accordion
  const [expandedSection, setExpandedSection] = useState("intro"); 
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
      const skills = Array.isArray(userProfileSections?.skills)
        ? userProfileSections.skills
        : userProfileSections?.skills
          ? userProfileSections.skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
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

  // Handler for saving individual project/experience items
  const handleSaveItem = async (key, updatedItem, originalItem) => {
  try {
    const currentText = userProfileSections?.[key] || "";

    // FIX: merge wrapped lines that are not bullets
    const normalizedText = currentText
      .replace(/\r/g, "")
      .replace(/\n(?![–•-])/g, " ")
      .replace(/\s+/g, " ")
      .trim();

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

    const normalizedText = currentText
      .replace(/\r/g, "")
      .replace(/\n(?![–•-])/g, " ")
      .replace(/\s+/g, " ")
      .trim();

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
      const skills = Array.isArray(userProfileSections?.skills)
        ? userProfileSections.skills
        : userProfileSections?.skills
          ? userProfileSections.skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
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
    setExpandedSection(prev => prev === key ? null : key);
  }

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
    <div ref={scrollRef} className="h-full overflow-y-auto bg-background pb-12">
      {/* Top Banner Cover */}
      <div className="h-60 w-full bg-gradient-to-r from-blue-600 to-indigo-600 relative">
        <div className="absolute inset-0 bg-black/10" />
      </div>

      {/* Main Content Container with negative margin */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Sidebar (Span 4 of 12) */}
          <div className="lg:col-span-4">
            <div className="sticky top-6 space-y-6">
            
            {/* Profile Identity Card */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col items-center p-6 text-center">
               {/* Avatar Area */}
               <div className="h-24 w-24 rounded-full border-4 border-card bg-muted flex items-center justify-center text-3xl font-bold text-muted-foreground shadow-sm mb-4 relative z-10 -mt-2">
                  {profile?.first_name ? profile.first_name.charAt(0).toUpperCase() : (profile?.name ? profile.name.charAt(0).toUpperCase() : <User className="h-10 w-10"/>)}
               </div>
               
               <h2 className="text-xl font-bold text-foreground">
                 {profile?.name || "User"}
               </h2>
               <p className="text-sm text-muted-foreground mb-1">
                  {profile?.email}
               </p>
               <div className="mt-2">
                 <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20 capitalize">
                   {statusLabel}
                 </span>
               </div>
  
               {/* Resume Metadata moved here */}
               <div className="w-full mt-6 pt-6 border-t border-border text-left">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Latest Resume</p>
                  <div className="flex items-start gap-3 bg-muted/50 p-3 rounded-lg">
                     <FileText className="h-5 w-5 text-primary mt-0.5" />
                     <div className="overflow-hidden">
                        <p className="text-sm font-medium text-foreground truncate">
                          {latestResume?.filename || "No resume uploaded"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {latestResume ? formatDate(latestResume.created_at) : "N/A"}
                        </p>
                     </div>
                  </div>
               </div>
            </div>
  
            {/* Completion Widget */}
            <ProfileCompletionWidget />
            </div>
          </div>
  
          {/* RIGHT COLUMN: Main Content (Span 8 of 12) */}
          <div className="lg:col-span-8 space-y-6">
            
            {error && (
              <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-4 py-3 text-sm font-medium shadow-sm backdrop-blur-sm relative z-20">
                {error}
              </div>
            )}
  
            {/* Improved Tab Navigation (Pills) */}
            <div className="flex p-1 bg-muted rounded-xl border border-border overflow-x-auto no-scrollbar shadow-sm relative z-10">
                {[
                  { id: 'basic', label: 'Basic Information' },
                  { id: 'questionnaire', label: 'Questionnaire' },
                  { id: 'resume', label: 'Resume Profile' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap
                      ${activeTab === tab.id 
                        ? 'bg-background shadow-sm text-foreground ring-1 ring-border' 
                        : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'}
                    `}
                  >
                    {tab.label}
                  </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[500px]">
              {/* Basic Information Content */}
              {activeTab === 'basic' && (
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden animate-in fade-in duration-300 ease-in-out">
                  <div className="px-6 py-4 border-b border-border bg-muted/5">
                    <h3 className="text-lg font-semibold text-foreground">Basic Information</h3>
                    <p className="text-sm text-muted-foreground">Account details and preferences.</p>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                       <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                       <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-foreground">
                         {profile?.name || "Not provided"}
                       </div>
                     </div>
                     
                     <div className="space-y-2">
                       <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                       <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-foreground">
                         {profile?.email || "Not provided"}
                       </div>
                     </div>
      
                     <div className="space-y-2">
                       <label className="text-sm font-medium text-muted-foreground">Current Company</label>
                       <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-foreground">
                         {profile?.current_company || "Not set"}
                       </div>
                     </div>

                     <div className="space-y-2">
                       <label className="text-sm font-medium text-muted-foreground">Target Role</label>
                       <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-foreground capitalize">
                          {typeof formatAnswer === 'function' && questionnaireAnswers?.target_role ? formatAnswer('target_role') : "Not set"} 
                       </div>
                     </div>
                  </div>
                </div>
              )}
    
              {/* Questionnaire Content */}
              {activeTab === 'questionnaire' && (
                <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden animate-in fade-in duration-300 ease-in-out">
                  <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-muted/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <ClipboardList className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">
                          Questionnaire
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Edit answers to keep recommendations relevant.
                        </p>
                      </div>
                    </div>
                    {/* Keep existing button logic */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                        onClick={() => navigate(`/onboarding/${session?.user?.id}`)}
                      >
                        Change my goal
                      </button>
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        Inline editing
                      </span>
                    </div>
                  </div>
        
                  <div className="divide-y divide-border">
                    {questions.map((question) => (
                      <div key={question.field} className="px-6 py-5">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-foreground">
                            {question.title}
                          </h3>
                          {editingField !== question.field && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                              onClick={() => {
                                if (typeof startEdit !== 'undefined') startEdit(question.field);
                              }}
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
                                      <svg
                                        className="h-3 w-3 text-primary-foreground"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={3}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M5 13l4 4L19 7"
                                        />
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
                          <p className="text-sm text-muted-foreground">
                            {formatAnswer(question.field)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
    
              {/* Resume Profile Content */}
                            {activeTab === 'resume' && (
                <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-muted/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">
                          Resume Profile
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Edit section details extracted from your latest resume.
                        </p>
                      </div>
                    </div>
                  </div>
        
                  <div className="divide-y divide-border">
                    {profileSections.map((section) => {
                      const isEditing = editingProfileSection === section.key;
                      const displayValue = formatProfileValue(section.key);
                      const isExpanded = expandedSection === section.key;

                      return (
                        <div key={section.key} className="transition-all duration-200 ease-in-out">
                          {/* Accordion Header */}
                          <div 
                            className={`flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-muted/5 select-none ${isExpanded ? 'bg-muted/5' : ''}`}
                            onClick={() => toggleSection(section.key)}
                          >
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground rotate-90" />}
                                {section.title}
                            </h3>
                            
                            <div className="flex items-center gap-3">
                                {section.type === "cards" && !isExpanded && (
                                   <span className="text-xs text-muted-foreground">
                                      {(() => {
                                         const currentText = userProfileSections?.[section.key] || "";
                                         const parser = section.key === "projects" ? parseProjects : parseExperience;
                                         return `${parser(currentText).length} items`;
                                      })()}
                                   </span>
                                )}
                                {!isEditing && section.type !== "cards" && isExpanded && (
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        startProfileEdit(section.key);
                                    }}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                </button>
                                )}
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
                                            <p className="text-xs text-muted-foreground">
                                                No skills added yet.
                                            </p>
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
                                ) : section.type === "cards" ? (
                                    (() => {
                                    const currentText =
                                        userProfileSections?.[section.key] || "";
                                    const parser =
                                        section.key === "projects"
                                        ? parseProjects
                                        : parseExperience;
                                    const items = parser(currentText);
                                    const isAddingNew =
                                        addingNewItem.key === section.key &&
                                        addingNewItem.isAdding;
                                    const newItem =
                                        section.key === "projects"
                                        ? {
                                            title: "",
                                            description: "",
                                            techStack: "",
                                            links: "",
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
                                        <div className="space-y-3 mt-3">
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
                                ) : displayValue ? (
                                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                                    {displayValue}
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Not set</p>
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
