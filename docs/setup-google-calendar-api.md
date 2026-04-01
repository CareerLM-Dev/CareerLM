# Google Calendar API Setup

The **Study Planner → Add to Google Calendar** feature syncs study schedules to the user's Google Calendar. It uses **Google Identity Services (GIS)** on the frontend to get an OAuth token and the **Google Calendar API v3** on the backend to create events.

---

## 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown (top-left) → **New Project**.
3. Name it (e.g. `CareerLM`) and click **Create**.
4. Make sure the new project is selected in the dropdown.

## 2. Enable the Google Calendar API

1. Go to **APIs & Services → Library**  
   (or visit: <https://console.cloud.google.com/apis/library>)
2. Search for **Google Calendar API**.
3. Click on it and press **Enable**.

## 3. Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (for development) and click **Create**.
3. Fill in the required fields:
   - **App name**: `CareerLM`
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue** through the remaining steps.
5. On the **Test users** page, click **+ Add Users** and add the Google accounts that will test the app.

> While the app is in "Testing" status, only test users can authorize. This is fine for development.

## 4. Create an OAuth 2.0 Client ID

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Name it (e.g. `CareerLM Web`).
5. Under **Authorized JavaScript origins**, add:
   ```
   http://localhost:3000
   ```
6. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3000
   ```
7. Click **Create**.
8. Copy the **Client ID** — it looks like: `508668430020-xxxx.apps.googleusercontent.com`

## 5. Add the Client ID to Your Environment

Create or edit the `.env` file in the **frontend-react/** directory:

```env
# frontend-react/.env
REACT_APP_GOOGLE_CLIENT_ID=your_client_id_here
```

> **Do NOT commit this file.** Make sure `.env` is in `.gitignore`.

## 6. Install Backend Dependencies

The backend needs the Google API client libraries. They are already in `requirements.txt`, but verify they're installed:

```bash
cd backend-fastapi
pip install google-api-python-client google-auth
```

## 7. Run the Database Migration

The calendar sync feature uses a `calendar_sync` table in Supabase to persist synced event IDs.

1. Open the [Supabase SQL Editor](https://supabase.com/dashboard) for your project.
2. Run the migration file: `backend-fastapi/migrations/002_calendar_sync.sql`

## 8. Verify It Works

1. Start both servers:
   ```bash
   # Terminal 1 — Backend
   cd backend-fastapi
   python -m uvicorn app.main:app --reload

   # Terminal 2 — Frontend
   cd frontend-react
   npm start
   ```
2. Go to **Study Planner**, generate a study plan, then click **Add to Google Calendar**.
3. A Google sign-in popup should appear asking for Calendar permission.
4. After granting access, events should appear in your Google Calendar.

---

## How It's Used in the Codebase

| File | Usage |
|------|-------|
| `frontend-react/src/components/GoogleCalendarSync.js` | GIS popup to get OAuth token; calls backend sync/remove endpoints |
| `frontend-react/public/index.html` | Loads the GIS script (`accounts.google.com/gsi/client`) |
| `backend-fastapi/app/services/google_calendar.py` | Builds calendar events, syncs/deletes via Calendar API v3 |
| `backend-fastapi/app/api/routes_resume.py` | `/sync-to-google-calendar`, `/remove-from-google-calendar`, `/calendar-sync-status` endpoints |
| `backend-fastapi/migrations/002_calendar_sync.sql` | Creates `calendar_sync` table |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Google Identity Services not loaded" | Check internet connection; disable ad-blockers; try incognito mode |
| "Google Client ID not configured" | Set `REACT_APP_GOOGLE_CLIENT_ID` in `frontend-react/.env` and **restart** the React dev server |
| Google popup doesn't appear | Check browser popup blocker; ensure `localhost:3000` is in Authorized JS origins |
| `403: access_denied` | Add your Google account as a test user in the OAuth consent screen |
| Events not appearing in Calendar | Make sure you granted the `calendar.events` scope in the popup |
| "relation calendar_sync does not exist" | Run `002_calendar_sync.sql` in the Supabase SQL Editor |
