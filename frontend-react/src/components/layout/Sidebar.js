"use client";
import { cn } from "../../lib/utils";
import { 
  Upload, 
  LayoutDashboard, 
  FileText, 
  BarChart3, 
  Mic, 
  Mail, 
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

function Sidebar({ setCurrentPage, currentPage, collapsed, onToggle }) {
  const menuItems = [
    {
      id: "upload",
      label: "Upload Resume",
      icon: Upload,
      className: "bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10",
    },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "resume_optimizer",
      label: "Resume Optimizer",
      icon: FileText,
    },
    {
      id: "skill_gap",
      label: "Skill Gap Analyzer",
      icon: BarChart3,
    },
    {
      id: "mock_interview",
      label: "Mock Interview",
      icon: Mic,
    },
    {
      id: "cold_email",
      label: "Cold Email Generator",
      icon: Mail,
    },
    {
      id: "study_planner",
      label: "Study Planner",
      icon: BookOpen,
    },
  ];

  return (
    <aside
      className={cn(
        "relative flex-shrink-0 flex h-full flex-col border-r border-border bg-card shadow-sm transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-72"
      )}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground transition-colors"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </button>

      <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden", collapsed ? "p-2" : "p-4")}>
        <ul className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            
            return (
              <li
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex cursor-pointer items-center rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5",
                  collapsed ? "justify-center px-2 py-3" : "gap-3 px-6 py-4",
                  isActive
                    ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/30"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:shadow-md",
                  item.className && !isActive && item.className
                )}
              >
                <span className={cn(
                  "flex items-center justify-center rounded-lg transition-all duration-300 flex-shrink-0",
                  collapsed ? "h-9 w-9" : "h-10 w-10",
                  isActive 
                    ? "bg-primary-foreground/20" 
                    : "bg-muted group-hover:bg-background"
                )}>
                  <Icon 
                    className={cn(
                      "h-5 w-5 transition-all duration-300",
                      isActive ? "text-primary-foreground" : "text-foreground"
                    )} 
                  />
                </span>
                {!collapsed && (
                  <span className="flex-1 text-sm font-semibold whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

export default Sidebar;
