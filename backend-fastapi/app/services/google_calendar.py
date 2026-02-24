"""
Google Calendar integration service.

Converts a study plan + questionnaire answers into concrete
Google Calendar events with dates, times, and descriptions.
"""

import logging
import math
import re
from datetime import datetime, timedelta
from typing import Optional

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────
# Time commitment → hours per week mapping
# ────────────────────────────────────────────────────────
TIME_COMMITMENT_HOURS = {
    "5_hours_week": 5,
    "10_hours_week": 10,
    "20_hours_week": 20,
    "30_hours_week": 30,
    "flexible": 10,
}

DEFAULT_HOURS_PER_WEEK = 10

# Preferred study days (default: Mon-Fri)
DEFAULT_STUDY_DAYS = [0, 1, 2, 3, 4]  # Monday=0 ... Sunday=6

# Default study start hour (24h format)
DEFAULT_START_HOUR = 18  # 6 PM
DEFAULT_SESSION_MINUTES = 60  # 1-hour blocks


def _parse_est_time_to_hours(est_time: str) -> float:
    """
    Parse an est_time string into total hours.
    E.g. '3-4 hours' → 3.5, '2-4 weeks' → 30.0, '1 week' → 10.0
    """
    if not est_time:
        return 3.0
    text = est_time.strip().lower()

    hours_range = re.search(r'(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*hour', text)
    if hours_range:
        return (float(hours_range.group(1)) + float(hours_range.group(2))) / 2

    single_hours = re.search(r'(\d+(?:\.\d+)?)\s*hour', text)
    if single_hours:
        return float(single_hours.group(1))

    weeks_range = re.search(r'(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*week', text)
    if weeks_range:
        return (float(weeks_range.group(1)) + float(weeks_range.group(2))) / 2 * 10

    single_weeks = re.search(r'(\d+(?:\.\d+)?)\s*week', text)
    if single_weeks:
        return float(single_weeks.group(1)) * 10

    months = re.search(r'(\d+(?:\.\d+)?)\s*month', text)
    if months:
        return float(months.group(1)) * 40

    return 3.0


def compute_schedule_summary(
    skill_gap_report: list[dict],
    questionnaire_answers: Optional[dict] = None,
) -> dict:
    """
    Build a schedule summary from skill_gap_report + questionnaire.

    This is the single source of truth used by both the generate endpoint
    and the cache endpoint so the frontend always gets the same shape.

    Returns dict with: total_hours, hours_per_week, total_weeks, skills[], note
    """
    qa = questionnaire_answers or {}
    time_keys = qa.get("time_commitment", [])
    if isinstance(time_keys, list) and time_keys:
        hours_per_week = TIME_COMMITMENT_HOURS.get(time_keys[0], DEFAULT_HOURS_PER_WEEK)
    elif isinstance(time_keys, str):
        hours_per_week = TIME_COMMITMENT_HOURS.get(time_keys, DEFAULT_HOURS_PER_WEEK)
    else:
        hours_per_week = DEFAULT_HOURS_PER_WEEK

    skills = []
    total_hours = 0.0

    for entry in skill_gap_report:
        skill_name = entry.get("skill", "Unknown")
        skill_hours = 0.0
        for step in entry.get("learning_path", []):
            skill_hours += _parse_est_time_to_hours(step.get("est_time", ""))

        sessions = max(1, math.ceil(skill_hours / (DEFAULT_SESSION_MINUTES / 60)))
        skills.append({
            "skill": skill_name,
            "hours": round(skill_hours, 1),
            "sessions": sessions,
        })
        total_hours += skill_hours

    total_weeks = total_hours / hours_per_week if hours_per_week > 0 else 0

    return {
        "total_hours": round(total_hours, 1),
        "hours_per_week": hours_per_week,
        "total_weeks": round(total_weeks, 1),
        "skills": skills,
        "note": (
            f"At {hours_per_week} hrs/week, this plan will take approximately "
            f"{math.ceil(total_weeks)} weeks (~{round(total_weeks / 4.3, 1)} months). "
            f"Skills are ordered by prerequisite \u2014 complete them in sequence for best results."
        ),
    }


def _distribute_sessions(
    total_hours: float,
    hours_per_week: float,
    start_date: datetime,
    study_days: list[int],
    session_minutes: int = DEFAULT_SESSION_MINUTES,
) -> list[tuple[datetime, datetime]]:
    """
    Distribute `total_hours` across calendar slots.

    Returns a list of (start_dt, end_dt) tuples for each study session.
    Each session is `session_minutes` long, spread across `study_days`.
    """
    sessions_per_week = hours_per_week / (session_minutes / 60)
    sessions_per_week = max(1, int(sessions_per_week))
    total_sessions = max(1, math.ceil(total_hours / (session_minutes / 60)))

    # Pick which days of the week to study on
    if sessions_per_week >= len(study_days):
        active_days = study_days
    else:
        # Spread evenly across the week
        step = len(study_days) / sessions_per_week
        active_days = [study_days[int(i * step)] for i in range(sessions_per_week)]

    slots: list[tuple[datetime, datetime]] = []
    current = start_date

    while len(slots) < total_sessions:
        if current.weekday() in active_days:
            start_dt = current.replace(
                hour=DEFAULT_START_HOUR, minute=0, second=0, microsecond=0
            )
            end_dt = start_dt + timedelta(minutes=session_minutes)
            slots.append((start_dt, end_dt))
        current += timedelta(days=1)

    return slots


def build_calendar_events(
    skill_gap_report: list[dict],
    questionnaire_answers: Optional[dict] = None,
    target_career: str = "",
    start_date: Optional[datetime] = None,
    timezone: str = "Asia/Kolkata",
) -> list[dict]:
    """
    Convert a study plan into Google Calendar event dicts.

    Each skill's steps are converted into study sessions distributed
    across the user's available time based on their questionnaire answers.

    Returns:
        List of Google Calendar event resource dicts ready for
        events().insert().
    """
    if start_date is None:
        # Start tomorrow
        start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)

    qa = questionnaire_answers or {}

    # Hours per week from questionnaire
    time_keys = qa.get("time_commitment", [])
    if isinstance(time_keys, list) and time_keys:
        hours_per_week = TIME_COMMITMENT_HOURS.get(time_keys[0], DEFAULT_HOURS_PER_WEEK)
    elif isinstance(time_keys, str):
        hours_per_week = TIME_COMMITMENT_HOURS.get(time_keys, DEFAULT_HOURS_PER_WEEK)
    else:
        hours_per_week = DEFAULT_HOURS_PER_WEEK

    events: list[dict] = []
    cursor_date = start_date

    for skill_idx, skill_entry in enumerate(skill_gap_report):
        skill_name = skill_entry.get("skill", f"Skill {skill_idx + 1}")

        for step in skill_entry.get("learning_path", []):
            step_hours = _parse_est_time_to_hours(step.get("est_time", ""))
            step_label = step.get("label", "Study")
            step_title = step.get("title", "")
            step_url = step.get("url", "")
            step_type = step.get("type", "Resource")
            step_num = step.get("step", "")

            # Distribute this step's hours into sessions
            sessions = _distribute_sessions(
                total_hours=step_hours,
                hours_per_week=hours_per_week,
                start_date=cursor_date,
                study_days=DEFAULT_STUDY_DAYS,
            )

            for sess_idx, (s_start, s_end) in enumerate(sessions):
                session_label = (
                    f"({sess_idx + 1}/{len(sessions)})" if len(sessions) > 1 else ""
                )

                summary = f"📚 {skill_name} — Step {step_num}: {step_label} {session_label}".strip()

                description_lines = [
                    f"🎯 Career Goal: {target_career}",
                    f"📖 Resource: {step_title}",
                    f"📂 Type: {step_type}",
                ]
                if step_url:
                    description_lines.append(f"🔗 Link: {step_url}")
                description_lines.append(f"⏱ Total step time: {step.get('est_time', 'N/A')}")
                description_lines.append(f"\nGenerated by CareerLM Study Planner")

                event = {
                    "summary": summary,
                    "description": "\n".join(description_lines),
                    "start": {
                        "dateTime": s_start.isoformat(),
                        "timeZone": timezone,
                    },
                    "end": {
                        "dateTime": s_end.isoformat(),
                        "timeZone": timezone,
                    },
                    "reminders": {
                        "useDefault": False,
                        "overrides": [
                            {"method": "popup", "minutes": 15},
                        ],
                    },
                    "colorId": str((skill_idx % 11) + 1),  # Rotate calendar colours
                }
                events.append(event)

            # Move cursor past this step's sessions
            if sessions:
                cursor_date = sessions[-1][1] + timedelta(days=1)

    return events


async def delete_events_from_google_calendar(
    access_token: str,
    event_ids: list[str],
    calendar_id: str = "primary",
) -> dict:
    """
    Delete previously synced events from Google Calendar.

    Args:
        access_token: Google OAuth2 access token with calendar.events scope.
        event_ids: List of Google Calendar event IDs to delete.
        calendar_id: Calendar to delete from (default: primary).

    Returns:
        Summary dict with deleted count and failed count.
    """
    if not event_ids:
        return {"deleted_count": 0, "failed_count": 0}

    creds = Credentials(token=access_token)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    deleted = 0
    failed = 0

    for event_id in event_ids:
        try:
            service.events().delete(
                calendarId=calendar_id,
                eventId=event_id,
            ).execute()
            deleted += 1
        except HttpError as e:
            if e.resp.status == 410:
                # Already deleted / gone — that's fine
                deleted += 1
            else:
                logger.warning(f"Failed to delete event {event_id}: {e}")
                failed += 1
        except Exception as e:
            logger.warning(f"Unexpected error deleting event {event_id}: {e}")
            failed += 1

    logger.info(f"[Google Calendar] Deleted {deleted}/{len(event_ids)} events, {failed} failed")
    return {"deleted_count": deleted, "failed_count": failed}


async def sync_events_to_google_calendar(
    access_token: str,
    events: list[dict],
    calendar_id: str = "primary",
) -> dict:
    """
    Push events to Google Calendar using the user's OAuth access token.

    Args:
        access_token: Google OAuth2 access token with calendar.events scope.
        events: List of event dicts from build_calendar_events().
        calendar_id: Calendar to insert into (default: primary).

    Returns:
        Summary dict with created count, failed count, and event links.
    """
    creds = Credentials(token=access_token)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    created = []
    failed = []

    for event in events:
        try:
            result = service.events().insert(
                calendarId=calendar_id,
                body=event,
            ).execute()
            created.append({
                "summary": event["summary"],
                "htmlLink": result.get("htmlLink", ""),
                "id": result.get("id", ""),
            })
        except HttpError as e:
            logger.warning(f"Failed to create event '{event.get('summary')}': {e}")
            failed.append({
                "summary": event["summary"],
                "error": str(e),
            })
        except Exception as e:
            logger.warning(f"Unexpected error creating event: {e}")
            failed.append({
                "summary": event["summary"],
                "error": str(e),
            })

    logger.info(
        f"[Google Calendar] Created {len(created)}/{len(events)} events, "
        f"{len(failed)} failed"
    )

    return {
        "created_count": len(created),
        "failed_count": len(failed),
        "total": len(events),
        "created_events": created,  # all event IDs needed for re-sync deletion
        "failed_events": failed,
    }
