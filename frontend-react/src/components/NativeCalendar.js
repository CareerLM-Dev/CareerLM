// src/components/NativeCalendar.js
// Native React monthly calendar with hover popovers and Framer Motion animations.
// Supports both 'standard' (computed dates from schedule) and 'quick_prep' (explicit dates).

import React, { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ExternalLink, Zap, BookOpen, Calendar as CalIcon } from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a map from ISO date string (YYYY-MM-DD) → array of day entries
 * so calendar cells can do O(1) lookups.
 */
function buildDateMap(dayEntries) {
  const map = {};
  for (const entry of dayEntries) {
    const key = entry.date; // must be YYYY-MM-DD
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push(entry);
  }
  return map;
}

/** ISO date string for a datetime object */
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Return all Date objects for days in the current month view (Mon–Sun grid with padding) */
function getMonthGrid(year, month) {
  // month is 0-indexed (JS-style)
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Grid starts on Monday (ISO week)
  const startOffset = (firstDay.getDay() + 6) % 7; // days before the 1st

  const days = [];
  // Padding from previous month
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, isCurrentMonth: false });
  }
  // Current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  // Padding to fill grid (up to 6 rows × 7 = 42)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  }
  return days;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const POPOVER_PADDING = 12;
const POPOVER_GAP = 12;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPopoverGeometry(anchorRect, popoverRect) {
  if (!anchorRect) {
    return {
      placement: "bottom",
      style: { top: POPOVER_PADDING, left: POPOVER_PADDING },
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popoverWidth = popoverRect?.width || 320;
  const popoverHeight = popoverRect?.height || 220;

  const spaces = {
    top: anchorRect.top - POPOVER_GAP - POPOVER_PADDING,
    bottom: viewportHeight - anchorRect.bottom - POPOVER_GAP - POPOVER_PADDING,
    left: anchorRect.left - POPOVER_GAP - POPOVER_PADDING,
    right: viewportWidth - anchorRect.right - POPOVER_GAP - POPOVER_PADDING,
  };

  let placement = "bottom";
  if (spaces.bottom >= popoverHeight || spaces.bottom >= spaces.top) {
    placement = "bottom";
  } else if (spaces.top >= popoverHeight || spaces.top >= spaces.bottom) {
    placement = "top";
  } else if (spaces.right >= popoverWidth || spaces.right >= spaces.left) {
    placement = "right";
  } else {
    placement = "left";
  }

  let top = anchorRect.bottom + POPOVER_GAP;
  let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;

  if (placement === "top") {
    top = anchorRect.top - POPOVER_GAP - popoverHeight;
  } else if (placement === "right") {
    top = anchorRect.top + anchorRect.height / 2 - popoverHeight / 2;
    left = anchorRect.right + POPOVER_GAP;
  } else if (placement === "left") {
    top = anchorRect.top + anchorRect.height / 2 - popoverHeight / 2;
    left = anchorRect.left - POPOVER_GAP - popoverWidth;
  }

  const boundedLeft = clamp(left, POPOVER_PADDING, Math.max(POPOVER_PADDING, viewportWidth - popoverWidth - POPOVER_PADDING));
  const boundedTop = clamp(top, POPOVER_PADDING, Math.max(POPOVER_PADDING, viewportHeight - popoverHeight - POPOVER_PADDING));

  return {
    placement,
    style: {
      top: `${boundedTop}px`,
      left: `${boundedLeft}px`,
    },
  };
}

// ── Popover ────────────────────────────────────────────────────────────────

const DayPopover = React.forwardRef(function DayPopover(
  { entries, planType, placement = "bottom", position, onMouseEnter, onMouseLeave },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label="Calendar preview"
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className="fixed z-[70] w-[min(20rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1rem)] 
                 bg-popover border border-border rounded-xl shadow-2xl p-3 space-y-2
                 pointer-events-auto overflow-y-auto overscroll-contain"
      style={{
        ...position,
        maxHeight: "min(24rem, calc(100vh - 1.5rem))",
        filter: "drop-shadow(0 10px 28px rgba(0,0,0,0.2))",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Arrow */}
      <div
        className={`absolute w-3 h-3 overflow-hidden ${
          placement === "top"
            ? "top-full left-1/2 -translate-x-1/2"
            : placement === "bottom"
              ? "bottom-full left-1/2 -translate-x-1/2"
              : placement === "left"
                ? "left-full top-1/2 -translate-y-1/2"
                : "right-full top-1/2 -translate-y-1/2"
        }`}
      >
        <div className="w-3 h-3 bg-popover border border-border rotate-45 -translate-y-1.5 mx-auto" />
      </div>

      {entries.map((entry, idx) => (
        <div key={idx} className={idx > 0 ? "pt-2 border-t border-border" : ""}>
          {/* Focus header */}
          <div className="flex items-center gap-1.5 mb-1">
            {planType === "quick_prep" ? (
              <Zap className="w-3 h-3 text-amber-500 flex-shrink-0" />
            ) : (
              <BookOpen className="w-3 h-3 text-primary flex-shrink-0" />
            )}
            <span className="text-xs font-semibold text-foreground truncate">
              {entry.focus || entry.skill || "Study Session"}
            </span>
            {entry.day && (
              <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
                Day {entry.day}
              </span>
            )}
          </div>

          {/* Task description */}
          {entry.task && (
            <p className="text-[11px] text-muted-foreground leading-tight mb-1.5 line-clamp-2">
              {entry.task}
            </p>
          )}

          {/* Resource link */}
          {entry.resource?.url && (
            <div
              className="flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                window.open(entry.resource.url, "_blank", "noopener");
              }}
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{entry.resource.title || "Open Resource"}</span>
              {entry.resource.est_time && (
                <span className="ml-auto text-muted-foreground whitespace-nowrap">
                  {entry.resource.est_time}
                </span>
              )}
            </div>
          )}

          {/* Deliverable */}
          {entry.deliverable && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium leading-tight">
              ✓ {entry.deliverable}
            </p>
          )}

          {/* Standard plan: resource type + step info */}
          {entry.step_title && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {entry.step_title}
            </p>
          )}
        </div>
      ))}
    </motion.div>
  );
});

// ── Calendar Cell ──────────────────────────────────────────────────────────

const CalendarCell = React.forwardRef(function CalendarCell(
  { dateObj, isCurrentMonth, entries, planType, isToday, isDeadline, isPopoverActive, onHoverEnter, onHoverLeave, onTogglePopover },
  ref,
) {
  const hasEntries = entries && entries.length > 0;

  // Colour dot per entry
  const dotColors = planType === "quick_prep"
    ? ["bg-amber-500", "bg-orange-400", "bg-yellow-400"]
    : ["bg-primary", "bg-emerald-500", "bg-blue-400"];

  return (
    <div
      className={`
        relative flex flex-col items-center justify-start p-1 rounded-lg min-h-[52px] text-center
        transition-colors duration-150 group
        ${isCurrentMonth ? "text-foreground" : "text-muted-foreground/40"}
        ${hasEntries ? "cursor-pointer hover:bg-muted/50" : ""}
        ${isPopoverActive ? "bg-muted/60 ring-2 ring-primary/35" : ""}
        ${isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-background font-bold" : ""}
        ${isDeadline ? "bg-red-500/8 ring-1 ring-red-500/40" : ""}
      `}
      onMouseEnter={(e) => hasEntries && onHoverEnter?.(e.currentTarget, entries, dateObj)}
      onMouseLeave={() => hasEntries && onHoverLeave?.()}
      onClick={(e) => hasEntries && onTogglePopover?.(e.currentTarget, entries, dateObj)}
      onFocus={(e) => hasEntries && onHoverEnter?.(e.currentTarget, entries, dateObj)}
      onBlur={() => hasEntries && onHoverLeave?.()}
      ref={ref}
      tabIndex={hasEntries ? 0 : undefined}
      aria-haspopup={hasEntries ? "dialog" : undefined}
      aria-expanded={isPopoverActive ? true : undefined}
    >
      {/* Day number */}
      <span
        className={`
          text-xs leading-none mb-1 mt-0.5 w-6 h-6 flex items-center justify-center rounded-full
          ${isToday ? "bg-primary text-primary-foreground font-bold" : ""}
          ${isDeadline && !isToday ? "text-red-500 font-semibold" : ""}
        `}
      >
        {dateObj.getDate()}
      </span>

      {/* Activity dots */}
      {hasEntries && (
        <div className="flex gap-0.5 flex-wrap justify-center max-w-[32px]">
          {entries.slice(0, 3).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${dotColors[i % dotColors.length]} opacity-90`}
            />
          ))}
        </div>
      )}

      {/* Deadline badge */}
      {isDeadline && (
        <span className="text-[8px] text-red-500 font-semibold leading-none mt-0.5">
          DEADLINE
        </span>
      )}

    </div>
  );
});

// ── Progress Bar (Quick Prep) ──────────────────────────────────────────────

function QuickPlanProgress({ dayEntries, deadline }) {
  const deadlineDate = deadline ? new Date(deadline) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!deadlineDate) return null;

  const totalDays = dayEntries.length || 1;
  const totalMs = deadlineDate - (dayEntries[0]?.date ? new Date(dayEntries[0].date) : today);
  const elapsedMs = today - (dayEntries[0]?.date ? new Date(dayEntries[0].date) : today);
  const progress = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));

  const daysLeft = Math.max(0, Math.ceil((deadlineDate - today) / 86400000));

  return (
    <div className="flex items-center gap-3 mb-3 px-1">
      <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />
      <div className="flex-1">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span className="font-medium text-amber-600 dark:text-amber-400">Quick Prep Progress</span>
          <span>
            {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining` : "Deadline reached"}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>
      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
        {totalDays}d plan
      </span>
    </div>
  );
}

// ── Main Calendar Component ────────────────────────────────────────────────

/**
 * NativeCalendar
 *
 * Props:
 *   dayEntries   – array of { date, focus?, task?, resource?, deliverable?, skill?, step_title?, day? }
 *                  'date' must be an ISO string (YYYY-MM-DD)
 *   planType     – "standard" | "quick_prep"
 *   deadline     – ISO date string (quick_prep only)
 *   startDate    – ISO date string; default = today
 */
export default function NativeCalendar({ dayEntries = [], planType = "standard", deadline, startDate }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Initialise to the month that contains the first entry or today
  const initialDate = useMemo(() => {
    if (dayEntries.length > 0 && dayEntries[0].date) {
      return new Date(dayEntries[0].date);
    }
    return startDate ? new Date(startDate) : new Date();
  }, [dayEntries, startDate]);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [slideDirection, setSlideDirection] = useState(0); // -1 = back, 1 = forward

  const dateMap = useMemo(() => buildDateMap(dayEntries), [dayEntries]);

  const gridDays = useMemo(
    () => getMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const deadlineIso = deadline ? deadline.split("T")[0] : null;

  const [popoverState, setPopoverState] = useState(null);
  const popoverRef = useRef(null);
  const anchorElRef = useRef(null);
  const closeTimerRef = useRef(null);

  const clearPopoverTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closePopover = useCallback(() => {
    clearPopoverTimer();
    anchorElRef.current = null;
    setPopoverState(null);
  }, [clearPopoverTimer]);

  const openPopover = useCallback((anchorEl, entries, dateObj, pinned = false) => {
    if (!anchorEl || !entries?.length) return;
    clearPopoverTimer();
    anchorElRef.current = anchorEl;
    const anchorKey = toISODate(dateObj);
    setPopoverState((prev) => {
      const next = {
        anchorKey,
        entries,
        pinned,
        placement: prev?.anchorKey === anchorKey ? prev.placement : "bottom",
        position: prev?.anchorKey === anchorKey ? prev.position : { top: POPOVER_PADDING, left: POPOVER_PADDING },
      };
      return next;
    });
  }, [clearPopoverTimer]);

  const scheduleClose = useCallback(() => {
    clearPopoverTimer();
    if (popoverState?.pinned) return;
    closeTimerRef.current = setTimeout(() => {
      closePopover();
    }, 120);
  }, [clearPopoverTimer, closePopover, popoverState?.pinned]);

  const togglePinnedPopover = useCallback((anchorEl, entries, dateObj) => {
    const anchorKey = toISODate(dateObj);
    if (popoverState?.anchorKey === anchorKey && popoverState?.pinned) {
      closePopover();
      return;
    }
    openPopover(anchorEl, entries, dateObj, true);
  }, [closePopover, openPopover, popoverState?.anchorKey, popoverState?.pinned]);

  const syncPopoverPosition = useCallback(() => {
    const anchorEl = anchorElRef.current;
    const popoverEl = popoverRef.current;
    if (!anchorEl || !popoverEl) return;

    const anchorRect = anchorEl.getBoundingClientRect();
    const popoverRect = popoverEl.getBoundingClientRect();
    const next = getPopoverGeometry(anchorRect, popoverRect);

    setPopoverState((prev) => {
      if (!prev) return prev;
      const nextTop = next.style.top;
      const nextLeft = next.style.left;
      const currentTop = prev.position?.top;
      const currentLeft = prev.position?.left;
      if (prev.placement === next.placement && currentTop === nextTop && currentLeft === nextLeft) {
        return prev;
      }
      return {
        ...prev,
        placement: next.placement,
        position: next.style,
      };
    });
  }, []);

  useLayoutEffect(() => {
    if (!popoverState) return undefined;

    syncPopoverPosition();

    const onResizeOrScroll = () => syncPopoverPosition();
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        closePopover();
      }
    };
    const onPointerDown = (e) => {
      const anchorEl = anchorElRef.current;
      const popoverEl = popoverRef.current;
      if (anchorEl?.contains(e.target) || popoverEl?.contains(e.target)) return;
      closePopover();
    };

    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closePopover, popoverState, syncPopoverPosition]);

  useEffect(() => () => clearPopoverTimer(), [clearPopoverTimer]);

  const slideVariants = {
    enter: (dir) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };

  const goToPrev = useCallback(() => {
    closePopover();
    setSlideDirection(-1);
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, [closePopover]);

  const goToNext = useCallback(() => {
    closePopover();
    setSlideDirection(1);
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, [closePopover]);

  // Jump-to-today
  const goToToday = useCallback(() => {
    closePopover();
    setSlideDirection(0);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }, [closePopover, today]);

  if (!dayEntries || dayEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-sm gap-2">
        <CalIcon className="w-8 h-8 opacity-40" />
        <p>No calendar data available for this plan yet.</p>
      </div>
    );
  }

  return (
    <div className="select-none">
      {/* Quick prep progress bar */}
      {planType === "quick_prep" && (
        <QuickPlanProgress dayEntries={dayEntries} deadline={deadline} />
      )}

      {/* Header row: navigation + month/year */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          onClick={goToPrev}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h3>
          {(viewYear !== today.getFullYear() || viewMonth !== today.getMonth()) && (
            <button
              onClick={goToToday}
              className="text-[10px] px-2 py-0.5 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
            >
              Today
            </button>
          )}
        </div>

        <button
          onClick={goToNext}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((day) => (
          <div key={day} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid — animated slide on month change */}
      <AnimatePresence mode="wait" custom={slideDirection}>
        <motion.div
          key={`${viewYear}-${viewMonth}`}
          custom={slideDirection}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.8 }}
          className="grid grid-cols-7 gap-0.5"
        >
          {gridDays.map(({ date, isCurrentMonth }, idx) => {
            const iso = toISODate(date);
            const entries = dateMap[iso] || [];
            const isToday = iso === toISODate(today);
            const isDeadline = iso === deadlineIso;
            const isPopoverActive = popoverState?.anchorKey === iso;

            return (
              <CalendarCell
                key={idx}
                ref={isPopoverActive ? anchorElRef : null}
                dateObj={date}
                isCurrentMonth={isCurrentMonth}
                entries={entries}
                planType={planType}
                isToday={isToday}
                isDeadline={isDeadline}
                isPopoverActive={isPopoverActive}
                onHoverEnter={openPopover}
                onHoverLeave={scheduleClose}
                onTogglePopover={togglePinnedPopover}
              />
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-1 flex-wrap">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className={`w-2 h-2 rounded-full ${planType === "quick_prep" ? "bg-amber-500" : "bg-primary"}`} />
          {planType === "quick_prep" ? "Quick Prep task" : "Study session"}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center text-[8px] font-bold">T</span>
          Today
        </div>
        {deadlineIso && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            Deadline
          </div>
        )}
        <p className="ml-auto text-[10px] text-muted-foreground italic">Hover over a date to see tasks</p>
      </div>

      {typeof window !== "undefined" && popoverState && createPortal(
        <DayPopover
          ref={popoverRef}
          entries={popoverState.entries}
          planType={planType}
          placement={popoverState.placement}
          position={popoverState.position}
          onMouseEnter={clearPopoverTimer}
          onMouseLeave={scheduleClose}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Utility: convert standard skill_gap_report + schedule into day entries ─

/**
 * Converts a standard study plan (skill_gap_report + schedule_summary)
 * into day-entry objects that NativeCalendar understands.
 *
 * Uses the same weekday-spreading logic as the Google Calendar sync.
 *
 * @param {Array}  skillGapReport   – skill_gap_report from backend
 * @param {Object} scheduleSummary  – schedule_summary from backend
 * @returns {Array} dayEntries with .date (YYYY-MM-DD), .skill, .step_title, .resource, .focus
 */
export function buildStandardDayEntries(skillGapReport, scheduleSummary) {
  if (!skillGapReport || skillGapReport.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() + 1); // start from tomorrow

  // Weekday-only spread (Mon–Fri)
  const STUDY_DAYS = new Set([1, 2, 3, 4, 5]); // Mon=1...Fri=5

  const entries = [];

  const getNextStudyDate = (from) => {
    const d = new Date(from);
    d.setDate(d.getDate() + 1);
    while (!STUDY_DAYS.has(d.getDay())) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  };

  let cursor = new Date(start);
  // Align to first weekday
  while (!STUDY_DAYS.has(cursor.getDay())) {
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const skillEntry of skillGapReport) {
    const skillName = skillEntry.skill || "Skill";
    for (const step of (skillEntry.learning_path || [])) {
      const isoDate = toISODate(cursor);
      entries.push({
        date: isoDate,
        skill: skillName,
        focus: `${skillName} — ${step.label || "Study"}`,
        task: step.title || "Study this resource",
        step_title: step.title,
        resource: step.url
          ? { title: step.title, url: step.url, est_time: step.est_time }
          : null,
        deliverable: `Complete step: ${step.label || step.title}`,
      });
      cursor = getNextStudyDate(cursor);
    }
  }

  return entries;
}
