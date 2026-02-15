// src/components/History.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";


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

  if (loading) {
    return (
      <div className="history-container">
        <div className="loading-spinner">Loading your history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-container">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="history-container">
      <div className="history-header">
        <h2>Resume History</h2>
        <p>View all your previous resume analyses and results</p>
      </div>

      {history.length === 0 ? (
        <div className="empty-state">
          <h3>No History Yet</h3>
          <p>Start by uploading a resume in the Resume Optimizer</p>
        </div>
      ) : (
        <div className="history-grid">
          {history.map((item) => (
            <div key={item.id} className="history-card">
              <div className="history-card-header">
                <h3>{item.filename}</h3>
                <button
                  className="delete-btn"
                  onClick={() => deleteHistoryItem(item.id)}
                  title="Delete"
                >
                  ×
                </button>
              </div>

              <div className="history-card-body">
                <div className="history-detail">
                  <span className="label">Version:</span>
                  <span className="value">v{item.version_number}</span>
                </div>

                <div className="history-detail">
                  <span className="label">Date:</span>
                  <span className="value">{formatDate(item.created_at)}</span>
                </div>

                {item.ats_score !== null && item.ats_score !== undefined && (
                  <div className="history-detail">
                    <span className="label">ATS Score:</span>
                    <span className="value score">{item.ats_score}%</span>
                  </div>
                )}

                {item.best_career_match && (
                  <div className="history-detail">
                    <span className="label">Best Match:</span>
                    <span className="value">{item.best_career_match}</span>
                  </div>
                )}

                {item.match_probability !== null &&
                  item.match_probability !== undefined && (
                    <div className="history-detail">
                      <span className="label">Match Probability:</span>
                      <span className="value probability">
                        {item.match_probability}%
                      </span>
                    </div>
                  )}

                {item.total_skills_found !== null &&
                  item.total_skills_found !== undefined && (
                    <div className="history-detail">
                      <span className="label">Skills Found:</span>
                      <span className="value">{item.total_skills_found}</span>
                    </div>
                  )}

                {item.job_description && (
                  <div className="history-detail job-desc">
                    <span className="label">Job Description:</span>
                    <p className="value">
                      {item.job_description.substring(0, 150)}
                      {item.job_description.length > 150 ? "..." : ""}
                    </p>
                  </div>
                )}

                {item.notes && (
                  <div className="history-detail">
                    <span className="label">Notes:</span>
                    <p className="value">{item.notes}</p>
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
