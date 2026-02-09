import React, { useState } from "react";
import { supabase } from "../api/supabaseClient";
import "./ColdEmailGenerator.css";

function ColdEmailGenerator({ resumeData }) {
  const [formData, setFormData] = useState({
    userName: "",
    targetCompany: "",
    targetRole: "",
    jobDescription: "",
    userExperience: "",
  });
  const [generatedEmail, setGeneratedEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (!formData.userName || !formData.targetCompany || !formData.targetRole) {
      setError("Please fill in at least name, company, and role");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError("Please login to generate emails");
        setLoading(false);
        return;
      }
      
      // Extract skills from resume data if available
      const userSkills = resumeData?.skills || ["Python", "JavaScript", "React"];

      const response = await fetch(
        "http://localhost:8000/api/v1/cold-email/generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            user_name: formData.userName,
            user_skills: userSkills,
            target_company: formData.targetCompany,
            target_role: formData.targetRole,
            job_description: formData.jobDescription || null,
            user_experience: formData.userExperience || null,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate email");
      }

      const result = await response.json();
      setGeneratedEmail(result.email);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className="cold-email-container">
      <h2>🎯 Cold Email Generator</h2>
      <p className="subtitle">
        Generate personalized cold emails for job applications
      </p>

      <div className="email-form">
        <div className="form-group">
          <label>Your Name *</label>
          <input
            type="text"
            placeholder="John Doe"
            value={formData.userName}
            onChange={(e) => handleInputChange("userName", e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Target Company *</label>
            <input
              type="text"
              placeholder="Google"
              value={formData.targetCompany}
              onChange={(e) =>
                handleInputChange("targetCompany", e.target.value)
              }
            />
          </div>

          <div className="form-group">
            <label>Target Role *</label>
            <input
              type="text"
              placeholder="Software Engineer"
              value={formData.targetRole}
              onChange={(e) => handleInputChange("targetRole", e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Job Description (Optional)</label>
          <textarea
            placeholder="Paste the job description here..."
            rows="4"
            value={formData.jobDescription}
            onChange={(e) =>
              handleInputChange("jobDescription", e.target.value)
            }
          />
        </div>

        <div className="form-group">
          <label>Your Experience (Optional)</label>
          <input
            type="text"
            placeholder="3 years in web development"
            value={formData.userExperience}
            onChange={(e) =>
              handleInputChange("userExperience", e.target.value)
            }
          />
        </div>

        {resumeData && (
          <div className="resume-info">
            ℹ️ Using skills from: {resumeData.filename}
          </div>
        )}

        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? "Generating..." : "✨ Generate Email"}
        </button>

        {error && <div className="error-message">{error}</div>}
      </div>

      {generatedEmail && (
        <div className="email-result">
          <h3>📧 Generated Email</h3>

          <div className="email-section">
            <div className="section-header">
              <label>Subject Line</label>
              <button
                className="copy-btn"
                onClick={() => handleCopy(generatedEmail.subject)}
              >
                📋 Copy
              </button>
            </div>
            <div className="email-content">{generatedEmail.subject}</div>
          </div>

          <div className="email-section">
            <div className="section-header">
              <label>Email Body</label>
              <button
                className="copy-btn"
                onClick={() => handleCopy(generatedEmail.body)}
              >
                📋 Copy
              </button>
            </div>
            <div className="email-content email-body">
              {generatedEmail.body}
            </div>
          </div>

          {/* {generatedEmail.research_notes && (
            <div className="email-section notes">
              <label>💡 Research Notes</label>
              <div className="email-content">
                {generatedEmail.research_notes}
              </div>
            </div>
          )} */}
        </div>
      )}
    </div>
  );
}

export default ColdEmailGenerator;
