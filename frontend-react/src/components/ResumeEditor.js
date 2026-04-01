// src/components/ResumeEditor.js
import React, { useState, useCallback } from "react";
import {
  User, Briefcase, GraduationCap, Code, FolderKanban, Award,
  FileText, BookOpen, Save, ChevronDown, ChevronUp, RotateCcw
} from "lucide-react";

// Section configuration
const SECTION_CONFIG = {
  contact: {
    label: "Contact Information",
    icon: User,
    color: "bg-blue-500/10",
    iconColor: "text-blue-500",
    placeholder: "Name\nEmail | Phone | LinkedIn | GitHub"
  },
  summary: {
    label: "Professional Summary",
    icon: FileText,
    color: "bg-purple-500/10",
    iconColor: "text-purple-500",
    placeholder: "A brief professional summary highlighting your key strengths and career objectives..."
  },
  experience: {
    label: "Experience",
    icon: Briefcase,
    color: "bg-green-500/10",
    iconColor: "text-green-500",
    placeholder: "Company Name | Role | Duration\n• Achievement or responsibility\n• Another bullet point"
  },
  education: {
    label: "Education",
    icon: GraduationCap,
    color: "bg-amber-500/10",
    iconColor: "text-amber-500",
    placeholder: "University Name | Degree | Graduation Year\n• GPA, relevant coursework, honors"
  },
  skills: {
    label: "Technical Skills",
    icon: Code,
    color: "bg-cyan-500/10",
    iconColor: "text-cyan-500",
    placeholder: "Languages: Python, JavaScript, Java\nFrameworks: React, Node.js, Django\nTools: Git, Docker, AWS"
  },
  projects: {
    label: "Projects",
    icon: FolderKanban,
    color: "bg-pink-500/10",
    iconColor: "text-pink-500",
    placeholder: "Project Name | Technologies Used\n• Description of what you built\n• Impact or outcome"
  },
  certifications: {
    label: "Certifications",
    icon: Award,
    color: "bg-orange-500/10",
    iconColor: "text-orange-500",
    placeholder: "Certification Name | Issuing Organization | Date"
  },
  coursework: {
    label: "Relevant Coursework",
    icon: BookOpen,
    color: "bg-indigo-500/10",
    iconColor: "text-indigo-500",
    placeholder: "Course 1, Course 2, Course 3"
  },
  awards: {
    label: "Awards & Achievements",
    icon: Award,
    color: "bg-yellow-500/10",
    iconColor: "text-yellow-500",
    placeholder: "Award Name | Organization | Date"
  }
};

// Order for display
const SECTION_ORDER = [
  "contact", "summary", "education", "experience", 
  "projects", "skills", "certifications", "coursework", "awards"
];

// Single section editor
function SectionEditor({ 
  sectionKey, 
  content, 
  onChange, 
  onReset,
  originalContent,
  isExpanded,
  onToggle,
  hasChanges
}) {
  const config = SECTION_CONFIG[sectionKey] || {
    label: sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1),
    icon: FileText,
    color: "bg-gray-500/10",
    iconColor: "text-gray-500",
    placeholder: "Enter content..."
  };

  const Icon = config.icon;
  const lineCount = (content || "").split("\n").length;
  const minRows = Math.max(3, Math.min(lineCount + 1, 15));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
      {/* Header */}
      <div
        className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${config.color} hover:opacity-90`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`${config.color} rounded-lg p-2.5 flex-shrink-0`}>
            <Icon className={`w-5 h-5 ${config.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-semibold truncate">{config.label}</h4>
            {!isExpanded && content && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {content.split("\n")[0]}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasChanges && (
            <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded text-xs font-medium">
              Modified
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Editor */}
      {isExpanded && (
        <div className="p-4 border-t border-border bg-card">
          <textarea
            value={content || ""}
            onChange={(e) => onChange(sectionKey, e.target.value)}
            placeholder={config.placeholder}
            rows={minRows}
            className="w-full bg-muted/50 border border-border rounded-lg p-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
          {hasChanges && originalContent !== undefined && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => onReset(sectionKey)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to original
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main ResumeEditor component
export default function ResumeEditor({ 
  sections, 
  originalSections,
  onChange, 
  onSave, 
  isSaving = false,
  hasUnsavedChanges = false 
}) {
  const [expandedSections, setExpandedSections] = useState(new Set(["contact", "experience", "education"]));

  const toggleSection = useCallback((sectionKey) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSections(new Set(SECTION_ORDER));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedSections(new Set());
  }, []);

  const handleReset = useCallback((sectionKey) => {
    if (originalSections && originalSections[sectionKey] !== undefined) {
      onChange(sectionKey, originalSections[sectionKey]);
    }
  }, [originalSections, onChange]);

  // Filter to only show sections that exist or are commonly used
  const visibleSections = SECTION_ORDER.filter(key => 
    sections[key] || ["contact", "summary", "experience", "education", "skills", "projects"].includes(key)
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
          >
            Expand All
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
          >
            Collapse All
          </button>
        </div>
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-500">Unsaved changes</span>
          )}
          <button
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              hasUnsavedChanges
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Section Editors */}
      <div className="space-y-3">
        {visibleSections.map(sectionKey => {
          const hasChanges = originalSections && 
            sections[sectionKey] !== originalSections[sectionKey];
          
          return (
            <SectionEditor
              key={sectionKey}
              sectionKey={sectionKey}
              content={sections[sectionKey]}
              originalContent={originalSections?.[sectionKey]}
              onChange={onChange}
              onReset={handleReset}
              isExpanded={expandedSections.has(sectionKey)}
              onToggle={() => toggleSection(sectionKey)}
              hasChanges={hasChanges}
            />
          );
        })}
      </div>

      {/* Add Section Button (for empty sections) */}
      <div className="border-2 border-dashed border-border rounded-xl p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Edit the sections above to customize your resume
        </p>
      </div>
    </div>
  );
}
