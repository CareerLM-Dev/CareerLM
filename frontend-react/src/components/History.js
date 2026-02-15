// src/components/History.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";
import { Clock, Trash2, FileText, Briefcase, TrendingUp, Target, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

function History() {
  const { session } = useUser();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!session) {
        setError("Please log in to view your history");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await axios.get(
          "http://localhost:8000/api/v1/user/history",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        setHistory(response.data.data || []);
        setError(null);
      } catch (err) {
        console.error("Error fetching history:", err);
        setError(err.response?.data?.detail || "Failed to load history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [session]);

  const deleteHistoryItem = async (id) => {
    if (!window.confirm("Are you sure you want to delete this item?")) {
      return;
    }

    try {
      await axios.delete(`http://localhost:8000/api/v1/user/history/${id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      setHistory(history.filter((item) => item.id !== id));
    } catch (err) {
      console.error("Error deleting history item:", err);
      alert("Failed to delete item");
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getScoreColor = (score) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Loading your history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-8 text-center">
          <p className="text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Clock className="w-7 h-7 text-primary" />
          <h2 className="text-2xl font-bold">Resume History</h2>
        </div>
        <p className="text-muted-foreground">View all your previous resume analyses and results</p>
      </div>

      {history.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-1">No History Yet</h3>
          <p className="text-muted-foreground text-sm">Start by uploading a resume in the Resume Optimizer</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {history.map((item) => (
            <div key={item.id} className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              {/* Card Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <h3 className="font-semibold text-sm truncate">{item.filename}</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive flex-shrink-0 h-8 w-8 p-0"
                  onClick={() => deleteHistoryItem(item.id)}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-medium">v{item.version_number}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{formatDate(item.created_at)}</span>
                </div>

                {item.ats_score !== null && item.ats_score !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" /> ATS Score
                    </span>
                    <span className={`font-bold ${getScoreColor(item.ats_score)}`}>{item.ats_score}%</span>
                  </div>
                )}

                {item.best_career_match && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5" /> Best Match
                    </span>
                    <span className="font-medium text-xs truncate ml-2 max-w-[140px]">{item.best_career_match}</span>
                  </div>
                )}

                {item.match_probability !== null && item.match_probability !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" /> Match
                    </span>
                    <span className={`font-bold ${getScoreColor(item.match_probability)}`}>{item.match_probability}%</span>
                  </div>
                )}

                {item.total_skills_found !== null && item.total_skills_found !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Skills Found</span>
                    <span className="font-medium">{item.total_skills_found}</span>
                  </div>
                )}

                {item.job_description && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-muted-foreground text-xs">Job Description</span>
                    <p className="text-xs mt-1 line-clamp-2">{item.job_description}</p>
                  </div>
                )}

                {item.notes && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-muted-foreground text-xs">Notes</span>
                    <p className="text-xs mt-1">{item.notes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default History;
