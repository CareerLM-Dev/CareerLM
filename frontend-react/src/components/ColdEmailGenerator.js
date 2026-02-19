import React, { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Mail, Copy, Sparkles, Building2, Briefcase, FileText, AlertCircle, CheckCircle } from "lucide-react";

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

  useEffect(() => {
    const fetchPrefill = async () => {
      if (hasPrefilled) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      try {
        const response = await fetch(
          "http://localhost:8000/api/v1/cold-email/prefill",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
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
    };

    fetchPrefill();
  }, [hasPrefilled]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (!formData.targetCompany || !formData.targetRole) {
      setError("Please fill in company and role");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError("Please login to generate emails");
        setLoading(false);
        return;
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
          }),
        }
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

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-primary/10 border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Mail className="w-7 h-7 text-primary" />
          <h2 className="text-2xl font-bold">Cold Email Generator</h2>
        </div>
        <p className="text-muted-foreground">Generate personalized cold emails for job applications</p>
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
              placeholder="Google"
              value={formData.targetCompany}
              onChange={(e) => handleInputChange("targetCompany", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              Target Role <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              placeholder="Software Engineer"
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
            onChange={(e) => handleInputChange("jobDescription", e.target.value)}
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
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Generated Email</h3>
            </div>
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
                    <><CheckCircle className="w-3 h-3 mr-1 text-green-500" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3 mr-1" /> Copy</>
                  )}
                </Button>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm font-medium">{generatedEmail.subject}</div>
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
                    <><CheckCircle className="w-3 h-3 mr-1 text-green-500" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3 mr-1" /> Copy</>
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
    </div>
  );
}

export default ColdEmailGenerator;
