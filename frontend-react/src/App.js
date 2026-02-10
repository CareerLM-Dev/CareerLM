import React from "react";
import { Routes, Route } from "react-router-dom";
import { UserProvider } from "./context/UserContext";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import History from "./components/History";
import Onboarding from "./pages/Onboarding";
import ResumeUploadPage from "./pages/ResumeUploadPage";
import "./App.css";

function App() {
  return (
    <UserProvider>
      {/* Sticky Navbar on top */}
      <Navbar />

      {/* Page content */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/onboarding/:userId" element={<Onboarding />} />
        <Route path="/upload-resume" element={<ResumeUploadPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </UserProvider>
  );
}

export default App;
