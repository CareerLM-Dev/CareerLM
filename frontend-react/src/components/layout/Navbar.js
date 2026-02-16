"use client";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useUser } from "../../context/UserContext";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { 
  User, 
  LayoutDashboard, 
  Clock, 
  LogOut,
  ChevronDown,
  Sun,
  Moon
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isAuthenticated } = useUser();
  const { theme, toggleTheme } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Function to navigate to home and scroll to section
  const handleSectionNavigation = (sectionId) => {
    if (location.pathname === "/") {
      // Already on home page, just scroll
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      // Navigate to home first, then scroll
      navigate("/");
      // Wait for navigation and DOM update
      setTimeout(() => {
        const section = document.getElementById(sectionId);
        if (section) {
          section.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowDropdown(false);
      navigate("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleNavigate = (path) => {
    navigate(path);
    setShowDropdown(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-10 py-5 bg-background/95 backdrop-blur-md border-b border-border/40 transition-all duration-300">
      <div className="flex items-center">
        <Link 
          to="/" 
          className="text-3xl font-extrabold text-primary hover:scale-105 transition-transform duration-300 tracking-tight"
        >
          CareerLM
        </Link>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Only show navigation links when not logged in */}
        {!isAuthenticated && (
          <>
            <Button
              variant="ghost"
              onClick={() => handleSectionNavigation("home")}
              className="font-semibold text-foreground hover:text-primary hover:bg-primary/10"
            >
              Home
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSectionNavigation("about")}
              className="font-semibold text-foreground hover:text-primary hover:bg-primary/10"
            >
              About
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleSectionNavigation("contact")}
              className="font-semibold text-foreground hover:text-primary hover:bg-primary/10"
            >
              Contact
            </Button>
          </>
        )}

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 text-foreground hover:text-primary hover:bg-primary/10"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        {isAuthenticated ? (
          <div className="relative ml-4" ref={dropdownRef}>
            <Button
              variant="outline"
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-3 px-4 py-2 bg-primary/10 border-primary/20 hover:bg-primary/15 hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </div>
              <span className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-foreground text-sm">
                {user?.email}
              </span>
              <ChevronDown 
                className={`h-4 w-4 transition-transform duration-300 ${
                  showDropdown ? "rotate-180" : ""
                }`} 
              />
            </Button>

            {showDropdown && (
              <div className="absolute right-0 mt-2 w-64 rounded-lg border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-4">
                  <p className="text-sm font-medium text-card-foreground truncate">
                    {user?.email}
                  </p>
                </div>
                
                <Separator />
                
                <div className="p-2">
                  <Button
                    variant="ghost"
                    onClick={() => handleNavigate("/profile")}
                    className="w-full justify-start gap-3 font-semibold hover:bg-accent hover:text-accent-foreground"
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </Button>
                  
                  <Button
                    variant="ghost"
                    onClick={() => handleNavigate("/dashboard")}
                    className="w-full justify-start gap-3 font-semibold hover:bg-accent hover:text-accent-foreground"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Button>
                  
                  <Button
                    variant="ghost"
                    onClick={() => handleNavigate("/history")}
                    className="w-full justify-start gap-3 font-semibold hover:bg-accent hover:text-accent-foreground"
                  >
                    <Clock className="h-4 w-4" />
                    History
                  </Button>
                </div>
                
                <Separator />
                
                <div className="p-2">
                  <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    className="w-full justify-start gap-3 font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => navigate("/auth")}
              className="ml-4 font-semibold bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
            >
              Login
            </Button>
            <Button
              onClick={() => navigate("/auth")}
              className="ml-2 font-semibold bg-primary text-primary-foreground hover:opacity-90 hover:-translate-y-0.5 shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all duration-300"
            >
              Sign Up
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
