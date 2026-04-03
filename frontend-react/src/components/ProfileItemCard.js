import React, { useState } from "react";
import { Pencil, Trash2, Save, X, Plus } from "lucide-react";

/**
 * Reusable card component for displaying and editing profile items (projects, experience)
 */
export const ProfileItemCard = ({
  item,
  type,
  onSave,
  onDelete,
  startInEditMode = false,
}) => {
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [editedItem, setEditedItem] = useState(item);
  const [bulletInput, setBulletInput] = useState("");

  const handleSave = () => {
    onSave(editedItem);
    setIsEditing(false);
  };

  const handleCancel = () => {
    if (startInEditMode) {
      // If we started in edit mode (new item), cancel means delete
      onDelete();
    } else {
      // Otherwise just reset and close editor
      setEditedItem(item);
      setIsEditing(false);
    }
  };

  const addBullet = () => {
    if (bulletInput.trim()) {
      setEditedItem({
        ...editedItem,
        bullets: [...editedItem.bullets, bulletInput.trim()],
      });
      setBulletInput("");
    }
  };

  const removeBullet = (index) => {
    setEditedItem({
      ...editedItem,
      bullets: editedItem.bullets.filter((_, i) => i !== index),
    });
  };

  const updateField = (field, value) => {
    setEditedItem({ ...editedItem, [field]: value });
  };

  if (isEditing) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        {type === "project" ? (
          <>
            {/* Project Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Project Title
              </label>
              <input
                type="text"
                value={editedItem.title}
                onChange={(e) => updateField("title", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Project Name"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Description
              </label>
              <input
                type="text"
                value={editedItem.description}
                onChange={(e) => updateField("description", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Short description"
              />
            </div>

            {/* Tech Stack */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Tech Stack
                </label>
                <input
                  type="text"
                  value={editedItem.techStack}
                  onChange={(e) => updateField("techStack", e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Python, Django, React"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Date
                </label>
                <input
                  type="text"
                  value={editedItem.date}
                  onChange={(e) => updateField("date", e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="June 2025 – Present"
                />
              </div>
            </div>

            {/* Links removed (not captured reliably from resumes) */}
          </>
        ) : (
          <>
            {/* Experience Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Job Title
              </label>
              <input
                type="text"
                value={editedItem.title}
                onChange={(e) => updateField("title", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Software Engineer Intern"
              />
            </div>

            {/* Company & Location */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Company
                </label>
                <input
                  type="text"
                  value={editedItem.company}
                  onChange={(e) => updateField("company", e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Company Name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Location
                </label>
                <input
                  type="text"
                  value={editedItem.location}
                  onChange={(e) => updateField("location", e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Mumbai, India"
                />
              </div>
            </div>

            {/* Date Range */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Date Range
              </label>
              <input
                type="text"
                value={editedItem.dateRange}
                onChange={(e) => updateField("dateRange", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Nov 2025 – Jan 2026"
              />
            </div>
          </>
        )}

        {/* Bullet Points */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            Key Points
          </label>

          <div className="space-y-1 mt-2">
            {editedItem.bullets.map((bullet, index) => (
              <div key={index} className="flex items-start gap-2 group w-full">
                <span className="text-primary mt-2 text-sm flex-shrink-0">
                  •
                </span>

                <input
                  type="text"
                  value={bullet}
                  onChange={(e) => {
                    const newBullets = [...editedItem.bullets];
                    newBullets[index] = e.target.value;
                    setEditedItem({ ...editedItem, bullets: newBullets });
                  }}
                  className="flex-1 w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm overflow-x-auto"
                  placeholder="Enter key point..."
                />

                <button
                  type="button"
                  onClick={() => removeBullet(index)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded flex-shrink-0"
                >
                  <X className="h-3 w-3 text-destructive" />
                </button>
              </div>
            ))}
          </div>

          {/* Add Bullet */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={bulletInput}
              onChange={(e) => setBulletInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBullet()}
              className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="Add a key point..."
            />

            <button
              type="button"
              onClick={addBullet}
              className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Display mode
  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex-1 min-w-0">
          {/* min-w-0 helps flex children shrink properly */}
          <h4 className="font-semibold text-foreground break-words">
            {item.title}
          </h4>
          {type === "project" ? (
            <>
              {item.description && (
                <p className="text-sm text-muted-foreground mt-0.5 break-words">
                  {item.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-xs text-primary font-medium">
                  {item.techStack}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.date}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground break-words">
                {item.company}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {item.location && (
                  <span className="text-xs text-muted-foreground">
                    {item.location}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {item.dateRange}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="p-1.5 rounded hover:bg-muted"
            title="Edit"
          >
            <Pencil className="h-4 w-4 text-primary" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="p-1.5 rounded hover:bg-destructive/10"
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </button>
        </div>
      </div>

      {/* Bullet Points */}
      {item.bullets && item.bullets.length > 0 && (
        <ul className="space-y-1 mt-2">
          {item.bullets.map((bullet, index) => (
            <li
              key={index}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <span className="text-primary mt-0.5 flex-shrink-0">•</span>
              <span
                className="flex-1 min-w-0"
                style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
              >
                {bullet}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Add new item button component
 */
export const AddItemButton = ({ type, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full border-2 border-dashed border-border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-colors group"
  >
    <div className="flex items-center justify-center gap-2 text-muted-foreground group-hover:text-primary">
      <Plus className="h-5 w-5" />
      <span className="text-sm font-medium">
        Add {type === "project" ? "Project" : "Experience"}
      </span>
    </div>
  </button>
);
