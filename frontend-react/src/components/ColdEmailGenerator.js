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
  Users,
  Target,
  GraduationCap,
} from "lucide-react";

const OUTREACH_TYPES = [
  { id: "referral", label: "Referral Request", icon: Users, defaultTone: "professional" },
  { id: "recruiter", label: "Direct Outreach", icon: Target, defaultTone: "professional" },
  { id: "alumni", label: "Alumni Connect", icon: GraduationCap, defaultTone: "casual" },
];

const TIPS = {
  referral: "Mention the exact role and make it easy for them — ask a clear yes or no question.",
  recruiter: "Keep it under 5 lines. Be specific about the role, company, and why you're a fit.",
  alumni: "Lead with genuine curiosity about their journey, not an ask.",
};

function ColdEmailGenerator({ resumeData }) {
  const [outreachType, setOutreachType] = useState(null);
  const [tone, setTone] = useState("professional");
  const [format, setFormat] = useState("email");
  const [formData, setFormData] = useState({});
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
  const [showAdvanced, setShowAdvanced] = useState({});

  const handleTypeSelect = (typeId) => {
    const selectedType = OUTREACH_TYPES.find(t => t.id === typeId);
    setOutreachType(typeId);
    setTone(selectedType.defaultTone);
    setFormat("email");
    setFormData({});
    setGeneratedEmail(null);
    setError(null);
    setShowAdvanced({});
  };

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

      // Prefill data for relevant types
      if (outreachType === "referral" || outreachType === "recruiter") {
        setFormData((prev) => ({
          ...prev,
          targetRole: prev.targetRole || result.target_role || "",
          companyName: prev.companyName || result.target_company || "",
        }));
      }
      setHasPrefilled(true);
    } catch (err) {
      console.error("Failed to prefill cold email data:", err);
    }
  }, [hasPrefilled, outreachType]);

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
    // Validate required fields based on type
    let isValid = true;
    let missingFields = [];

    if (outreachType === "referral") {
      if (!formData.companyName) missingFields.push("Company Name");
      if (!formData.targetRole) missingFields.push("Role You Are Targeting");
    } else if (outreachType === "recruiter") {
      if (!formData.companyName) missingFields.push("Company Name");
      if (!formData.targetRole) missingFields.push("Role You Are Targeting");
    } else if (outreachType === "alumni") {
      if (!formData.recipientName) missingFields.push("Their Name");
      if (!formData.recipientCompany) missingFields.push("Their Current Company");
      if (!formData.reachoutReason) missingFields.push("Why you're reaching out");
    }

    if (missingFields.length > 0) {
      setError(`Please fill in: ${missingFields.join(", ")}`);
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
            outreach_type: outreachType,
            form_data: formData,
            tone: tone,
            format: format,
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
          Generate personalized cold emails for different outreach scenarios
        </p>
      </div>

      {/* Step 1: Outreach Type Selector */}
      {!outreachType && (
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold mb-2">SELECT OUTREACH TYPE</h3>
            <p className="text-sm text-muted-foreground">Choose the type of email you want to generate</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {OUTREACH_TYPES.map((type) => {
              const IconComponent = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => handleTypeSelect(type.id)}
                  className="group relative bg-background border-2 border-border rounded-2xl p-6 hover:border-primary hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1"
                >
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <IconComponent className="w-8 h-8 text-primary" />
                    </div>
                    <div className="font-semibold text-base group-hover:text-primary transition-colors">
                      {type.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Form - Only renders after type selection */}
      {outreachType && (
        <>
          {/* Selected Type Header + Tone Toggle */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                {(() => {
                  const selectedType = OUTREACH_TYPES.find(t => t.id === outreachType);
                  const IconComponent = selectedType?.icon;
                  return (
                    <>
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        {IconComponent && <IconComponent className="w-5 h-5 text-primary" />}
                      </div>
                      <div>
                        <h3 className="font-semibold">
                          {selectedType?.label}
                        </h3>
                        <button
                          onClick={() => setOutreachType(null)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Change type
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
              
              <div className="flex items-center gap-3 flex-wrap">
                {/* Format Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Format:</span>
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    <button
                      onClick={() => setFormat("email")}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        format === "email"
                          ? "bg-background shadow-sm"
                          : "hover:bg-background/50"
                      }`}
                    >
                      Email
                    </button>
                    <button
                      onClick={() => setFormat("message")}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        format === "message"
                          ? "bg-background shadow-sm"
                          : "hover:bg-background/50"
                      }`}
                    >
                      Message
                    </button>
                  </div>
                </div>
                
                {/* Tone Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tone:</span>
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    <button
                      onClick={() => setTone("professional")}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        tone === "professional"
                          ? "bg-background shadow-sm"
                          : "hover:bg-background/50"
                      }`}
                    >
                      Professional
                    </button>
                    <button
                      onClick={() => setTone("casual")}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        tone === "casual"
                          ? "bg-background shadow-sm"
                          : "hover:bg-background/50"
                      }`}
                    >
                      Casual
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info Banner */}
          {/* <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-100">
              <span className="font-medium">Only essentials required.</span> Additional details are optional but make your {format === "email" ? "email" : "message"} more personalized and effective.
              {format === "message" && <span className="block mt-1 text-xs">💡 Messages are shorter and optimized for LinkedIn/direct messaging platforms</span>}
            </div>
          </div> */}

          {/* Dynamic Form Fields */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            {/* Referral Request Fields */}
            {outreachType === "referral" && (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Name <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g., Google"
                      value={formData.companyName || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role You Are Targeting <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g., Software Engineer"
                      value={formData.targetRole || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, targetRole: e.target.value }))}
                    />
                  </div>
                </div>
                
                {/* Collapsible Advanced Section */}
                <div className="border-t pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(prev => ({ ...prev, referral: !prev.referral }))}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
                  >
                    <div className={`transform transition-transform ${showAdvanced.referral ? 'rotate-90' : ''}`}>
                      ➤
                    </div>
                    <span>Add recipient details (recommended for personalization)</span>
                  </button>
                  
                  {showAdvanced.referral && (
                    <div className="space-y-4 pl-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Recipient Name</Label>
                          <Input
                            placeholder="e.g., John Smith"
                            value={formData.recipientName || ""}
                            onChange={(e) => setFormData(prev => ({ ...prev, recipientName: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Their Position</Label>
                          <Input
                            placeholder="e.g., Senior Engineer"
                            value={formData.recipientPosition || ""}
                            onChange={(e) => setFormData(prev => ({ ...prev, recipientPosition: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Mutual Connection or Common Ground</Label>
                        <Textarea
                          placeholder="e.g., We both attended UC Berkeley, or saw their recent talk at..."
                          rows={2}
                          value={formData.mutualConnection || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, mutualConnection: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Adding this significantly improves response rates</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Direct Outreach Fields */}
            {outreachType === "recruiter" && (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Name <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g., Microsoft"
                      value={formData.companyName || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role You Are Targeting <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g., Software Engineer Intern / Data Analyst"
                      value={formData.targetRole || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, targetRole: e.target.value }))}
                    />
                  </div>
                </div>
                
                {/* Collapsible Advanced Section */}
                <div className="border-t pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(prev => ({ ...prev, recruiter: !prev.recruiter }))}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
                  >
                    <div className={`transform transition-transform ${showAdvanced.recruiter ? 'rotate-90' : ''}`}>
                      ▶
                    </div>
                    <span>Add more details (makes email more specific)</span>
                  </button>
                  
                  {showAdvanced.recruiter && (
                    <div className="space-y-4 pl-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Recipient Name</Label>
                          <Input
                            placeholder="e.g., Sarah Lee (if you know it)"
                            value={formData.recipientName || ""}
                            onChange={(e) => setFormData(prev => ({ ...prev, recipientName: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Team or Domain</Label>
                          <Input
                            placeholder="e.g., Machine Learning Team"
                            value={formData.teamDomain || ""}
                            onChange={(e) => setFormData(prev => ({ ...prev, teamDomain: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Why this company?</Label>
                        <Textarea
                          placeholder="e.g., I've been following your work on autonomous vehicles and am impressed by your recent breakthrough..."
                          rows={2}
                          value={formData.companyReason || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, companyReason: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Specific reasons show genuine interest</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Alumni Connect Fields */}
            {outreachType === "alumni" && (
              <>
                <div className="space-y-2">
                  <Label>Their Name <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g., Alex Chen"
                    value={formData.recipientName || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, recipientName: e.target.value }))}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Their Current Company <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g., Amazon"
                      value={formData.recipientCompany || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, recipientCompany: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Their Current Role</Label>
                    <Input
                      placeholder="e.g., Product Manager (optional)"
                      value={formData.recipientRole || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, recipientRole: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Why are you reaching out to them specifically? <span className="text-destructive">*</span></Label>
                  <Textarea
                    placeholder="e.g., I saw your recent blog post about transitioning to PM and would love to learn from your experience..."
                    rows={2}
                    value={formData.reachoutReason || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, reachoutReason: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Be specific — generic messages rarely get responses</p>
                </div>
              </>
            )}



            {/* Tip */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
              💡 <strong>Tip:</strong> {TIPS[outreachType]}
            </div>

            {resumeData && (
              <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary px-3 py-2 rounded-lg">
                <CheckCircle className="w-4 h-4" />
                Using your profile and resume: <strong>{resumeData.filename}</strong>
              </div>
            )}

            <Button onClick={() => handleGenerate()} disabled={loading} className="w-full">
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
        </>
      )}

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
            {/* Subject Line - Only for emails */}
            {format === "email" && generatedEmail.subject && (
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
            )}

            {/* Email/Message Body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-muted-foreground">{format === "email" ? "Email Body" : "Message"}</Label>
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
