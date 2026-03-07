from fastapi import FastAPI
from app.api import routes_user, routes_onboarding, routes_cold_email, routes_interview, routes_jobs, routes_orchestrator, routes_resume
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="CareerLM Backend")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all origins during dev, tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Orchestrator routes (supervisor-driven system)
app.include_router(routes_orchestrator.router, prefix="/api/v1/orchestrator", tags=["Orchestrator"])

# Rerouted legacy resume endpoints under orchestrator
app.include_router(routes_resume.router, prefix="/api/v1/orchestrator", tags=["Orchestrator"])

# Include User routes
app.include_router(routes_user.router, prefix="/api/v1/user", tags=["User"])

# Include Cold Email routes
app.include_router(routes_cold_email.router, prefix="/api/v1/cold-email", tags=["Cold Email"])

# Include Onboarding routes
app.include_router(routes_onboarding.router, prefix="/api/v1/onboarding", tags=["Onboarding"])

# Include Interview routes
app.include_router(routes_interview.router, prefix="/api/v1/interview", tags=["Interview"])

# Include Jobs routes
app.include_router(routes_jobs.router, prefix="/api/v1/jobs", tags=["Jobs"])

@app.get("/")
async def root():
    return {"message": "CareerLM Backend running with Groq LLaMA-3"}
