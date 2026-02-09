from fastapi import FastAPI
from app.api import routes_resume, routes_user
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

@app.get("/")
async def root():
    return {"message": "CareerLM Backend running with Groq LLaMA-3"}
