// src/components/GoogleCalendarSync.js
import React, { useState, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { Calendar, Check, AlertCircle, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "../api/supabaseClient";

// Google Calendar API scope
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// Google OAuth client ID — set in .env as REACT_APP_GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

function GoogleCalendarSync({ targetCareer, disabled }) {
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState(null); // { success, message, created_count }
  const [removeResult, setRemoveResult] = useState(null);
  const [error, setError] = useState(null);

  // Persisted sync state (loaded from backend)
  const [syncStatus, setSyncStatus] = useState(null); // { synced, event_count, synced_at, preferences_changed }
  const [loadingStatus, setLoadingStatus] = useState(false);

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  // Load sync status from backend on mount / career change
  useEffect(() => {
    if (!targetCareer) return;
    let cancelled = false;

    (async () => {
      setLoadingStatus(true);
      try {
        const token = await getAuthToken();
        if (!token) return;

        const res = await fetch(
          `http://localhost:8000/api/v1/orchestrator/calendar-sync-status?target_career=${encodeURIComponent(targetCareer)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!cancelled && data.success) {
          setSyncStatus(data);
          // Clear any stale result/error from a previous career tab
          setResult(null);
          setError(null);
        }
      } catch (err) {
        console.warn("Could not load calendar sync status:", err);
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();

    return () => { cancelled = true; };
  }, [targetCareer]);

  /**
   * Wait for the Google Identity Services library to load (up to 10 seconds).
   */
  const waitForGIS = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 200;
        if (window.google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        } else if (elapsed >= 10000) {
          clearInterval(interval);
          reject(new Error("Google Identity Services failed to load. Check your internet connection or disable ad-blockers."));
        }
      }, 200);
    });
  }, []);

  /**
   * Get a Google access token via the Google Identity Services popup.
   */
  const getGoogleAccessToken = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      throw new Error("Google Client ID not configured. Set REACT_APP_GOOGLE_CLIENT_ID in your .env file.");
    }

    await waitForGIS();

    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: CALENDAR_SCOPE,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
          } else {
            resolve(response.access_token);
          }
        },
        error_callback: (err) => {
          reject(new Error(err.message || "Google sign-in was cancelled"));
        },
      });

      client.requestAccessToken();
    });
  }, [waitForGIS]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setResult(null);

    try {
      // 1. Get Google access token via popup
      const googleToken = await getGoogleAccessToken();

      // 2. Get our app auth token
      const appToken = await getAuthToken();
      if (!appToken) {
        throw new Error("Please sign in to your CareerLM account first.");
      }

      // 3. Get timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

      // 4. Call backend to sync (handles delete old + create new)
      const formData = new FormData();
      formData.append("target_career", targetCareer);
      formData.append("google_access_token", googleToken);
      formData.append("timezone", timezone);

      const response = await fetch(
        "http://localhost:8000/api/v1/orchestrator/sync-to-google-calendar",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${appToken}` },
          body: formData,
        }
      );

      const data = await response.json();

      if (data.success) {
        const msg = data.replaced_old
          ? `Updated ${data.created_count} study sessions (replaced ${data.old_events_deleted} old events)`
          : data.message;
        setResult({
          success: true,
          message: msg,
          created_count: data.created_count,
          total: data.total,
          replaced: data.replaced_old,
        });
        // Update persisted status so it shows "Synced" on next visit
        setSyncStatus({
          synced: true,
          event_count: data.created_count,
          synced_at: new Date().toISOString(),
          preferences_changed: false,
        });
      } else {
        throw new Error(data.error || "Failed to sync to Google Calendar");
      }
    } catch (err) {
      console.error("Calendar sync error:", err);
      setError(err.message || "Failed to sync to Google Calendar");
    } finally {
      setSyncing(false);
    }
  }, [targetCareer, getGoogleAccessToken]);

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    setError(null);
    setResult(null);
    setRemoveResult(null);

    try {
      const googleToken = await getGoogleAccessToken();
      const appToken = await getAuthToken();
      if (!appToken) throw new Error("Please sign in first.");

      const formData = new FormData();
      formData.append("target_career", targetCareer);
      formData.append("google_access_token", googleToken);

      const response = await fetch(
        "http://localhost:8000/api/v1/orchestrator/remove-from-google-calendar",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${appToken}` },
          body: formData,
        }
      );

      const data = await response.json();

      if (data.success) {
        setRemoveResult({ success: true, message: data.message, deleted_count: data.deleted_count });
        setSyncStatus(null);
      } else {
        throw new Error(data.error || "Failed to remove events");
      }
    } catch (err) {
      console.error("Calendar remove error:", err);
      setError(err.message || "Failed to remove events from Google Calendar");
    } finally {
      setRemoving(false);
    }
  }, [targetCareer, getGoogleAccessToken]);

  // ── Render: just removed events ──
  if (removeResult?.success) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {removeResult.message}
            </p>
            <p className="text-xs text-blue-600/70 dark:text-blue-500/70 mt-0.5">
              Your Google Calendar has been cleaned up
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="text-xs border-blue-500/30 text-blue-700 hover:bg-blue-500/10"
          >
            <Calendar className="w-3 h-3 mr-1" />
            Sync Again
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: just completed a sync ──
  if (result?.success) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            {result.message}
          </p>
          <p className="text-xs text-green-600/70 dark:text-green-500/70 mt-0.5">
            {result.created_count} study sessions in your Google Calendar
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing || removing}
            className="text-xs border-green-500/30 text-green-700 hover:bg-green-500/10"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
            Re-sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={syncing || removing}
            className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            {removing ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3 mr-1" />
            )}
            Remove
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: previously synced (loaded from DB) ──
  if (syncStatus?.synced && !result) {
    const syncDate = syncStatus.synced_at
      ? new Date(syncStatus.synced_at).toLocaleDateString()
      : "";
    const prefsChanged = syncStatus.preferences_changed;

    return (
      <div className="space-y-2">
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${
          prefsChanged
            ? "bg-amber-500/10 border-amber-500/20"
            : "bg-green-500/10 border-green-500/20"
        }`}>
          {prefsChanged ? (
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          ) : (
            <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${
              prefsChanged
                ? "text-amber-700 dark:text-amber-400"
                : "text-green-700 dark:text-green-400"
            }`}>
              {prefsChanged
                ? "Your preferences have changed since last sync"
                : `${syncStatus.event_count} sessions synced to Google Calendar`}
            </p>
            <p className={`text-xs mt-0.5 ${
              prefsChanged
                ? "text-amber-600/70 dark:text-amber-500/70"
                : "text-green-600/70 dark:text-green-500/70"
            }`}>
              {prefsChanged
                ? `Last synced ${syncDate}. Re-sync to update your schedule with new preferences.`
                : `Synced on ${syncDate}`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing || removing || disabled}
              className={`text-xs ${
                prefsChanged
                  ? "border-amber-500/30 text-amber-700 hover:bg-amber-500/10"
                  : "border-green-500/30 text-green-700 hover:bg-green-500/10"
              }`}
            >
              {syncing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              {prefsChanged ? "Re-sync" : "Sync Again"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={syncing || removing || disabled}
              className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              {removing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3 mr-1" />
              )}
              Remove
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render: not synced yet ──
  return (
    <div className="space-y-2">
      <Button
        onClick={handleSync}
        disabled={disabled || syncing || loadingStatus || !targetCareer}
        variant="outline"
        className="w-full sm:w-auto gap-2 border-blue-500/30 text-blue-600 hover:bg-blue-500/10 hover:border-blue-500/50"
      >
        {syncing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Calendar className="w-4 h-4" />
        )}
        {syncing ? "Syncing to Calendar..." : "Add to Google Calendar"}
      </Button>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}

export default GoogleCalendarSync;
