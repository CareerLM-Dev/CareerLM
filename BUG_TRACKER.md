# CareerLM — Bug Tracker & Fix Log

> **Purpose:** This is a living document for AI agents and developers.
> It tracks every known bug, its root cause, affected files, fix strategy, and current status.
> **Always update the status and "Fixed In" fields after applying a fix.**
> Last Updated: 2026-02-24

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 | Critical — breaks core functionality |
| 🟠 | High — significant UX/security problem |
| 🟡 | Medium — notable but not immediately breaking |
| ✅ | Fixed |
| 🔧 | In Progress |
| ⏳ | Not Started |

---

## Summary Table

| # | Severity | Title | Status |
|---|----------|-------|--------|
| 1 | 🔴 | `password NOT NULL` blocks all OAuth user row creation | ✅ Fixed |
| 2 | 🔴 | `AuthCallback` null-check is inverted — new OAuth users always go to Dashboard | ✅ Fixed |
| 3 | 🔴 | Race condition between `AuthCallback` query and `ensureUserRow` insert | ✅ Fixed |
| 4 | 🟠 | Email/password login never checks `questionnaire_answered` | ✅ Fixed |
| 5 | 🟠 | Frontend works with no backend — session fully served from localStorage | ✅ Fixed |
| 6 | 🟠 | No protected routes — unauthenticated users can access `/dashboard` directly | ✅ Fixed |
| 7 | 🟡 | `skip-questionnaire` sets `questionnaire_answered: false` — traps user in redirect loop | ✅ Fixed |
| 8 | 🟡 | Onboarding backend endpoints have zero authentication guards | ✅ Fixed |
| 9 | 🟡 | After onboarding/skip, user is sent to `/upload-resume` instead of a guarded next step | ✅ Fixed |

---

## Detailed Bug Reports

---

### BUG #1 🔴 — `password NOT NULL` Schema Constraint Blocks All OAuth User Row Creation

**Status:** ✅ Fixed
**Fixed In:** `supabase/migrations/001_make_password_nullable.sql` · `supabase/schema.sql`

#### Root Cause
The `public.user` table in Supabase enforces `password text NOT NULL`. The `ensureUserRow` function in `UserContext.js` inserts `password: null` for all OAuth users (Google/GitHub). PostgreSQL rejects this insert with a NOT NULL violation. The catch block silently swallows the error, so no row is ever created for OAuth users.

#### Affected Files
- [`supabase/schema.sql`](supabase/schema.sql) — constraint definition
- [`frontend-react/src/context/UserContext.js`](frontend-react/src/context/UserContext.js) — `ensureUserRow` function (lines ~29–55)

#### Problematic Code
```javascript
// UserContext.js — ensureUserRow()
await supabase.from("user").insert([{
  id: supabaseUser.id,
  name: ...,
  email: supabaseUser.email,
  password: null,       // ← FAILS: password is NOT NULL in schema
  status: "student",
  ...
}]);
```
```sql
-- schema.sql
password text NOT NULL   -- ← blocks null inserts
```

#### Fix Strategy
Option A (Recommended): Alter the schema to allow `password` to be nullable for OAuth users:
```sql
ALTER TABLE public.user ALTER COLUMN password DROP NOT NULL;
```
Option B: Insert a placeholder string `'OAUTH_NO_PASSWORD'` or an empty bcrypt hash when the provider is not email.

#### Dependencies
This is the root cause of BUG #2 and BUG #3. Fix this first.

---

### BUG #2 🔴 — `AuthCallback` Null-Check Is Inverted: New OAuth Users Always Go to Dashboard

**Status:** ✅ Fixed
**Fixed In:** `frontend-react/src/pages/AuthCallback.js` (fixed as part of BUG #3 rewrite)

#### Root Cause
`AuthCallback.js` queries the `user` table for `questionnaire_answered`. Because BUG #1 means no row exists, `userRow` is always `null`. The current condition `if (userRow && !userRow.questionnaire_answered)` evaluates to `false` when `userRow` is `null`, so every new OAuth user is sent directly to `/dashboard` instead of `/onboarding`.

#### Affected Files
- [`frontend-react/src/pages/AuthCallback.js`](frontend-react/src/pages/AuthCallback.js) — lines ~30–43

#### Problematic Code
```javascript
// AuthCallback.js
if (userRow && !userRow.questionnaire_answered) {
  // NEW user: send to onboarding  ← NEVER reached when userRow is null
  navigate(`/onboarding/${session.user.id}`, { replace: true });
} else {
  // This branch fires for BOTH returning users AND new users (null row)
  navigate("/dashboard", { replace: true });
}
```

#### Fix Strategy
Invert the condition — treat a missing row as "first-time user":
```javascript
if (!userRow || !userRow.questionnaire_answered) {
  navigate(`/onboarding/${session.user.id}`, { replace: true });
} else {
  navigate("/dashboard", { replace: true });
}
```

#### Dependencies
Depends on BUG #1 being fixed first (so the row actually gets created). After BUG #1 is fixed, this condition change is still needed for the brief window between row creation and next login.

---

### BUG #3 🔴 — Race Condition Between `AuthCallback` DB Query and `ensureUserRow` Insert

**Status:** ✅ Fixed
**Fixed In:** `frontend-react/src/pages/AuthCallback.js` · `frontend-react/src/context/UserContext.js`

#### Root Cause
When `/auth/callback` loads, two async operations start almost simultaneously:
1. `UserContext.onAuthStateChange` fires → `setTimeout(...ensureUserRow..., 0)` (delayed)
2. `AuthCallback.handleCallback()` immediately calls `supabase.auth.getSession()` then queries the `user` table

The query in step 2 can (and does) execute before the insert in step 1 completes, because `setTimeout(..., 0)` only defers to the next tick — by which time the `AuthCallback` component has already started its async chain. The `user` row may not exist when `AuthCallback` checks for it.

#### Affected Files
- [`frontend-react/src/pages/AuthCallback.js`](frontend-react/src/pages/AuthCallback.js) — `handleCallback` function
- [`frontend-react/src/context/UserContext.js`](frontend-react/src/context/UserContext.js) — `ensureUserRow` + `onAuthStateChange` (lines ~60–78)

#### Problematic Code
```javascript
// UserContext.js
supabase.auth.onAuthStateChange((event, currentSession) => {
  setTimeout(() => {          // ← deferred
    ...
    ensureUserRow(currentSession.user);  // insert happens LATER
  }, 0);
});

// AuthCallback.js — runs at the same time
const { data: { session } } = await supabase.auth.getSession();
const { data: userRow } = await supabase     // ← may run BEFORE ensureUserRow insert
  .from("user").select(...).eq("id", session.user.id).single();
```

#### Fix Strategy
`AuthCallback` should own the user row creation instead of relying on `UserContext`:
1. Remove `ensureUserRow` call from `UserContext` (or keep it only as a safety net).
2. In `AuthCallback.handleCallback()`, after getting the session, call an upsert directly before reading `questionnaire_answered`.
3. This makes the flow linear and eliminates the race.

---

### BUG #4 🟠 — Email/Password Login Never Checks `questionnaire_answered`

**Status:** ✅ Fixed
**Fixed In:** `frontend-react/src/pages/Auth.js` — `handleSubmit` login branch

#### Root Cause
The `handleSubmit` login path in `Auth.js` navigates unconditionally to `/dashboard` after a successful `signInWithPassword`. There is no lookup in the `user` table to check if the user has completed onboarding. A user who registered but never finished the questionnaire will be sent to the dashboard every time they log in via email/password.

#### Affected Files
- [`frontend-react/src/pages/Auth.js`](frontend-react/src/pages/Auth.js) — `handleSubmit` login branch (lines ~38–58)

#### Problematic Code
```javascript
// Auth.js — handleSubmit (login branch)
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) { ... }
onLoginSuccess && onLoginSuccess(data);
navigate("/dashboard");   // ← no questionnaire_answered check at all
```

#### Fix Strategy
After a successful login, query the `user` table:
```javascript
const { data: userRow } = await supabase
  .from("user")
  .select("questionnaire_answered")
  .eq("id", data.user.id)
  .single();

if (!userRow || !userRow.questionnaire_answered) {
  navigate(`/onboarding/${data.user.id}`);
} else {
  navigate("/dashboard");
}
```

---

### BUG #5 🟠 — Frontend Runs Fully With Backend Down: No Backend Authority Over Auth

**Status:** ✅ Fixed
**Fixed In:** `frontend-react/src/pages/Dashboard.js` — health check `useEffect` + warning banner

#### Root Cause
`supabaseClient.js` configures `persistSession: true`, which stores the JWT in `localStorage`. On every page load, `UserContext` calls `supabase.auth.getSession()`, which reads from the localStorage cache — no network call to your backend is made. The Dashboard only calls the backend for *data* (resume history etc.), not to *authorize* the session. If the backend is down, the data calls fail silently and the dashboard renders empty — giving the illusion that the user is "logged in and everything is fine."

#### Affected Files
- [`frontend-react/src/api/supabaseClient.js`](frontend-react/src/api/supabaseClient.js)
- [`frontend-react/src/context/UserContext.js`](frontend-react/src/context/UserContext.js)
- [`frontend-react/src/pages/Dashboard.js`](frontend-react/src/pages/Dashboard.js) — no error boundary for backend-down scenario

#### Problematic Code
```javascript
// supabaseClient.js
persistSession: true,       // JWT cached in localStorage
autoRefreshToken: true,     // refreshed silently with no backend involvement

// Dashboard.js
if (!session) { setLoading(false); return; }  // only checks localStorage session
// Then calls backend... which may be down... and silently returns empty data
```

#### Fix Strategy
- Add a health check or a user-existence verification call to your own backend on Dashboard mount.
- If the backend is unreachable, show a clear "Service unavailable" message rather than an empty dashboard.
- This is partially a UX fix but also prevents the false sense of a working app.

---

### BUG #6 🟠 — No Protected Routes: Unauthenticated Users Can Access `/dashboard` Directly

**Status:** ✅ Fixed
**Fixed In:** `frontend-react/src/components/ProtectedRoute.js` (new file) · `frontend-react/src/App.js`

#### Root Cause
`App.js` defines all routes as plain `<Route>` elements with no authentication guard. Any user who types `/dashboard`, `/profile`, `/history`, or `/onboarding/:userId` directly into their browser will see those pages (or an empty state) without being authenticated.

#### Affected Files
- [`frontend-react/src/App.js`](frontend-react/src/App.js) — all route definitions

#### Problematic Code
```jsx
// App.js — no ProtectedRoute wrapper anywhere
<Route path="/dashboard" element={<Dashboard />} />
<Route path="/onboarding/:userId" element={<Onboarding />} />
<Route path="/profile" element={<Profile />} />
<Route path="/history" element={<History />} />
```

#### Fix Strategy
Create a `ProtectedRoute` component:
```jsx
// src/components/ProtectedRoute.js
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useUser();
  if (loading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return children;
}
```
Wrap all authenticated routes with it in `App.js`.

---

### BUG #7 🟡 — `skip-questionnaire` Sets `questionnaire_answered: false` → Infinite Redirect Loop

**Status:** ✅ Fixed
**Fixed In:** `backend-fastapi/app/api/routes_onboarding.py` — `skip_questionnaire` endpoint

#### Root Cause
The `skip-questionnaire` backend endpoint sets `questionnaire_answered = false`. But the entire routing logic (in `AuthCallback` and the intended email login check) uses `questionnaire_answered = false` as the signal to redirect to onboarding. A user who skips will be redirected back to onboarding on every future login — indefinitely.

#### Affected Files
- [`backend-fastapi/app/api/routes_onboarding.py`](backend-fastapi/app/api/routes_onboarding.py) — `skip_questionnaire` endpoint (lines ~80–100)

#### Problematic Code
```python
# routes_onboarding.py
@router.post("/skip-questionnaire")
async def skip_questionnaire(user_id: str):
    result = supabase.table("user").update({
        "questionnaire_answered": False,   # ← "false" means "send them back to onboarding"
        "questionnaire_answers": None
    }).eq("id", user_id).execute()
```

#### Fix Strategy
Skipping should be treated as "done with onboarding" for routing purposes. Set `questionnaire_answered: true` on skip (or add a separate `questionnaire_skipped` boolean column). The existing `questionnaire_answers` being `null` already communicates that they didn't answer.

```python
result = supabase.table("user").update({
    "questionnaire_answered": True,   # ← treat skip as "onboarding complete"
    "questionnaire_answers": None     # null answers = skipped
}).eq("id", user_id).execute()
```

---

### BUG #8 🟡 — Onboarding Backend Endpoints Have No Authentication Guards

**Status:** ✅ Fixed
**Fixed In:** `backend-fastapi/app/api/routes_onboarding.py` · `frontend-react/src/pages/Onboarding.js`

#### Root Cause
The `save-questionnaire` and `skip-questionnaire` endpoints accept a `user_id` as a plain query parameter with no JWT verification. Any unauthenticated request with a valid UUID can overwrite any user's questionnaire data.

#### Affected Files
- [`backend-fastapi/app/api/routes_onboarding.py`](backend-fastapi/app/api/routes_onboarding.py) — both POST endpoints

#### Problematic Code
```python
# routes_onboarding.py
@router.post("/save-questionnaire")
async def save_questionnaire(user_id: str, questionnaire_data: dict):
    # No Depends(get_current_user) — completely unauthenticated
    result = supabase.table("user").update({...}).eq("id", user_id).execute()
```

#### Fix Strategy
Add `Depends(get_current_user)` (already defined in `routes_user.py`) and verify the token's `user.id` matches the `user_id` parameter:
```python
@router.post("/save-questionnaire")
async def save_questionnaire(
    user_id: str,
    questionnaire_data: dict,
    current_user = Depends(get_current_user)   # ← add this
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    ...
```

---

### BUG #9 🟡 — Post-Onboarding Navigation Sends User to `/upload-resume` With No Guard

**Status:** ✅ Fixed
**Fixed In:** `frontend-react/src/pages/Onboarding.js` — `handleSkip` and `handleComplete`

#### Root Cause
Both `handleSkip` and `handleComplete` in `Onboarding.js` navigate to `/upload-resume`. This route is defined in `App.js` as `<ResumeUploadPage>` but it has no auth guard (see BUG #6) and no connection back to the main onboarding completion status. Additionally, the page a user reaches after completing onboarding should logically be the dashboard (with a prompt to upload a resume), not a standalone upload page that doesn't validate session state.

#### Affected Files
- [`frontend-react/src/pages/Onboarding.js`](frontend-react/src/pages/Onboarding.js) — `handleSkip` (lines ~130–148) and `handleComplete` (lines ~152–180)

#### Problematic Code
```javascript
// Onboarding.js — handleSkip and handleComplete both do:
navigate("/upload-resume");   // ← no guard, no context awareness
```

#### Fix Strategy
After onboarding completion/skip, redirect to `/dashboard` instead (or `/upload-resume` only if the upload page is properly guarded and connected). Alternatively, make `/upload-resume` the first step on the dashboard itself rather than a separate route.

---

## Fix Order (Recommended Sequence)

```
1. ✅ BUG #1 — Fix schema (password nullable) [Backend/DB]
2. ✅ BUG #3 — Move user row creation into AuthCallback (eliminates race) [Frontend]
3. ✅ BUG #2 — Fix inverted null-check in AuthCallback [Frontend]
4. ✅ BUG #7 — Fix skip-questionnaire to set questionnaire_answered: true [Backend]
5. ✅ BUG #8 — Add auth guards to onboarding endpoints [Backend]
6. ✅ BUG #6 — Create ProtectedRoute and wrap all private routes [Frontend]
7. ✅ BUG #4 — Add questionnaire_answered check to email/password login [Frontend]
8. ✅ BUG #9 — Fix post-onboarding navigation target [Frontend]
9. ✅ BUG #5 — Add backend health check / graceful degradation on Dashboard [Frontend]
```

---

## Completed Fixes Log

> Append an entry here every time a bug is fixed.

| Date | Bug # | What Was Changed | Files Modified |
|------|-------|-----------------|----------------|
| 2026-02-24 | #1 🔴 | Dropped `NOT NULL` constraint from `public.user.password` to allow OAuth users (null password). Created migration `001_make_password_nullable.sql`. Updated `schema.sql` context. | `supabase/migrations/001_make_password_nullable.sql`, `supabase/schema.sql`, `BUG_TRACKER.md` |
| 2026-02-24 | #3 🔴 | Rewrote `AuthCallback` to own the user-row upsert sequentially before reading `questionnaire_answered`. Removed `ensureUserRow` and its `onAuthStateChange` call from `UserContext` — no more concurrent insert/query race. | `frontend-react/src/pages/AuthCallback.js`, `frontend-react/src/context/UserContext.js`, `BUG_TRACKER.md` |
| 2026-02-24 | #2 🔴 | Fixed inverted null-check (`userRow && !answered` → `!userRow \|\| !answered`) as part of the AuthCallback rewrite above. New/missing rows now correctly route to onboarding. | `frontend-react/src/pages/AuthCallback.js`, `BUG_TRACKER.md` |
| 2026-02-24 | #7 🟡 | Changed `skip_questionnaire` to set `questionnaire_answered=True` (was `False`). Skip is now treated as onboarding complete, ending the infinite redirect loop. `questionnaire_answers` stays `null` to distinguish skipped vs answered users. | `backend-fastapi/app/api/routes_onboarding.py`, `BUG_TRACKER.md` |
| 2026-02-24 | #8 🟡 | Added `Depends(get_current_user)` + ownership check (`current_user.id != user_id` → 403) to both `save-questionnaire` and `skip-questionnaire` POST endpoints. Imported `get_current_user` via relative import from `routes_user`. Updated both `fetch` calls in `Onboarding.js` to pass `Authorization: Bearer <token>` header. | `backend-fastapi/app/api/routes_onboarding.py`, `frontend-react/src/pages/Onboarding.js`, `BUG_TRACKER.md` |
| 2026-02-24 | #6 🟠 | Created `ProtectedRoute.js` component that shows a spinner while auth loads, then redirects to `/auth` if unauthenticated. Wrapped `/dashboard`, `/history`, `/profile`, `/onboarding/:userId`, and `/upload-resume` routes in `App.js`. | `frontend-react/src/components/ProtectedRoute.js`, `frontend-react/src/App.js`, `BUG_TRACKER.md` |
| 2026-02-24 | #4 🟠 | After `signInWithPassword` success, now queries `questionnaire_answered` from `public.user`. Routes to `/onboarding/:id` if false/null, or `/dashboard` if true. Matches the same logic used in `AuthCallback` for OAuth logins. | `frontend-react/src/pages/Auth.js`, `BUG_TRACKER.md` |
| 2026-02-24 | #9 🟡 | Changed both `navigate("/upload-resume")` calls to `navigate("/dashboard")` in `handleSkip` and `handleComplete`. User now lands on the protected dashboard after onboarding, consistent with all other post-auth flows. | `frontend-react/src/pages/Onboarding.js`, `BUG_TRACKER.md` |
| 2026-02-24 | #5 🟠 | Added `backendDown` state + a mount-time `useEffect` that `fetch`es `GET http://localhost:8000/` with a 3-second `AbortController` timeout. Any network error, abort, or non-OK response sets `backendDown = true`. When true, a red warning banner is shown inside `<main>` above the dashboard content, clearly explaining the server is unreachable. Cached data remains visible; no silent empty state. | `frontend-react/src/pages/Dashboard.js`, `BUG_TRACKER.md` |

---

## Notes for AI Agents

- The `public.user` table's `id` column maps directly to `auth.users.id` (Supabase Auth). They must always be kept in sync.
- `interview_sessions` and `study_materials_cache` reference `auth.users(id)` directly — not `public.user(id)`. This is inconsistent but intentional for those tables.
- The `get_current_user` dependency (JWT verification) is already implemented in [`backend-fastapi/app/api/routes_user.py`](backend-fastapi/app/api/routes_user.py) lines ~17–29. Reuse it — don't rewrite it.
- All onboarding API calls in the frontend use plain `fetch()` with no `Authorization` header. After BUG #8 is fixed, these calls must be updated to pass the session token.
- `bcrypt` is imported in `Auth.js` to hash the password client-side before storing. This is a security anti-pattern — hashing should happen server-side only. Flag this for a future security review.
