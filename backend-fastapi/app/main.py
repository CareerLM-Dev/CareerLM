from fastapi import FastAPI
from app.api import routes_resume, routes_user, routes_onboarding, routes_cold_email
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

# Include Resume Optimizer routes
app.include_router(routes_resume.router, prefix="/api/v1/resume", tags=["Resume"])

# Include User routes
app.include_router(routes_user.router, prefix="/api/v1/user", tags=["User"])

# Include Cold Email routes
app.include_router(routes_cold_email.router, prefix="/api/v1/cold-email", tags=["Cold Email"])

# Include Onboarding routes
app.include_router(routes_onboarding.router, prefix="/api/v1/onboarding", tags=["Onboarding"])

@app.get("/")
async def root():
    return {"message": "CareerLM Backend running with Groq LLaMA-3"}
