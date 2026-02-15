"use client";


function Sidebar({ setCurrentPage, currentPage }) {
  return (
    <div className="sidebar">
      <nav className="sidebar-nav">
        <ul className="sidebar-menu">
          <li
            className={`menu-item upload-item ${
              currentPage === "upload" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("upload")}
          >
            <span className="menu-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </span>
            <span className="menu-text">Upload Resume</span>
          </li>

          <li
            className={`menu-item ${
              currentPage === "dashboard" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("dashboard")}
          >
            <span className="menu-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <rect x="3" y="3" width="7" height="7" strokeWidth={2} />
                <rect x="14" y="3" width="7" height="7" strokeWidth={2} />
                <rect x="14" y="14" width="7" height="7" strokeWidth={2} />
                <rect x="3" y="14" width="7" height="7" strokeWidth={2} />
              </svg>
            </span>
            <span className="menu-text">Dashboard</span>
          </li>
          <li
            className={`menu-item ${
              currentPage === "resume_optimizer" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("resume_optimizer")}
          >
            <span className="menu-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </span>
            <span className="menu-text">Resume Optimizer</span>
          </li>
          <li
            className={`menu-item ${
              currentPage === "skill_gap" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("skill_gap")}
          >
            <span className="menu-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </span>
            <span className="menu-text">Skill Gap Analyzer</span>
          </li>
          <li
            className={`menu-item ${
              currentPage === "mock_interview" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("mock_interview")}
          >
            <span className="menu-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </span>
            <span className="menu-text">Mock Interview</span>
          </li>
          <li
            className={`menu-item ${
              currentPage === "cold_email" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("cold_email")}
          >
            <span className="menu-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </span>
            <span className="menu-text">Cold Email Generator</span>
          </li>
          <li
            className={`menu-item ${
              currentPage === "study_planner" ? "active" : ""
            }`}
            onClick={() => setCurrentPage("study_planner")}
          >
            <span className="menu-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </span>
            <span className="menu-text">Study Planner</span>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export default Sidebar;
