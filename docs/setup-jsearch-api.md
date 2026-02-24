# RapidAPI JSearch API Key Setup

The **Job Matcher** feature uses the [JSearch API](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) on RapidAPI to fetch live job postings. Follow the steps below to get your own API key.

---

## 1. Create a RapidAPI Account

1. Go to [https://rapidapi.com/](https://rapidapi.com/).
2. Click **Sign Up** (top-right) and create a free account (you can sign in with Google/GitHub).

## 2. Subscribe to the JSearch API

1. Open the JSearch API page:  
   **<https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch>**
2. Click the **Pricing** tab.
3. Select the **Basic (Free)** plan and click **Subscribe**.  
   > The free tier gives you **500 requests/month** — enough for development.

## 3. Copy Your API Key

1. After subscribing, go to the **Endpoints** tab on the JSearch API page.
2. In the code snippet panel on the right, find the header `x-rapidapi-key`.
3. Copy the key value — it looks like: `a1b2c3d4e5msh...`

   Alternatively, go to **My Apps → default-application → Security** in your RapidAPI dashboard to find your key.

## 4. Add the Key to Your Environment

Create or edit the `.env` file in the **backend-fastapi/** directory:

```env
# backend-fastapi/.env
JSEARCH_API_KEY=your_rapidapi_key_here
```

> **Do NOT commit this file.** Make sure `.env` is listed in `.gitignore`.

## 5. Verify It Works

1. Start the backend server:
   ```bash
   cd backend-fastapi
   python -m uvicorn app.main:app --reload
   ```
2. In the frontend, go to **Job Matcher** and click **Refresh Jobs**.
3. You should see live job postings appear.

---

## How It's Used in the Codebase

| File | Usage |
|------|-------|
| `backend-fastapi/app/services/job_search.py` | Reads `JSEARCH_API_KEY` from env, sends it as `x-rapidapi-key` header |
| `backend-fastapi/app/api/routes_jobs.py` | `/refresh` endpoint calls `fetch_jobs_from_api()` |
| `frontend-react/src/components/JobMatcher.js` | Triggers a refresh via the API |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `JSEARCH_API_KEY not configured` error | Make sure the key is in `backend-fastapi/.env` and restart the server |
| `403 Forbidden` | Verify you're subscribed to the JSearch API on RapidAPI |
| `429 Too Many Requests` | You've hit the free tier limit (500/month). Wait for reset or upgrade |
