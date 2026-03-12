import React from "react";
import { Routes, Route } from "react-router-dom";
import { UserProvider } from "./context/UserContext";
import { ThemeProvider } from "./context/ThemeContext";
import Navbar from "./components/layout/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import GlobalFloatingHelper from "./components/GlobalFloatingHelper";
import Home from "./pages/Home";
import HomePage from "./pages/HomePage";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ResumeUploadPage from "./pages/ResumeUploadPage";
import ResumeResultsPage from "./pages/ResumeResultsPage";
import History from "./components/History";
import Onboarding from "./pages/Onboarding";
import Profile from "./pages/Profile";
import AuthCallback from "./pages/AuthCallback";
import SkipComplete from "./pages/SkipComplete";
import ResumeEditorPage from "./pages/ResumeEditorPage";


function App() {
  return (
    <ThemeProvider>
    <UserProvider>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Navbar */}
        <Navbar />

        {/* Page content fills remaining space */}
        <div className="flex-1 overflow-auto">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protected routes — redirect to /auth if not authenticated */}
            <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/onboarding/:userId" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/skip-complete/:userId" element={<ProtectedRoute><SkipComplete /></ProtectedRoute>} />
            <Route path="/upload-resume" element={<ProtectedRoute><ResumeUploadPage /></ProtectedRoute>} />
            <Route path="/resume-results" element={<ProtectedRoute><ResumeResultsPage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/resume-editor" element={<ProtectedRoute><ResumeEditorPage /></ProtectedRoute>} />
          </Routes>
        </div>
        
        {/* Global Floating Helper - shows on all authenticated pages */}
        <GlobalFloatingHelper />
      </div>
    </UserProvider>
    </ThemeProvider>
  );
}

export default App;
