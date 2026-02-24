import React from "react";
import { Routes, Route } from "react-router-dom";
import { UserProvider } from "./context/UserContext";
import { ThemeProvider } from "./context/ThemeContext";
import Navbar from "./components/layout/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import History from "./components/History";
import Onboarding from "./pages/Onboarding";
import ResumeUploadPage from "./pages/ResumeUploadPage";
import Profile from "./pages/Profile";
import AuthCallback from "./pages/AuthCallback";


function App() {
  return (
    <ThemeProvider>
    <UserProvider>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Navbar */}
        <Navbar />

        {/* Page content fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protected routes — redirect to /auth if not authenticated */}
            <Route path="/onboarding/:userId" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/upload-resume" element={<ProtectedRoute><ResumeUploadPage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          </Routes>
        </div>
      </div>
    </UserProvider>
    </ThemeProvider>
  );
}

export default App;
