// src/components/History.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  FileText,
  Trash2,
  Calendar,
  Target,
  BarChart3,
  Briefcase,
  Hash,
  StickyNote,
  Loader2,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert";


function History() {
  const { session, loading: authLoading } = useUser();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (authLoading) return; // Wait for auth to resolve
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
  }, [session, authLoading]);

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

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Resume History
          </h2>
          <p className="text-muted-foreground">
            View all your previous resume analyses and results
          </p>
        </div>

        {history.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-1">
                No History Yet
              </h3>
              <p className="text-sm text-muted-foreground">
                Start by uploading a resume in the Resume Optimizer
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {history.map((item) => (
              <Card
                key={item.id}
                className="group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <CardTitle className="text-base font-semibold truncate">
                      {item.filename}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all flex-shrink-0"
                    onClick={() => deleteHistoryItem(item.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Version:</span>
                    <Badge variant="secondary" className="text-xs">
                      v{item.version_number}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Date:</span>
                    <span className="text-foreground font-medium">
                      {formatDate(item.created_at)}
                    </span>
                  </div>

                  {item.ats_score !== null && item.ats_score !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Target className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">ATS Score:</span>
                      <Badge
                        className={`text-xs ${
                          item.ats_score >= 70
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : item.ats_score >= 40
                            ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }`}
                        variant="outline"
                      >
                        {item.ats_score}%
                      </Badge>
                    </div>
                  )}

                  {item.best_career_match && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Best Match:</span>
                      <span className="text-foreground font-medium truncate">
                        {item.best_career_match}
                      </span>
                    </div>
                  )}

                  {item.match_probability !== null &&
                    item.match_probability !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Match:</span>
                        <Badge variant="outline" className="text-xs">
                          {item.match_probability}%
                        </Badge>
                      </div>
                    )}

                  {item.total_skills_found !== null &&
                    item.total_skills_found !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Skills Found:</span>
                        <span className="text-foreground font-medium">
                          {item.total_skills_found}
                        </span>
                      </div>
                    )}

                  {item.job_description && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span>Job Description:</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-md p-2">
                        {item.job_description.substring(0, 150)}
                        {item.job_description.length > 150 ? "..." : ""}
                      </p>
                    </div>
                  )}

                  {item.notes && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <StickyNote className="h-3.5 w-3.5" />
                        <span>Notes:</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-md p-2">
                        {item.notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default History;
