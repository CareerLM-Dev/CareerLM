# Metrics Test Automation Guide

## Quick Start: Auto-Discovery Mode

To automate the metrics test with your own resumes and job descriptions:

### 1. Create Folders
In the `backend-fastapi/tests/` directory, create two folders:
```
tests/
├── resumes/          # Drop your resume PDFs here
├── jds/              # Drop your job description text files here
└── metrics_test.py
```

### 2. Add Your Files

**Resumes folder** (`tests/resumes/`):
- Add any number of `.pdf` resume files
- Examples: `senior_engineer.pdf`, `junior_developer.pdf`, `pm_candidate.pdf`
- Files are automatically discovered and tested against all JDs

**JDs folder** (`tests/jds/`):
- Add job description text files (`.txt`)
- Examples: `backend_engineer.txt`, `fullstack.txt`, `ml_engineer.txt`
- Each resume will be tested against each JD

### 3. Run the Script
```bash
cd backend-fastapi/tests
python metrics_test.py
```

The script will:
- ✓ Auto-discover all PDFs in `resumes/` folder
- ✓ Auto-discover all JDs in `jds/` folder
- ✓ Test every resume against every JD (creates a matrix of results)
- ✓ Generate a comprehensive metrics report
- ✓ Run consistency checks (5 repeated submissions of the first resume)

### Example Output
```
✓ Auto-discovery mode: found 'resumes' and 'jds' folders
  Discovered 3 resume(s): ['candidate_a', 'candidate_b', 'candidate_c']
  Discovered 2 JD file(s): ['backend_engineer', 'frontend_engineer']

Submitting candidate_a resume against backend_engineer...
Submitting candidate_a resume against frontend_engineer...
Submitting candidate_b resume against backend_engineer...
...

TABLE 1: Resume Analyzer Metrics (system-aligned)
====================================================
Resume         JD                   Score  Struct  Comp  Rel  Imp  Fixes  Suggs  Strengths  Weaknesses
candidate_a    backend_engineer       75     70     80    70    75      1      3         5         2
candidate_a    frontend_engineer      52     55     60    45    50      3      5         2         4
...
```

---

## Manual Mode (Fallback)

If the `resumes/` or `jds/` folders don't exist, the script falls back to **manual mode** using hardcoded files:
- `strong_resume.pdf`
- `weak_resume.pdf`
- `jd1.txt`, `jd2.txt`, `jd3.txt`

To use manual mode, simply don't create the `resumes/` and `jds/` folders, and make sure the hardcoded files exist in the tests directory.

---

## File Format Requirements

### Resume PDFs
- Standard PDF format (compatible with pdfplumber)
- Any content structure works (system extracts text automatically)
- Recommendation: Include standard sections (Experience, Skills, Education)

### Job Description Text Files
- Plain text (`.txt`)
- No specific format required (system accepts freeform JD text)
- Examples:
  ```
  Senior Backend Engineer
  5+ years of Python/FastAPI experience
  Required skills: Python, PostgreSQL, Docker, AWS
  ...
  ```

---

## Output Files

The script generates console output with:
1. **TABLE 1**: Resume Analyzer Metrics
   - Shows scores for each resume-JD combination
   - Includes structure, completeness, relevance, impact scores
   - Lists critical fixes and suggestions

2. **SCORING CONSISTENCY** Section
   - Submits first resume 5 times against first JD
   - Reports sigma (standard deviation)
   - Validates deterministic scoring

3. **COPY THESE VALUES** Section
   - Summary values for your report
   - Easy copy-paste format

---

## Testing 7–10 Resumes

To run the full evaluation with 7–10 diverse resumes:

1. Collect 7–10 sample resumes (strong, medium, weak profiles)
2. Create 2–3 representative job descriptions
3. Place them in `resumes/` and `jds/` folders
4. Run the script: `python metrics_test.py`
5. Copy output metrics into your report

**Expected results:**
- 20–30 resume-JD analysis runs (depending on files)
- Complete RQS (Resume Quality Score) dataset
- Empirical calibration for thresholds
- Statistical confidence for pilot evaluation

---

## Troubleshooting

**Error: "No PDFs found in 'resumes' folder"**
- Make sure the `resumes/` folder exists and contains `.pdf` files
- Check file extensions are lowercase `.pdf`

**Error: "No text files found in 'jds' folder"**
- Make sure the `jds/` folder exists and contains `.txt` files
- Check file extensions are lowercase `.txt`

**Script falls back to manual mode**
- One or both folders are missing
- Create both folders (can be empty) to enable auto-discovery
- Or check that your file extensions are correct

**API timeout errors**
- Make sure backend is running: `uvicorn app.main:app --reload`
- Check API_URL in metrics_test.py: should be `http://localhost:8000`

---

## Script Location

```
backend-fastapi/
├── tests/
│   ├── resumes/           ← Add your PDFs here
│   ├── jds/               ← Add your JD text files here
│   ├── metrics_test.py    ← The automation script
│   ├── bb_test.py
│   └── ...
├── app/
└── ...
```

---

## Next Steps

After running with 7–10 resumes:
1. Review the metrics table output
2. Identify empirical threshold values for RQS and IRQ
3. Update your evaluation report with calibrated metrics
4. Document any outliers (very high/low scores) and investigate

See [PERFORMANCE_EVALUATION_METRICS.md](../docs/PERFORMANCE_EVALUATION_METRICS.md) for the 5-metric framework and interpretation guidelines.
