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
DEFAULT_SESSION_GAP_MINUTES = 15
MAX_PARALLEL_TRACKS = 3


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


def _resolve_hours_per_week(questionnaire_answers: Optional[dict] = None) -> float:
    """Resolve the user's weekly time commitment into numeric hours."""
    qa = questionnaire_answers or {}
    time_keys = qa.get("time_commitment", [])
    if isinstance(time_keys, list) and time_keys:
        return TIME_COMMITMENT_HOURS.get(time_keys[0], DEFAULT_HOURS_PER_WEEK)
    if isinstance(time_keys, str):
        return TIME_COMMITMENT_HOURS.get(time_keys, DEFAULT_HOURS_PER_WEEK)
    return DEFAULT_HOURS_PER_WEEK


def _estimate_skill_hours(skill_entry: dict) -> float:
    """Sum the estimated time across all learning steps for a skill."""
    return sum(_parse_est_time_to_hours(step.get("est_time", "")) for step in skill_entry.get("learning_path", []))


def _determine_parallel_tracks(hours_per_week: float, skill_count: int) -> int:
    """Choose how many skills can reasonably run in parallel for the user's pace."""
    if skill_count <= 0:
        return 1
    derived_tracks = max(1, int(hours_per_week // 10))
    return max(1, min(skill_count, MAX_PARALLEL_TRACKS, derived_tracks))


def _build_parallel_skill_schedule(
    skill_gap_report: list[dict],
    hours_per_week: float,
) -> tuple[list[dict], float, int]:
    """
    Build a per-skill schedule with sequential or parallel lanes.

    Higher time commitment unlocks more concurrent tracks. Skills are still
    admitted in priority order, but can begin in parallel when a lane is free.
    """
    if not skill_gap_report:
        return [], 0.0, 1

    parallel_tracks = _determine_parallel_tracks(hours_per_week, len(skill_gap_report))
    per_track_hours = hours_per_week / parallel_tracks if parallel_tracks > 0 else hours_per_week
    track_load_hours = [0.0 for _ in range(parallel_tracks)]
    skills: list[dict] = []

    for entry in skill_gap_report:
        skill_name = entry.get("skill", "Unknown")
        skill_hours = _estimate_skill_hours(entry)
        sessions = max(1, math.ceil(skill_hours / (DEFAULT_SESSION_MINUTES / 60)))

        track_index = min(range(parallel_tracks), key=lambda idx: track_load_hours[idx])
        start_week = track_load_hours[track_index] / per_track_hours if per_track_hours > 0 else 0.0
        duration_weeks = skill_hours / per_track_hours if per_track_hours > 0 else 0.0
        end_week = start_week + duration_weeks
        track_load_hours[track_index] += skill_hours

        skills.append({
            "skill": skill_name,
            "hours": round(skill_hours, 1),
            "sessions": sessions,
            "track": track_index + 1,
            "start_week": round(start_week, 1),
            "end_week": round(end_week, 1),
        })

    total_weeks = max((load / per_track_hours for load in track_load_hours), default=0.0) if per_track_hours > 0 else 0.0
    return skills, total_weeks, parallel_tracks


def _build_daily_session_capacity(
    hours_per_week: float,
    study_days: list[int],
    session_minutes: int = DEFAULT_SESSION_MINUTES,
) -> dict[int, int]:
    """Spread the weekly study load across weekdays, including multi-session days."""
    session_hours = session_minutes / 60
    sessions_per_week = max(1, math.ceil(hours_per_week / session_hours))
    active_days = study_days or DEFAULT_STUDY_DAYS
    daily_capacity = {day: 0 for day in active_days}

    if sessions_per_week <= len(active_days):
        step = len(active_days) / sessions_per_week
        for index in range(sessions_per_week):
            day = active_days[min(len(active_days) - 1, int(index * step))]
            daily_capacity[day] += 1
        return daily_capacity

    base_sessions, remainder = divmod(sessions_per_week, len(active_days))
    for index, day in enumerate(active_days):
        daily_capacity[day] = base_sessions + (1 if index < remainder else 0)
    return daily_capacity


def _get_day_start_hour(sessions_today: int) -> int:
    """Shift earlier when the user's weekly commitment needs multiple sessions per day."""
    if sessions_today >= 6:
        return 9
    if sessions_today >= 4:
        return 13
    return DEFAULT_START_HOUR


def _generate_session_slots(
    total_sessions: int,
    hours_per_week: float,
    start_date: datetime,
    study_days: list[int],
    session_minutes: int = DEFAULT_SESSION_MINUTES,
) -> list[tuple[datetime, datetime]]:
    """Generate non-overlapping calendar slots for the requested weekly capacity."""
    if total_sessions <= 0:
        return []

    daily_capacity = _build_daily_session_capacity(hours_per_week, study_days, session_minutes)
    slots: list[tuple[datetime, datetime]] = []
    current = start_date

    while len(slots) < total_sessions:
        sessions_today = daily_capacity.get(current.weekday(), 0)
        if sessions_today > 0:
            day_start_hour = _get_day_start_hour(sessions_today)
            for session_index in range(sessions_today):
                if len(slots) >= total_sessions:
                    break
                offset_minutes = session_index * (session_minutes + DEFAULT_SESSION_GAP_MINUTES)
                slot_start = current.replace(
                    hour=day_start_hour + (offset_minutes // 60),
                    minute=offset_minutes % 60,
                    second=0,
                    microsecond=0,
                )
                slot_end = slot_start + timedelta(minutes=session_minutes)
                slots.append((slot_start, slot_end))
        current += timedelta(days=1)

    return slots


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
    hours_per_week = _resolve_hours_per_week(questionnaire_answers)
    skills, total_weeks, parallel_tracks = _build_parallel_skill_schedule(
        skill_gap_report,
        hours_per_week,
    )
    total_hours = sum(skill["hours"] for skill in skills)
    learning_mode = "parallel" if parallel_tracks > 1 else "sequential"
    if parallel_tracks > 1:
        note = (
            f"At {hours_per_week} hrs/week, this plan runs up to {parallel_tracks} skills in parallel "
            f"and should take about {math.ceil(total_weeks)} weeks (~{round(total_weeks / 4.3, 1)} months). "
            f"Higher-priority skills start first, and the next skill begins as soon as a track frees up."
        )
    else:
        note = (
            f"At {hours_per_week} hrs/week, this plan will take approximately "
            f"{math.ceil(total_weeks)} weeks (~{round(total_weeks / 4.3, 1)} months). "
            f"Focus on one skill at a time for the strongest foundation."
        )

    return {
        "total_hours": round(total_hours, 1),
        "hours_per_week": hours_per_week,
        "total_weeks": round(total_weeks, 1),
        "skills": skills,
        "parallel_tracks": parallel_tracks,
        "learning_mode": learning_mode,
        "note": note,
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
    total_sessions = max(1, math.ceil(total_hours / (session_minutes / 60)))
    return _generate_session_slots(
        total_sessions=total_sessions,
        hours_per_week=hours_per_week,
        start_date=start_date,
        study_days=study_days,
        session_minutes=session_minutes,
    )


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

    hours_per_week = _resolve_hours_per_week(questionnaire_answers)
    parallel_tracks = _determine_parallel_tracks(hours_per_week, len(skill_gap_report))
    session_hours = DEFAULT_SESSION_MINUTES / 60

    skill_queues: list[dict] = []
    total_sessions = 0

    for skill_idx, skill_entry in enumerate(skill_gap_report):
        skill_name = skill_entry.get("skill", f"Skill {skill_idx + 1}")
        queue: list[dict] = []
        for step in skill_entry.get("learning_path", []):
            step_hours = _parse_est_time_to_hours(step.get("est_time", ""))
            step_sessions = max(1, math.ceil(step_hours / session_hours))
            for sess_idx in range(step_sessions):
                queue.append({
                    "skill_name": skill_name,
                    "skill_idx": skill_idx,
                    "step": step,
                    "session_index": sess_idx + 1,
                    "session_total": step_sessions,
                })
        if queue:
            total_sessions += len(queue)
            skill_queues.append({"sessions": queue})

    session_slots = _generate_session_slots(
        total_sessions=total_sessions,
        hours_per_week=hours_per_week,
        start_date=start_date,
        study_days=DEFAULT_STUDY_DAYS,
    )

    active_indices: list[int] = []
    waiting_index = 0
    while len(active_indices) < parallel_tracks and waiting_index < len(skill_queues):
        active_indices.append(waiting_index)
        waiting_index += 1

    events: list[dict] = []
    round_robin_index = 0

    for slot_start, slot_end in session_slots:
        if not active_indices:
            break

        active_position = round_robin_index % len(active_indices)
        skill_queue_index = active_indices[active_position]
        session_payload = skill_queues[skill_queue_index]["sessions"].pop(0)

        step = session_payload["step"]
        skill_name = session_payload["skill_name"]
        step_label = step.get("label", "Study")
        step_title = step.get("title", "")
        step_url = step.get("url", "")
        step_type = step.get("type", "Resource")
        step_num = step.get("step", "")
        session_label = (
            f"({session_payload['session_index']}/{session_payload['session_total']})"
            if session_payload["session_total"] > 1
            else ""
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

        events.append({
            "summary": summary,
            "description": "\n".join(description_lines),
            "start": {
                "dateTime": slot_start.isoformat(),
                "timeZone": timezone,
            },
            "end": {
                "dateTime": slot_end.isoformat(),
                "timeZone": timezone,
            },
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "popup", "minutes": 15},
                ],
            },
            "colorId": str((session_payload["skill_idx"] % 11) + 1),
        })

        if not skill_queues[skill_queue_index]["sessions"]:
            active_indices.pop(active_position)
            if waiting_index < len(skill_queues):
                active_indices.insert(active_position, waiting_index)
                waiting_index += 1
            if active_indices:
                round_robin_index = active_position % len(active_indices)
        else:
            round_robin_index = (active_position + 1) % len(active_indices)

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
