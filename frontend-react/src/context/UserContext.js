// src/context/UserContext.js
import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from "react";
import { supabase } from "../api/supabaseClient";

const UserContext = createContext();

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const initialised = useRef(false);

  // Memoised handler so the reference is stable
  const applySession = useCallback((newSession) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
  }, []);

  useEffect(() => {
    // 1️⃣  Register the listener FIRST so we never miss a
    //     SIGNED_IN / TOKEN_REFRESHED event that fires while
    //     getSession() is still resolving.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      // Defer state updates so Supabase internals finish first
      setTimeout(() => {
        applySession(currentSession);
        setLoading(false);
        initialised.current = true;
      }, 0);
    });

    // 2️⃣  Then hydrate from localStorage / cookie (fast, synchronous cache).
    //     Only set loading=false here if onAuthStateChange hasn't fired yet.
    const initSession = async () => {
      try {
        const {
          data: { session: existingSession },
        } = await supabase.auth.getSession();

        // Only apply if the listener hasn't already updated state
        if (!initialised.current) {
          applySession(existingSession);
          setLoading(false);
          initialised.current = true;
        }
      } catch (error) {
        console.error("Error getting session:", error);
        if (!initialised.current) {
          setLoading(false);
          initialised.current = true;
        }
      }
    };

    initSession();

    return () => subscription.unsubscribe();
  }, [applySession]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error("Error signing out:", error);
      throw error;
    }
  };

  // Convenience method — components can force a session refresh
  const refreshSession = useCallback(async () => {
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();
      applySession(freshSession);
      return freshSession;
    } catch (err) {
      console.error("Error refreshing session:", err);
      return null;
    }
  }, [applySession]);

  const value = {
    user,
    session,
    loading,
    signOut,
    refreshSession,
    isAuthenticated: !!user,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
