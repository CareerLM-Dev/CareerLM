import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";
import "./Profile.css";

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
];

function Profile() {
  const { session } = useUser();
  const [profile, setProfile] = useState(null);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState({});
  const [latestResume, setLatestResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [draftValues, setDraftValues] = useState([]);
  const [savingField, setSavingField] = useState(null);

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
  }, [session]);

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
    setDraftValues((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
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
      <div className="profile-page">
        <div className="profile-loading">
          <div className="profile-spinner"></div>
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <div className="profile-hero-content">
          <p className="profile-eyebrow">Profile</p>
          <h1>Your profile, shaped around your goals</h1>
          <p className="profile-subtitle">
            Review your basics and keep your questionnaire answers fresh as your
            plans evolve.
          </p>
        </div>
      </div>

      <div className="profile-content">
        {error && <div className="profile-error">{error}</div>}

        <section className="profile-card">
          <div className="card-header">
            <div>
              <h2>Basic details</h2>
              <p>Snapshot of your account details.</p>
            </div>
            <span className="card-note">Read-only for now</span>
          </div>

          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Name</span>
              <span className="detail-value">{profile?.name || "Not set"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Email</span>
              <span className="detail-value">{profile?.email || "Not set"}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Status</span>
              <span className="detail-value">{statusLabel}</span>
            </div>
            {(profile?.status === "professional" || profile?.status === "prof") && (
              <div className="detail-item">
                <span className="detail-label">Current company</span>
                <span className="detail-value">
                  {profile?.current_company || "Not set"}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="profile-card">
          <div className="card-header">
            <div>
              <h2>Latest resume</h2>
              <p>Quick snapshot of your most recent upload.</p>
            </div>
          </div>

          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">File name</span>
              <span className="detail-value">
                {latestResume?.filename || "No resume uploaded yet"}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Uploaded</span>
              <span className="detail-value">
                {latestResume ? formatDate(latestResume.created_at) : "Not available"}
              </span>
            </div>
          </div>
        </section>

        <section className="profile-card">
          <div className="card-header">
            <div>
              <h2>Questionnaire</h2>
              <p>Edit answers to keep recommendations relevant.</p>
            </div>
            <span className="card-note">Inline editing</span>
          </div>

          <div className="qa-list">
            {questions.map((question) => (
              <div key={question.field} className="qa-item">
                <div className="qa-header">
                  <h3>{question.title}</h3>
                  {editingField !== question.field && (
                    <button
                      className="qa-edit"
                      onClick={() => startEdit(question.field)}
                    >
                      Edit
                    </button>
                  )}
                </div>

                {editingField === question.field ? (
                  <div className="qa-edit-panel">
                    <div className="qa-options">
                      {question.options.map((option) => (
                        <label key={option.value} className="qa-option">
                          <input
                            type="checkbox"
                            checked={draftValues.includes(option.value)}
                            onChange={() => toggleDraftValue(option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="qa-actions">
                      <button
                        className="qa-save"
                        onClick={() => saveAnswers(question.field)}
                        disabled={savingField === question.field}
                      >
                        {savingField === question.field ? "Saving..." : "Save"}
                      </button>
                      <button className="qa-cancel" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="qa-answer">{formatAnswer(question.field)}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Profile;
