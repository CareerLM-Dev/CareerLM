import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../api/supabaseClient";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import {
  Mail,
  Copy,
  Sparkles,
  Building2,
  Briefcase,
  FileText,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Bookmark,
  X,
  Trash2,
} from "lucide-react";

function ColdEmailGenerator({ resumeData }) {
  const [formData, setFormData] = useState({
    targetCompany: "",
    targetRole: "",
    jobDescription: "",
  });
  const [generatedEmail, setGeneratedEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [hasPrefilled, setHasPrefilled] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedEmails, setSavedEmails] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);

  const fetchPrefill = useCallback(async () => {
    if (hasPrefilled) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:8000/api/v1/cold-email/prefill",
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        return;
      }

      const result = await response.json();
      if (!result.success) return;

      setFormData((prev) => ({
        targetCompany: prev.targetCompany || result.target_company || "",
        targetRole: prev.targetRole || result.target_role || "",
        jobDescription: prev.jobDescription || result.job_description || "",
      }));
      setHasPrefilled(true);
    } catch (err) {
      console.error("Failed to prefill cold email data:", err);
    }
  }, [hasPrefilled]);

  useEffect(() => {
    fetchPrefill();
  }, [fetchPrefill]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const fetchSavedEmails = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSavedError("Please login to view saved emails");
      return;
    }

    try {
      setSavedLoading(true);
      setSavedError(null);
      const response = await fetch(
        "http://localhost:8000/api/v1/cold-email/saved",
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to load saved emails");
      }

      const result = await response.json();
      setSavedEmails(result.data || []);
    } catch (err) {
      setSavedError(err.message);
    } finally {
      setSavedLoading(false);
    }
  };

  const handleGenerate = async (template) => {
    if (!formData.targetCompany || !formData.targetRole) {
      setError("Please fill in company and role");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Please login to generate emails");
        setLoading(false);
        return;
      }

      if (template) {
        setActiveTemplate(template);
      } else {
        setActiveTemplate(null);
      }

      const response = await fetch(
        "http://localhost:8000/api/v1/cold-email/generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            target_company: formData.targetCompany,
            target_role: formData.targetRole,
            job_description: formData.jobDescription || null,
            template_subject: template?.subject || null,
            template_body: template?.body || null,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to generate email");
      }

      const result = await response.json();
      setGeneratedEmail(result.email);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!generatedEmail) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSaveMessage("Please login to save emails");
      return;
    }

    try {
      setSaveMessage(null);
      const title =
        generatedEmail.subject?.trim() ||
        `Saved email ${new Date().toLocaleDateString()}`;
      const response = await fetch(
        "http://localhost:8000/api/v1/cold-email/saved",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            title,
            subject: generatedEmail.subject || "",
            body: generatedEmail.body || "",
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to save email");
      }

      const result = await response.json();
      setSavedEmails((prev) => [result.data, ...prev].slice(0, 5));
      setSaveMessage("Saved to favorites");
    } catch (err) {
      setSaveMessage(err.message);
    }
  };

  const handleDeleteSaved = async (templateId) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSavedError("Please login to manage saved emails");
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/cold-email/saved/${templateId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to delete template");
      }

      setSavedEmails((prev) => prev.filter((item) => item.id !== templateId));
    } catch (err) {
      setSavedError(err.message);
    }
  };

  const handleOpenSaved = async () => {
    setSavedOpen(true);
    await fetchSavedEmails();
  };

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-primary/10 border border-border rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <Mail className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-bold">Cold Email Generator</h2>
          </div>
          <Button variant="outline" size="sm" onClick={handleOpenSaved}>
            <Bookmark className="w-4 h-4 mr-2" />
            Saved Templates
          </Button>
        </div>
        <p className="text-muted-foreground">
          Generate personalized cold emails for job applications
        </p>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              Target Company <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              placeholder="Enter Company"
              value={formData.targetCompany}
              onChange={(e) =>
                handleInputChange("targetCompany", e.target.value)
              }
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              Target Role <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              placeholder="Enter Role"
              value={formData.targetRole}
              onChange={(e) => handleInputChange("targetRole", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-muted-foreground" />
            Job Description (Optional)
          </Label>
          <Textarea
            placeholder="Paste the job description here..."
            rows={4}
            value={formData.jobDescription}
            onChange={(e) =>
              handleInputChange("jobDescription", e.target.value)
            }
          />
        </div>

        {resumeData && (
          <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary px-3 py-2 rounded-lg">
            <CheckCircle className="w-4 h-4" />
            Using your latest resume: <strong>{resumeData.filename}</strong>
          </div>
        )}
        {!resumeData && (
          <div className="flex items-center gap-2 text-sm bg-amber-500/10 text-amber-600 px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            Please upload a resume first to generate personalized emails
          </div>
        )}

        <Button onClick={handleGenerate} disabled={loading} className="w-full">
          {loading ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Email
            </>
          )}
        </Button>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      {/* Generated Email Result */}
      {generatedEmail && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="bg-primary/10 p-4 border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Generated Email</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSaveEmail}
                >
                  <Bookmark className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleGenerate(activeTemplate)}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full mr-2" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh Email
                    </>
                  )}
                </Button>
              </div>
            </div>
            {saveMessage && (
              <div className="mt-3 text-xs text-muted-foreground">
                {saveMessage}
              </div>
            )}
          </div>

          <div className="p-6 space-y-4">
            {/* Subject Line */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-muted-foreground">Subject Line</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleCopy(generatedEmail.subject, "subject")}
                >
                  {copied === "subject" ? (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1 text-green-500" />{" "}
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm font-medium">
                {generatedEmail.subject}
              </div>
            </div>

            {/* Email Body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-muted-foreground">Email Body</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleCopy(generatedEmail.body, "body")}
                >
                  {copied === "body" ? (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1 text-green-500" />{" "}
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {generatedEmail.body}
              </div>
            </div>
          </div>
        </div>
      )}

      {savedOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSavedOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="w-full max-w-lg bg-card border border-border shadow-xl rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-4 border-b border-border">
                <div>
                  <h3 className="text-lg font-semibold">Saved Templates</h3>
                  <p className="text-xs text-muted-foreground">
                    Up to 5 favorites
                  </p>
                </div>
                <button
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent"
                  onClick={() => setSavedOpen(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto max-h-[70vh]">
                {savedLoading && (
                  <div className="text-sm text-muted-foreground">
                    Loading saved emails...
                  </div>
                )}

                {savedError && (
                  <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                    {savedError}
                  </div>
                )}

                {!savedLoading && savedEmails.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No saved emails yet.
                  </div>
                )}

                {savedEmails.map((item) => (
                  <div
                    key={item.id}
                    className="border border-border rounded-lg p-3 space-y-2"
                  >
                    <div className="text-sm font-semibold text-foreground truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.subject}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap max-h-16 overflow-hidden">
                      {item.body}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setSavedOpen(false);
                          handleGenerate(item);
                        }}
                      >
                        Use Template
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSaved(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ColdEmailGenerator;
