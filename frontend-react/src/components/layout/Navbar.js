"use client";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useUser } from "../../context/UserContext";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import {
  User,
  LogOut,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  FileText,
  Edit3,
  BarChart3,
  Mail,
  Briefcase,
  Mic,
  BookOpen,
  Menu,
  X,
  LayoutDashboard,
  BarChart,
  Upload,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

// ─── Nav group definitions ────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    id: "tailor",
    label: "Tailor Your Resume",
    items: [
      { label: "Upload Resume", icon: Upload, route: "/dashboard/upload-resume" },
      { label: "Resume Analyzer", icon: FileText, route: "/dashboard/resume-analyzer" },
      { label: "Resume Editor", icon: Edit3, route: "/dashboard/resume-editor" },
      { label: "Resume Builder", icon: Edit3, route: "/resume-builder" },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    items: [
      { label: "Skill Gap Analyzer", icon: BarChart3, route: "/dashboard/skill-gap" },
      { label: "Cold Email Generator", icon: Mail, route: "/dashboard/cold-email" },
      { label: "Job Matcher", icon: Briefcase, route: "/dashboard/job-matcher" },
    ],
  },
  {
    id: "practice",
    label: "Practice",
    items: [
      { label: "Mock Interview", icon: Mic, route: "/dashboard/mock-interview" },
      { label: "Study Planner", icon: BookOpen, route: "/dashboard/study-planner" },
    ],
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
function groupIsActive(group, pathname) {
  return group.items.some(
    (item) => pathname === item.route || pathname.startsWith(item.route)
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isAuthenticated, loading } = useUser();
  const { theme, toggleTheme } = useTheme();

  const [openGroup, setOpenGroup] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const navRef = useRef(null);

  // Close all dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenGroup(null);
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup(null);
    setShowUserMenu(false);
  }, [location.pathname]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSectionNavigation = (sectionId) => {
    if (location.pathname === "/") {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/");
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowUserMenu(false);
      setMobileOpen(false);
      navigate("/");
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  const handleGroupToggle = (groupId) => {
    setOpenGroup((prev) => (prev === groupId ? null : groupId));
    setShowUserMenu(false);
  };

  const handleUserMenuToggle = () => {
    setShowUserMenu((prev) => !prev);
    setOpenGroup(null);
  };

  const handleNavLink = (route) => {
    navigate(route);
    setOpenGroup(null);
    setShowUserMenu(false);
    setMobileOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-shrink-0 relative z-50" ref={navRef}>
      {/* ── Main bar ── */}
      <nav
        className={`flex items-center justify-between px-4 md:px-8 bg-background/95 backdrop-blur-md border-b border-border/40 transition-all duration-300 ${
          collapsed ? "h-0 py-0 border-0 overflow-hidden" : "py-3"
        }`}
      >
        {/* ── Left: Logo only ── */}
        <div className="flex items-center">
          <Link
            to="/"
            className="text-2xl font-extrabold text-primary hover:scale-105 transition-transform duration-300 tracking-tight flex-shrink-0"
          >
            CareerLM
          </Link>
        </div>

        {/* ── Right side: nav groups + controls ── */}
        <div className="flex items-center gap-1 md:gap-2">
          {/* ── Desktop: authenticated nav groups (right-aligned) ── */}
          {isAuthenticated && (
            <div className="hidden md:flex items-center gap-0.5 mr-2">
              {NAV_GROUPS.map((group) => {
                const active = groupIsActive(group, location.pathname);
                const isOpen = openGroup === group.id;

                return (
                  <div key={group.id} className="relative">
                    <button
                      id={`nav-group-${group.id}`}
                      aria-haspopup="true"
                      aria-expanded={isOpen}
                      onClick={() => handleGroupToggle(group.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 select-none ${
                        active
                          ? "text-primary bg-primary/10"
                          : "text-foreground/80 hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      {group.label}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* Dropdown panel */}
                    {isOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden"
                      >
                        <div className="p-1.5 flex flex-col gap-0.5">
                          {group.items.map((item) => {
                            const Icon = item.icon;
                            const isItemActive = location.pathname === item.route;
                            return (
                              <button
                                key={item.route}
                                role="menuitem"
                                onClick={() => handleNavLink(item.route)}
                                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-all duration-150 ${
                                  isItemActive
                                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                                    : "text-foreground hover:bg-accent hover:text-accent-foreground"
                                }`}
                              >
                                <Icon className="h-4 w-4 flex-shrink-0" />
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Public nav links (unauthenticated) */}
          {!isAuthenticated && (
            <div className="hidden md:flex items-center gap-1">
              <Button
                variant="ghost"
                onClick={() => handleSectionNavigation("home")}
                className="font-semibold text-foreground hover:text-primary hover:bg-primary/10 text-sm"
              >
                Home
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleSectionNavigation("about")}
                className="font-semibold text-foreground hover:text-primary hover:bg-primary/10 text-sm"
              >
                About
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleSectionNavigation("contact")}
                className="font-semibold text-foreground hover:text-primary hover:bg-primary/10 text-sm"
              >
                Contact
              </Button>
            </div>
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

          {/* Loading skeleton */}
          {loading ? (
            <div className="flex items-center gap-3 px-3 py-2 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-muted" />
              <div className="h-4 w-20 rounded bg-muted hidden md:block" />
            </div>
          ) : isAuthenticated ? (
            /* ── User avatar dropdown ── */
            <div className="relative">
              <Button
                variant="outline"
                onClick={handleUserMenuToggle}
                aria-haspopup="true"
                aria-expanded={showUserMenu}
                className="flex items-center gap-2 px-2 md:px-3 py-2 bg-primary/10 border-primary/20 hover:bg-primary/15 hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm flex-shrink-0">
                  {user?.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <span className="hidden md:inline max-w-[130px] overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-foreground text-sm">
                  {user?.email}
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-300 hidden md:block ${
                    showUserMenu ? "rotate-180" : ""
                  }`}
                />
              </Button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-3.5">
                    <p className="text-sm font-semibold text-card-foreground truncate">
                      {user?.email}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Signed in
                    </p>
                  </div>
                  <Separator />
                  <div className="p-1.5">
                    <button
                      onClick={() => handleNavLink("/profile")}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <User className="h-4 w-4" />
                      Profile
                    </button>
                    <button
                      onClick={() => handleNavLink("/home")}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Home
                    </button>
                    <button
                      onClick={() => handleNavLink("/dashboard")}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <BarChart className="h-4 w-4" />
                      Analytics
                    </button>
                  </div>
                  <Separator />
                  <div className="p-1.5">
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Login / Sign Up ── */
            !loading && (
              <>
                <Button
                  variant="outline"
                  onClick={() => navigate("/auth")}
                  className="hidden md:flex font-semibold bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
                >
                  Login
                </Button>
                <Button
                  onClick={() => navigate("/auth?mode=signup")}
                  className="hidden md:flex font-semibold bg-primary text-primary-foreground hover:opacity-90 hover:-translate-y-0.5 shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all duration-300"
                >
                  Sign Up
                </Button>
              </>
            )
          )}

          {/* ── Mobile hamburger ── */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 text-foreground hover:text-primary hover:bg-primary/10"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </nav>

      {/* ── Mobile slide-down menu ── */}
      {mobileOpen && (
        <div className="md:hidden border-b border-border bg-card shadow-lg animate-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 space-y-4 max-h-[80vh] overflow-y-auto">
            {isAuthenticated ? (
              <>
                {NAV_GROUPS.map((group) => (
                  <div key={group.id}>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5 px-1">
                      {group.label}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isItemActive = location.pathname === item.route;
                        return (
                          <button
                            key={item.route}
                            onClick={() => handleNavLink(item.route)}
                            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-all ${
                              isItemActive
                                ? "bg-primary text-primary-foreground"
                                : "text-foreground hover:bg-accent hover:text-accent-foreground"
                            }`}
                          >
                            <Icon className="h-4 w-4 flex-shrink-0" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <Separator />

                <div className="flex flex-col gap-0.5 pb-1">
                  <button
                    onClick={() => handleNavLink("/profile")}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </button>
                  <button
                    onClick={() => handleNavLink("/home")}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Home
                  </button>
                  <button
                    onClick={() => handleNavLink("/dashboard")}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <BarChart className="h-4 w-4" />
                    Analytics
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2 pb-2">
                <Button
                  variant="outline"
                  onClick={() => navigate("/auth")}
                  className="w-full font-semibold"
                >
                  Login
                </Button>
                <Button
                  onClick={() => navigate("/auth?mode=signup")}
                  className="w-full font-semibold"
                >
                  Sign Up
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Collapse / expand tab (public pages only) ── */}
      {!isAuthenticated && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute right-8 bottom-0 translate-y-full flex items-center justify-center w-8 h-4 bg-background/95 border border-t-0 border-border/40 rounded-b-md text-muted-foreground hover:text-primary transition-colors duration-200 shadow-sm"
          title={collapsed ? "Show navigation" : "Hide navigation"}
          aria-label={collapsed ? "Expand navbar" : "Collapse navbar"}
        >
          {collapsed ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
}

export default Navbar;
