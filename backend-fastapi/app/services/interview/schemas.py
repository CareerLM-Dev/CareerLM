from typing import List, Optional

from pydantic import BaseModel, Field


class Question(BaseModel):
    id: int = Field(..., ge=1)
    category: str
    question: str


class QuestionList(BaseModel):
    questions: List[Question]


class QuantitativeMetrics(BaseModel):
    verbosity: str
    confidence_tone: str
    keyword_hit_rate: str


class StagePerformance(BaseModel):
    resume_validation: str
    project_deep_dive: str
    core_technical: str
    behavioral: str


class ActionPlan(BaseModel):
    stop_doing: List[str]
    start_doing: List[str]
    study_focus: List[str]
    next_steps: List[str]


class QuestionBreakdownItem(BaseModel):
    question: str
    user_answer_summary: str
    improvement_needed: Optional[str] = None
    ideal_golden_answer: str


class FeedbackOutput(BaseModel):
    executive_summary: str
    overall_readiness: str
    quantitative_metrics: QuantitativeMetrics
    stage_performance: StagePerformance
    action_plan: ActionPlan
    question_breakdown: List[QuestionBreakdownItem]
