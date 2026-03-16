# Skill Gap Analyzer — System Flow, LLM & Prompts

---

## LLM Used

| Property  | Value                                                                      |
| --------- | -------------------------------------------------------------------------- |
| Provider  | **Groq**                                                                   |
| Client    | `GROQ_CLIENT = Groq(api_key=GROQ_API_KEY)` from `app/agents/llm_config.py` |
| Model     | **`llama-3.3-70b-versatile`** (constant: `GROQ_SKILLGAP_MODEL`)            |
| API style | `client.chat.completions.create(model=..., messages=[...])`                |

The skill gap module uses this model for **all three LLM calls** in the pipeline:

1. Resume skill extraction
2. Career matching
3. AI recommendations narrative

---

## High-Level System Flow

```
User uploads PDF
       │
       ▼
POST /api/v1/orchestrator/skill-gap-analysis
       │
       ├─ Parse PDF → resume_text + sections (skills/projects/experience)
       ├─ Supabase: fetch questionnaire_answers + user_profile for user_id
       │
       ▼
analyze_skill_gap()  →  LangGraph workflow
       │
       ├── Node 1:  extract_skills_node
       │      └── LLM Call 1 — skill extraction
       │
       ├── Node 2:  calculate_career_probabilities_node
       │      └── LLM Call 2 — career matching
       │
       ├── Node 3:  get_ai_recommendations_node
       │      └── LLM Call 3 — coaching narrative
       │
       └── Node 4:  compile_results_node
              └── pure data assembly (no LLM)
       │
       ▼
Filter results by interested_roles from questionnaire
       │
       ▼
JSON response → React frontend
```

---

## Step-by-Step Flow

---

### Step 1 — HTTP Request & Setup (`routes_resume.py`)

**Endpoint:** `POST /skill-gap-analysis`

```
1. Read uploaded PDF bytes
2. get_parser().extract_text_from_pdf(bytes)   → resume_text (str)
3. get_parser().parse_sections(resume_text)     → {skills, projects, experience}
4. Supabase query:
       SELECT questionnaire_answers, user_profile
       FROM "user"
       WHERE id = user_id
       LIMIT 1
5. Merge into:
       questionnaire_answers = {
           ...questionnaire_answers fields...,
           "user_profile": { skills, projects, experience, expertise, areas_of_interest }
       }
6. Call analyze_skill_gap(resume_text, filename, sections, questionnaire_answers)
```

The `user_profile` is nested inside `questionnaire_answers` under the key `"user_profile"`. This is how nodes read the stored profile.

---

### Step 2 — LangGraph Graph (`graph.py`)

Four nodes wired in a fixed linear sequence:

```
START → extract_skills → calculate_probabilities → get_recommendations → compile_results → END
```

All edges are unconditional. Each node receives the full `SkillGapState` dict and returns a merged state update.

Initial state injected:

```python
{
    "resume_text": str,
    "filename": str,
    "questionnaire_answers": dict,   # includes nested user_profile
    "skills_text": str | None,       # parsed Skills section
    "projects_text": str | None,     # parsed Projects section
    "experience_text": str | None,   # parsed Experience section
}
```

---

### Step 3 — Node 1: `extract_skills_node` (`nodes.py`)

**Purpose:** Extract every technical skill the user has, grounded in both resume text and stored profile.

#### 3a. Build profile context

```python
user_profile = questionnaire_answers.get("user_profile")

profile_blocks = _skills_from_profile(user_profile)
# Returns:
# {
#     "skills":           list[str],  e.g. ["Python", "Languages: TypeScript, Go"]
#     "projects":         str,
#     "experience":       str,
#     "expertise":        str,
#     "areas_of_interest": str,
# }
```

#### 3b. Build the input block for the LLM

If resume has structured sections, they are used. Otherwise falls back to full resume text. Either way the stored profile blocks are appended as labeled sections:

```
=== SKILLS SECTION ===
<resume skills text>

=== PROJECTS SECTION ===
<resume projects text>

=== USER PROFILE SKILLS ===
["Python", "Django", ...]

=== USER PROFILE PROJECTS ===
<stored project descriptions>

=== USER PROFILE EXPERIENCE ===
<stored experience text>

=== USER PROFILE EXPERTISE ===
<stored expertise text>
```

**Why:** The LLM must ground its extraction in what the user actually has. Injecting the stored profile prevents hallucination of skills not present in either source.

#### 3c. LLM Call 1 — Skill Extraction

```
Model:       llama-3.3-70b-versatile
Temperature: 0.0   (fully deterministic)

System:
  "You are a precise resume-skill extractor.
   Respond ONLY with a JSON array of strings. No commentary."

User:
  "Extract every technical skill, tool, framework, programming language,
  methodology, and platform from the text below.

  Rules:
  - Return ONLY a JSON array of strings.
  - Use the canonical / most-common capitalisation (e.g. 'JavaScript' not 'javascript').
  - Include soft skills only if they are clearly tech-adjacent (e.g. 'Agile', 'Scrum').
  - Do NOT include job titles, company names, organisation names, or degrees.
  - Do NOT include project names — only the technologies used in those projects.
  - Keep each item short (one skill per entry, no descriptions).
  - Prioritise explicit evidence from SKILLS/PROJECTS/EXPERIENCE/EXPERTISE blocks over assumptions.
  - Do NOT infer tools/skills that are not explicitly present in the provided text.
  - For single-letter or very short skill names (e.g. 'R', 'C'), only extract them
    if they CLEARLY refer to the programming language (e.g. 'R programming',
    'statistical analysis in R', 'R Studio', 'C language'). Do NOT extract 'R' from
    'R&D', 'HR', or other abbreviations.

  <labeled input blocks>"

Expected response:
  ["Python", "FastAPI", "React", "Docker", "PostgreSQL", ...]
```

**Fallback:** If the LLM call throws, `_regex_extract_skills()` matches the text against `CAREER_CLUSTERS` skill lists using word-boundary regex. Short skills (`r`, `c`) use stricter context patterns.

#### 3d. Post-process extracted skills

```python
# 1. Strip markdown fences from raw LLM response
# 2. json.loads() the array
# 3. _normalize_extracted_skill_tokens() — two operations:
#    a. Split category-prefixed profile entries:
#       "Languages: Python, Go"  →  ["Python", "Go"]
#       "Backend: Django, FastAPI"  →  ["Django", "FastAPI"]
#    b. Deduplicate using _normalize_skill() canonical keys
# 4. Merge stored profile skills list again as a safety net
```

#### 3e. Confidence scoring for every extracted skill

`_classify_skill_confidence()` calls `_score_skill_confidence()` per skill:

| Signal                                                           | Points | Evidence string generated           |
| ---------------------------------------------------------------- | ------ | ----------------------------------- |
| Found in experience section                                      | +4     | `"mentioned in experience section"` |
| Found in projects section                                        | +3     | `"mentioned in projects section"`   |
| Found in skills section                                          | +1     | `"listed in skills section"`        |
| Action verb adjacent (`implemented`, `built`, `deployed`, etc.)  | +2     | `"action-verb evidence near skill"` |
| Quantified impact adjacent (`50%`, `2x`, `reduced`, `increased`) | +2     | `"quantified impact near skill"`    |
| Recent year ≤ 2 years ago adjacent                               | +2     | `"recent exposure (YEAR)"`          |
| Old year ≥ 6 years ago adjacent                                  | −1     | `"older exposure (YEAR)"`           |
| Skills section only, no project/experience hit                   | −1     | —                                   |
| Resume text only (no section hit)                                | 0      | `"detected in resume text only"`    |

**Classification thresholds:**

| Score | Level               |
| ----- | ------------------- |
| ≥ 6   | `high_confidence`   |
| 3 – 5 | `medium_confidence` |
| < 3   | `low_confidence`    |

#### 3f. State output from Node 1

```python
{
    "user_skills": ["Python", "FastAPI", ...],
    "normalized_skills": [
        { "skill": "Python", "normalized": "python", "proficiency": 3, "confidence_level": "high_confidence" }
    ],
    "total_skills_found": 24,
    "skill_confidence_levels": {
        "high_confidence": ["Python", "React", ...],
        "medium_confidence": ["Docker", ...],
        "low_confidence": ["Kubernetes", ...]
    },
    "skill_confidence_details": [
        { "skill": "Python", "level": "high_confidence", "score": 9, "evidence": ["mentioned in experience section", "action-verb evidence near skill", "recent exposure (2024)"] }
    ]
}
```

---

### Step 4 — Node 2: `calculate_career_probabilities_node` (`nodes.py`)

**Purpose:** Use the LLM to directly produce career match objects, then enrich each with gap metadata, learning times, evidence, and score summaries.

#### 4a. Pre-processing before the LLM call

```python
# Resolve target role from questionnaire
target_role = _resolve_target_role(questionnaire_answers)
# Checks: target_role → target_roles → skips "undecided" → returns first valid role
# Default if nothing found: "General Software Engineer"

# Parse timeline
timeline_weeks = _extract_timeline_weeks(questionnaire_answers)
# Checks: timeline_weeks → timeline → readiness_timeline (int or string with digits)

# Build proficiency map
proficiency_map = _build_proficiency_map(state, questionnaire_answers)
# Priority:
#   1. skill_self_ratings from questionnaire (explicit 1-3 ratings)
#   2. confidence_level from skill_confidence_details (high→3, medium→2, low→1)

# Index confidence details by normalized skill name for fast lookup
confidence_by_skill = {
    _normalize_skill(item["skill"]): item
    for item in state["skill_confidence_details"]
}
```

#### 4b. LLM Call 2 — Career Matching

```
Model:       llama-3.3-70b-versatile
Temperature: 0.2

System:
  "Return only JSON. No markdown."

User:
  "You are a career-matching expert.

  User skills: ["Python", "FastAPI", "React", "Docker", ...]
  Target role preference: Software Engineer
  Timeline target (weeks): 12

  Return ONLY valid JSON with this schema:
  [
    {
      "career": "string",
      "probability": 0-100,
      "skill_match_percentage": 0-100,
      "matched_skills": ["..."],
      "missing_skills": ["..."],
      "needs_improvement_skills": ["..."],
      "score_summary": "short paragraph under 45 words"
    }
  ]

  Rules:
  - Return 4 to 8 careers.
  - Keep skills canonical and concise.
  - Do not repeat the same skill across missing_skills and needs_improvement_skills.
  - Keep missing_skills focused to the most impactful core gaps (typically 3 to 7 items).
  - Avoid unrelated primary-language gaps unless clearly essential for that career.
  - Be practical and less strict with scoring (do not under-score partially matching profiles)."

Expected response:
  [
    {
      "career": "Software Engineer",
      "probability": 78,
      "skill_match_percentage": 78,
      "matched_skills": ["Python", "FastAPI", "Docker"],
      "missing_skills": ["Kubernetes", "System Design"],
      "needs_improvement_skills": ["AWS"],
      "score_summary": "Strong Python and API foundation. Kubernetes and System Design are the key gaps to close."
    },
    ...
  ]
```

**Response parsing** — `_extract_json_payload(raw)`:

1. Strip markdown code fences
2. `json.loads()` on cleaned string
3. If that fails, regex-extract `[...]` block and try again
4. If that fails, regex-extract `{...}` block and try again

#### 4c. Per-career post-processing

```
1. Deduplicate skills within each list using _normalize_skill() canonical keys
2. Calibrate with role reference skills from CAREER_CLUSTERS:
  - matched += reference skills the user already has
  - missing += reference skills the user does not have
3. Filter unrelated language outliers for the user profile:
  - Example: suppress C++ as a gap if user profile is Python/JS-focused
4. Enforce disjoint sets — remove any skill from needs_improvement that is already in missing
5. Apply sweet-spot caps for usability:
  - missing_skills <= 7
  - needs_improvement_skills <= 10
6. Recover matched_skills if LLM returned empty:
   matched = [s for s in user_skills if _normalize_skill(s) not in (missing ∪ improve)][:12]
7. Clamp probability and skill_match_percentage to [0.0, 100.0]
```

Calibration helper behavior:

```python
reference_skills = _get_reference_skills_for_career(career_name)
ref_matched = [s for s in reference_skills if _normalize_skill(s) in user_norm]
ref_missing = [
   s for s in reference_skills
   if _normalize_skill(s) not in user_norm
   and not _is_language_outlier_for_profile(s, user_norm)
]

matched = _dedupe((matched + ref_matched)[:24])
missing = _dedupe((missing + ref_missing)[:7])
missing = _dedupe([s for s in missing if not _is_language_outlier_for_profile(s, user_norm)])
improve = _dedupe(improve[:10])
```

#### 4d. Build `missing_skills_metadata` per career

For every skill in `missing_skills` (bucket: `CRITICAL_BLOCKER`) and `needs_improvement_skills` (bucket: `PARTIAL_GAP`):

```python
{
    "skill": "Kubernetes",
    "bucket": "critical_blocker",        # or "partial_gap"
    "required": True,
    "proficiency": 0,                    # from proficiency_map
    "learning_days": 60,                 # SKILL_LEARNING_TIME lookup
    "learning_time_label": "~2 months",
    "is_quick_fix": False,               # True if learning_days ≤ 7
    "reason": "..."                      # from _build_gap_reason()
}
```

The `reason` is generated by `_build_gap_reason()` which receives the `SkillConfidenceItem` for that skill from `confidence_by_skill`:

| Bucket             | Reason format                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `critical_blocker` | `"<skill> is a core requirement for <career>. This is a hard gap right now and will likely block interviews or day-1 tasks for this role. <evidence_text>"`                                                            |
| `partial_gap`      | `"<skill> appears in your profile but depth is not yet strong enough for <career>. This is an improvement gap, not a complete miss. Build stronger proof through project/work usage. <evidence_text>"`                 |
| `opportunity`      | `"<skill> is not a strict blocker, but teams hiring for <career> often prefer it for stronger shortlisting and broader ownership. Your current strengths (<matched preview>) still carry weight. <evidence_text>"`     |
| `resume_gap`       | `"<skill> may be present but is not clearly evidenced in your resume/profile. It is required/preferred for <career>, so improve how this skill is demonstrated before assuming relearning is needed. <evidence_text>"` |

`<evidence_text>` at the end of every reason:

- Has evidence list → `"Evidence seen: mentioned in projects section, action-verb evidence near skill."`
- Has confidence level only → `"Current evidence confidence: low confidence."`
- Neither → `"No clear evidence was found in skills/projects/experience for this skill."`

#### 4e. Build `match_evidence` per career (top 10 matched skills)

```python
{
    "skill": "Python",
    "confidence_level": "high_confidence",
    "score": 9,
    "evidence": ["mentioned in experience section", "mentioned in projects section", "recent exposure (2024)"]
}
```

Two counters derived: `evidence_projects` and `evidence_experience`.

#### 4f. Assemble `score_summary`

```
1. Use LLM's score_summary if present and non-empty
2. Else fallback:
   "This role scores X% because you already match N of M core skills.
    There are P major gaps and Q skills that need deeper proficiency."
3. If match_evidence exists, append:
   " Evidence: N matched skills are grounded in resume/profile context
     (X from projects, Y from experience)."
```

#### 4g. Derive gap buckets and study planner skills for selected career

The career whose name matches `target_role` (or highest probability if no match) is the selected career:

```python
gap_buckets = {
    "critical_blocker": [ learning metadata for each missing skill ],
    "partial_gap":      [ learning metadata for each improvement skill ],
    "opportunity":      [],
    "resume_gap":       [],
}
study_planner_skills = deduplicated(missing_skills + needs_improvement_skills)
```

Sweet-spot behavior summary for users:

- Prevents under-reporting: role overlap skills (e.g., Next.js for Software Engineer/Full Stack) are recovered via canonical reference skills.
- Prevents over-reporting: unrelated primary-language gaps (e.g., C++ for a Python-first profile) are filtered.
- Keeps output actionable: missing skills stay in a practical 3-7 range in normal cases.

#### 4h. Fallback path

If LLM fails: `_fallback_career_probabilities()` returns one career at 55%, matched_skills = first 10 user_skills, all gaps empty, `selected_cluster_source = "llm_fallback"`.

---

### Step 5 — Node 3: `get_ai_recommendations_node` (`nodes.py`)

#### LLM Call 3 — Coaching Narrative

```
Model:       llama-3.3-70b-versatile
Temperature: default

System:
  "You are an expert career counselor and skill development advisor."

User:
  "Based on this resume analysis:

  User's Current Skills: Python, FastAPI, React, Docker, ...

  Top Career Matches:
  1. Software Engineer (78% match) - Missing: Kubernetes, System Design
  2. Full Stack Developer (72% match) - Missing: TypeScript, GraphQL
  3. DevOps Engineer (61% match) - Missing: Terraform, Ansible

  Gap Buckets:
  - critical_blocker: ['Kubernetes', 'System Design']
  - partial_gap: ['AWS']
  - opportunity: []
  - resume_gap: []

  Timeline target: 12 weeks
  Timeline note: N/A

  Provide:
  1. Detailed explanation of why these careers match the user's profile
  2. Recommended learning path for the top career (specific courses, certifications, projects)
  3. Timeline to become job-ready for the top career
  4. Actionable next steps
  5. Separate resume-improvement actions for resume_gap items
     (these should NOT be treated as study tasks)

  Keep the response structured and practical."
```

Output stored as `state["ai_recommendations"]` — raw markdown string rendered in the frontend.

---

### Step 6 — Node 4: `compile_results_node` (`nodes.py`)

No LLM call. Assembles `analysis_summary`:

```python
{
    "best_match": career_matches[0]["career"],
    "best_match_probability": career_matches[0]["probability"],
    "skills_to_focus": career_matches[0]["missing_skills"][:5]
}
```

---

### Step 7 — Route post-processing (`routes_resume.py`)

```python
# Filter to roles user expressed interest in during onboarding
interested_roles = questionnaire_answers.get("target_roles") or questionnaire_answers.get("target_role")

filtered = [c for c in career_matches if career_name_matches_any_interested_role]

if filtered:
    analysis_result["career_matches"] = filtered
    analysis_result["top_3_careers"] = filtered[:3]
    analysis_result["analysis_summary"]["best_match"] = filtered[0]["career"]
```

---

## Skill Learning Time Estimates (`SKILL_LEARNING_TIME`)

Hard-coded dict (~100 entries). `get_skill_learning_metadata(skill)` does a case-insensitive lookup:

| Tier        | Days  | Examples                                                         |
| ----------- | ----- | ---------------------------------------------------------------- |
| Quick Fix   | 1–7   | Git (3d), REST API (5d), Postman (3d)                            |
| Short-term  | 7–30  | HTML (10d), Docker (14d), SQL (14d), FastAPI (10d)               |
| Medium-term | 30–90 | Python (45d), React (45d), AWS (60d), Kubernetes (60d)           |
| Long-term   | 90+   | Machine Learning (120d), Deep Learning (150d), Blockchain (100d) |

Default for unknown skill: **30 days**.

---

## Skill Normalization (`_normalize_skill`)

Used for all deduplication and matching throughout the pipeline:

```python
txt = value.lower().strip()
txt = txt.replace("c++", "cplusplus")
txt = txt.replace("c#", "csharp")
txt = txt.replace(".js", "js")
txt = re.sub(r"[^a-z0-9\s]", " ", txt)
txt = re.sub(r"\s+", " ", txt).strip()
compact = txt.replace(" ", "")
# Alias map: js→javascript, reactjs→react, nodejs→nodejs, ts→typescript ...
return _SKILL_ALIAS_MAP.get(compact) or txt
```

---

## `CAREER_CLUSTERS` — Reference Only

Hard-coded dict of 12 roles with canonical skill lists. Used by:

- Regex fallback extractor (if LLM Call 1 fails)
- `GET /suggested-roles` endpoint

**Not used** in the active LLM-direct matching path.

---

## Frontend (`SkillGapAnalyzer.js`)

### On load

If `resumeData.careerAnalysis` already has `career_matches`, it is loaded directly — no API call needed.

### On "Analyze" click

`FormData { resume: PDF, user_id: UUID }` → `POST /orchestrator/skill-gap-analysis`

### Career cards

- Score badge: ≥70% green / ≥50% orange / ≥30% red / else gray
- `score_summary` shown as 3-line-clamped text
- Progress bar fills to `probability`%

### Matched skill chips

- Partial-fill background: high=85% emerald / medium=50% amber / low=20% slate
- Label (HIGH/MEDIUM/LOW) + evidence score `S:N`
- Hover tooltip: `Score: N | Level: X | Evidence: <list>`

### Missing skill buttons

Click to expand:

- `reason` from `missing_skills_metadata` (evidence-grounded)
- `learning_time_label` (e.g. "~2 months")
- `⚡ Quick Fix` badge if `is_quick_fix = true`

### Learning timeline summary

Buckets: Quick Fix / Short-term / Medium-term / Long-term counts + total estimated months.

### Skill Confidence Split

Strong / Moderate / Low Exposure from `skill_confidence_levels`.
