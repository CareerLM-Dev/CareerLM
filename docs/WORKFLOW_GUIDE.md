# CareerLM Workflow Guide - Understanding the System

**Last Updated**: March 7, 2026  
**Audience**: Team members and AI assistants needing to understand the workflow system  
**Purpose**: Conceptual understanding of how everything works together

---

## Table of Contents
1. [The Big Picture](#the-big-picture)
2. [How the Orchestrator Works](#how-the-orchestrator-works)
3. [The Five Workflow Paths](#the-five-workflow-paths)
4. [What's Complete vs What Remains](#whats-complete-vs-what-remains)
5. [How to Approach Remaining Modules](#how-to-approach-remaining-modules)
6. [Understanding State Flow](#understanding-state-flow)
7. [The Supervisor's Decision Logic](#the-supervisors-decision-logic)

---

## The Big Picture

### What is CareerLM?

CareerLM is a career development platform where users get personalized help across five main areas:

1. **Resume Analysis & Optimization** - Upload resume, get scored, receive improvement suggestions
2. **Skill Gap Analysis** - Discover career paths that match their skills and what they need to learn
3. **Interview Preparation** - Practice with mock interviews and get feedback
4. **Cold Email Generation** - Create personalized outreach emails for networking
5. **Study Planner** - Create personalized learning roadmaps based on available time and goals

### The Central Brain: The Orchestrator

Think of the orchestrator as a project manager who:
- Looks at where the user is in their career journey
- Decides what they need help with most urgently
- Routes them to the right specialist agent
- Keeps track of what's been completed
- Always comes back to check: "What should happen next?"

This is different from a fixed workflow where everyone goes through the same steps. Instead, the orchestrator adapts to each person's situation.

### Why This Matters

If someone has an interview tomorrow, they need interview prep NOW - not resume fixes. If someone is exploring careers, they need skill gap analysis - not cold email templates. The orchestrator makes these smart decisions automatically.

---

## How the Orchestrator Works

### The Core Loop

Every time something happens (user uploads resume, completes a task, changes their status), the orchestrator runs through this process:

**Step 1: Gather Context**
- What has the user completed already?
- What's their current career status? (Exploring, Applying, Building Skills, Interview Upcoming)
- What's their resume score? (if they've uploaded one)
- What are their target roles?
- Are they waiting for any specialist to finish?

**Step 2: Evaluate Priority Rules**
The supervisor checks rules in order of urgency:
- **Urgent first**: Interview upcoming? → Interview prep takes priority
- **Critical issues next**: Resume score below 50? → Must fix resume before anything else
- **Status-based routing**: What's the user trying to do right now?
- **Skill building**: Need to learn something? → Study planner
- **Default actions**: Nothing urgent? → Offer helpful next steps

**Step 3: Make a Decision**
The supervisor picks ONE phase (like "resume_analysis", "fix_resume", "interview_prep") and writes:
- **current_phase**: What should happen now
- **supervisor_decision**: Human-readable explanation of why this was chosen

**Step 4: Route to Specialist**
The orchestrator sends the user to that specialist agent. The specialist does its work (analyze resume, generate emails, etc.) and returns results.

**Step 5: Update Profile**
After a specialist completes, the orchestrator updates the user's profile:
- Save the results
- Update completion flags ("resume_analysis_complete = true")
- Track progress (score improvements, skills gained)

**Step 6: Loop Back**
Return to Step 1 with the new context and decide what's next.

### State Persistence (Memory)

Every time a specialist completes or the supervisor makes a decision, the ENTIRE state gets saved to the database in a table called "graph_checkpoints". This means:
- If the user closes their browser and comes back tomorrow, the workflow picks up exactly where they left off
- We can see the history of every decision made
- The system "remembers" everything that's happened

This checkpoint system is powered by Supabase and is tied to the user's ID. One user = one continuous conversation thread.

---

## The Five Workflow Paths

### Path 1: Resume Analysis & Optimization (✅ COMPLETE & OPTIMIZED)

**What it does:**
When a user uploads their resume, this path analyzes it and provides actionable feedback.

**The Journey:**

1. **Resume Upload**
   - User uploads PDF through the frontend
   - PDF gets parsed into structured sections (Experience, Education, Skills, etc.)
   - Contact information is automatically excluded from analysis

2. **Three-Agent Analysis Pipeline**
   - **Structure Agent**: Checks formatting, section organization, readability
   - **Relevance Agent**: Matches keywords and skills against target role requirements
   - **Impact Agent**: Evaluates action verbs, quantifiable metrics, achievement language

3. **Scoring System**
   Each agent produces a score (0-100):
   - Structure Score: How well-formatted is the resume?
   - Completeness Score: Are all expected sections present?
   - Relevance Score: Does it match the target role?
   - Impact Score: Are accomplishments compelling?
   - ATS Score: Will it pass automated screening systems?
   - **Overall Score**: Weighted average of all dimensions

4. **Score Zones**
   - 0-49: Critical (needs major work)
   - 50-74: Needs Improvement
   - 75-84: Good
   - 85-100: Excellent

5. **RAG Enhancement**
   The system uses Retrieval-Augmented Generation (RAG) to pull best practices from a knowledge base:
   - Searches vector database for relevant resume writing tips
   - Enhances suggestions with "how to fix" guidance
   - Provides concrete examples

6. **Output for User**
   - **Strengths**: What's working well (areas scoring above 70)
   - **Weaknesses**: Issues found across all dimensions
   - **Suggestions**: Prioritized action items with explanations
   - **Skill Gaps**: Missing skills for target role
   - **Critical Fixes**: Must-fix issues for low scores

7. **Profile Update**
   After analysis completes:
   - New score is compared to previous score (if exists)
   - Score delta is calculated (e.g., "improved from 55 to 72, +17 points!")
   - Score history is updated
   - User's confirmed skills and known gaps are updated

8. **Supervisor's Next Decision**
   - If score < 50: Route to "fix_resume" phase (critical repairs needed)
   - If score 50-74 + user is applying: Help with cold emails or interview prep
   - If score >= 75: User is ready for next steps based on their status

**Recent Optimizations (March 2026):**
- Reduced from 919 lines to 599 lines of code
- Removed redundant LLM calls (95% cost reduction)
- Streamlined data storage (only 15 essential fields saved, down from 48+)
- Checkpoint size reduced by 80% (40KB → 8KB)
- No functionality lost - all critical features preserved

**Key Files:**
- `backend-fastapi/app/agents/resume/nodes.py` - The three agents
- `backend-fastapi/app/agents/resume/orchestrator_wrapper.py` - Connects resume workflow to orchestrator
- `backend-fastapi/app/agents/orchestrator/profile_update.py` - Updates user profile after analysis

---

### Path 2: Skill Gap Analysis (🚧 IMPLEMENTED, NOT FULLY ORCHESTRATED)

**What it does:**
Helps users discover career paths that match their skills and identifies what they need to learn.

**Current Status:**
The skill gap analysis agents exist and work independently, but they're not fully integrated into the orchestrator's decision flow. This is a placeholder specialist.

**The Journey (Theoretical):**

1. **Skills Extraction**
   - Parse resume to identify current skills
   - Categorize skills (technical, soft, domain-specific)

2. **Career Path Matching**
   - Compare user's skills against role requirements for different careers
   - Calculate match percentages
   - Identify transferable skills

3. **Gap Identification**
   - For each potential career path, list missing skills
   - Prioritize gaps (critical vs nice-to-have)

4. **Learning Recommendations**
   - Suggest courses, certifications, projects
   - Estimate time investment required

**What Needs to Happen:**
- Connect skill gap agents to orchestrator state
- Add supervisor routing rule: "When should skill gap analysis run?"
- Create wrapper node similar to resume's orchestrator_wrapper
- Store results in CareerLMState under "skill_gap_report"
- Update profile with career matches and skill gaps
- Mark "skill_gap_analysis_complete = true" when done

**How to Approach (Based on Resume Module):**
Follow the same pattern used for resume analysis:
1. Review existing skill gap agents (they likely have their own state and graph)
2. Create a wrapper node that bridges orchestrator state to skill gap state
3. Extract only what the orchestrator needs (career matches, top gaps)
4. Call the skill gap workflow, wait for results
5. Map results back into CareerLMState
6. Add to supervisor routing (probably for "exploring" status users)

---

### Path 3: Interview Preparation (🚧 PARTIALLY IMPLEMENTED, NOT ORCHESTRATED)

**What it does:**
Provides mock interview practice with AI-generated questions and feedback.

**Current Status:**
Interview practice exists as a standalone feature in the frontend, but the orchestrator doesn't route users to it or track completion.

**The Journey (Theoretical):**

1. **Question Generation**
   - Based on target role and resume content
   - Generate behavioral, technical, and situational questions
   - Adapt difficulty based on experience level

2. **Mock Interview Session**
   - User answers questions (voice or text)
   - AI evaluates responses in real-time
   - Provides feedback on structure, content, delivery

3. **Performance Tracking**
   - Score each answer
   - Identify patterns (weak on technical questions, strong on behavioral)
   - Track improvement over multiple sessions

4. **Actionable Feedback**
   - Suggest better answer frameworks (STAR method)
   - Highlight missed opportunities
   - Recommend preparation resources

**What Needs to Happen:**
- Create interview prep orchestrator wrapper
- Define what gets stored in CareerLMState (performance summary, weak areas, practice count)
- Add supervisor routing: "Interview upcoming? Route here first"
- Mark "interview_prep_complete = true" (or allow multiple sessions)
- Update profile with interview readiness score

**How to Approach (Based on Resume Module):**
The interview agents are likely more complex because they involve real-time interaction. Consider:
1. Is there an interview graph/workflow already? Review it
2. Create a wrapper that initializes interview session from orchestrator state
3. Decide: Does interview prep pause the orchestrator (human-in-loop) or run async?
4. Store session summary (not full transcript) in CareerLMState
5. Add high-priority routing rule (interview_upcoming status should trigger this)

---

### Path 4: Cold Email Generation (🚧 IMPLEMENTED, NOT ORCHESTRATED)

**What it does:**
Creates personalized outreach emails for networking and job applications.

**Current Status:**
Cold email generation exists as a standalone service but isn't connected to the orchestrator workflow.

**The Journey (Theoretical):**

1. **Context Gathering**
   - User's background from resume
   - Target company/person
   - Purpose of email (informational interview, application, networking)

2. **Email Drafting**
   - Generate personalized subject line
   - Create compelling opening
   - Highlight relevant experience/mutual connections
   - Clear call-to-action

3. **Tone Optimization**
   - Adjust formality based on recipient and industry
   - Ensure authenticity (not too salesy)

4. **Variations**
   - Provide 2-3 alternative versions
   - Different angles or emphasis points

**What Needs to Happen:**
- Create cold email orchestrator wrapper
- Store generated emails in CareerLMState
- Add supervisor routing: "Actively applying? Offer cold email help"
- Mark "cold_email_complete = true" (or allow multiple generations)
- Track which emails were used

**How to Approach (Based on Resume Module):**
Cold email is likely simpler than the others - review existing service, create wrapper, add routing for "applying" status users, store results in state.

---

### Path 5: Study Planner (🚧 PLANNED, NOT IMPLEMENTED)

**What it does:**
Creates personalized learning roadmaps to help users acquire missing skills or prepare for career transitions.

**Current Status:**
Planned feature with some frontend components, but not implemented or orchestrated.

**The Journey (Theoretical):**

1. **Time Assessment**
   - How much time does user have? (Short-term: weeks, Long-term: months)
   - Daily time commitment available
   - Target deadline (interview prep vs career transition)

2. **Gap Identification**
   - Pull skill gaps from resume analysis
   - Pull missing skills from skill gap analysis
   - Identify weak areas from interview practice

3. **Learning Path Generation**
   - **Short-term plan** (interview in 2-4 weeks): Focus on critical gaps, quick wins, practice problems
   - **Long-term plan** (career transition over 3-6 months): Comprehensive courses, projects, certifications
   - Prioritize based on impact and feasibility

4. **Resource Recommendations**
   - Suggest courses, tutorials, practice platforms
   - Estimate time investment per resource
   - Sequence learning (prerequisites first)

5. **Milestone Tracking**
   - Break plan into weekly/monthly milestones
   - Track completion progress
   - Adjust plan based on progress

**Adaptation Logic:**
The study planner should adapt its recommendations based on urgency:
- **Short-term (interview upcoming)**: Focus on interview-specific prep, commonly asked questions, quick refreshers
- **Long-term (building skills)**: Comprehensive learning path, hands-on projects, portfolio building
- **Timeline flexibility**: Adjust intensity based on user's available time commitment

**What Needs to Happen:**
- Create study planner agents/workflow
- Build orchestrator wrapper
- Store learning plan in CareerLMState
- Add supervisor routing: "Building skills? Create study plan"
- Integrate with skill gap and interview prep results
- Mark "study_plan_complete = true" (or allow updates)

**How to Approach (Based on Resume Module):**
Study planner needs to consume results from other specialists (skill gaps, interview weaknesses). Create wrapper that gathers all relevant context, generates adaptive plan based on timeline, stores actionable milestones in state.

---

## What's Complete vs What Remains

### ✅ Fully Complete & Production-Ready

**1. Orchestrator Core System**
- Supervisor node that makes routing decisions
- State management (CareerLMState TypedDict)
- Checkpointing system (saves to Supabase after every node)
- Profile update logic (score delta tracking)
- API endpoints for workflow invocation

**2. Resume Analysis Pipeline**
- All three agents working and optimized
- RAG integration for enhanced suggestions
- Scoring system validated
- Wrapper connecting to orchestrator
- Profile updates after completion
- Frontend displaying results
- Fully tested end-to-end

**3. Frontend Foundation**
- Authentication flow (email + OAuth)
- Protected routes
- Onboarding questionnaire (2 questions)
- Floating helper bot (phase-aware suggestions)
- Dashboard with tool cards
- State fetching from orchestrator

**4. Database & Infrastructure**
- Supabase schema complete
- Vector database for RAG
- Checkpoint storage working
- Resume file storage

### 🚧 Partially Complete (Needs Orchestrator Integration)

**1. Skill Gap Analysis**
- Agents exist and work standalone
- Not connected to orchestrator routing
- Results not flowing into CareerLMState
- Frontend component exists but disconnected from workflow

**2. Interview Preparation**
- Mock interview UI exists
- Not tracked by orchestrator
- No completion flags or routing
- Performance data not integrated

**3. Cold Email Generation**
- Service exists
- Not part of orchestrator flow
- No supervisor routing
- Generated emails not stored in state

**4. Study Planner**
- Frontend component exists
- Not implemented or orchestrated
- Should adapt based on time available (short-term vs long-term)
- Routing logic not defined

### ❌ Not Started

**1. Bullet Rewrite Human-in-Loop**
- Designed but not implemented
- Needs pause/resume workflow
- User input collection mechanism

**2. Fix Resume Specialist**
- Routing exists (supervisor sends low scores here)
- Actual"fix_resume" node is just a placeholder
- Needs real implementation

**3. Job Application Tracker**
- Not in current scope
- Would require new specialist

**4. Calendar Integration for Deadlines**
- Setup guide exists
- Not connected to orchestrator

---

## How to Approach Remaining Modules

### General Pattern (Learned from Resume Module)

**Step 1: Understand the Existing Work**
Before touching anything, review:
- Does an agent/service already exist for this?
- What's its current input/output format?
- Is there a graph/workflow or just standalone functions?
- What does the frontend expect to receive?

**Step 2: Define Integration Points**

Ask yourself:
- **What does the orchestrator need to know?** (Not everything - just essentials)
- **When should this specialist run?** (Supervisor routing rule)
- **What marks it as complete?** (Is it one-time or repeatable?)
- **What context does it need from previous steps?** (Resume data? User profile?)

**Step 3: Create the Wrapper**

The wrapper is a bridge between the orchestrator's state and the specialist's workflow. It:
- Extracts what the specialist needs from CareerLMState
- Calls the specialist (could be a function, a graph, an LLM, etc.)
- Takes the specialist's output and maps it back to CareerLMState
- Marks completion flag
- Returns updated state

Look at `resume/orchestrator_wrapper.py` as the reference template.

**Step 4: Update Orchestrator State**

Add to CareerLMState:
- A TypedDict for the specialist's output (like ResumeAnalysisData)
- A completion flag (like skill_gap_analysis_complete)
- Any new fields needed for routing decisions

**Step 5: Add Supervisor Routing**

In the supervisor node, add a rule that checks:
- Should this specialist run now?
- Has it already been completed?
- Is there something more urgent?

Place the rule in the right priority position (urgent things first).

**Step 6: Register in Graph**

In orchestrator graph file:
- Add node: `workflow.add_node("your_specialist", your_wrapper_node)`
- Add routing: Map supervisor's "current_phase" to your node
- Add edge back: `workflow.add_edge("your_specialist", "supervisor")`

**Step 7: Frontend Integration**

- Update FloatingHelper phase map to recognize the new phase
- Create/update UI component to display results
- Add route if needed
- Test state fetching from orchestrator API

**Step 8: Test End-to-End**

- Trigger the workflow (usually through orchestrator/analyze-resume or a new endpoint)
- Verify supervisor routes correctly
- Check checkpoint saves to database
- Confirm completion flag is set
- Verify supervisor moves to next phase

---

## Understanding State Flow

### What is State?

State is a single dictionary (key-value pairs) that contains everything the orchestrator knows about the user's journey. Think of it as the orchestrator's notebook.

### What Goes in State?

**User Context:**
- Who they are (user_id)
- Their profile info (status, target roles, experience)
- Their history (score improvements over time)

**Specialist Outputs:**
- Resume analysis results
- Skill gap report
- Interview performance data
- Generated cold emails
- Study plan

**Control Information:**
- current_phase: What's happening now
- supervisor_decision: Why this phase was chosen
- Completion flags: resume_analysis_complete, skill_gap_complete, etc.
- waiting_for_user: Is the workflow paused for user input?

**Audit Trail:**
- messages: List of all actions taken ("[SUPERVISOR] Routing to resume_analysis")
- metadata: Timestamps, version info

### How State Flows

1. **Initialization**: When workflow starts, state is created with user profile data
2. **Supervisor reads state**: Looks at completion flags, scores, status
3. **Supervisor updates state**: Sets current_phase and supervisor_decision
4. **Specialist reads state**: Gets what it needs (resume text, target role, etc.)
5. **Specialist updates state**: Writes results, marks complete
6. **State gets checkpointed**: Entire state saved to database
7. **Back to step 2**: Supervisor reads updated state and decides next step

### Important: Flat Structure

Most things in state are at the top level, not nested deeply. This makes it easy to check completion flags and routing decisions without digging through nested objects.

### Reading State Example

To check if user has uploaded a resume:
- Look for state["user_profile"]["has_resume"]

To check if analysis is done:
- Look for state["resume_analysis_complete"]

To get the resume score:
- Look for state["resume_analysis"]["overall_score"]

### Writing to State

When a specialist completes its work:
- Add results: state["your_specialist_output"] = {...results...}
- Mark done: state["your_specialist_complete"] = True
- Log action: state["messages"].append("[YOUR_SPECIALIST] Work complete")

### Why This Matters

Because state persists across sessions (saved in checkpoints), users can close their browser mid-workflow and pick up exactly where they left off. The supervisor reads the saved state and knows what's been done and what's next.

---

## The Supervisor's Decision Logic

### How Decisions are Made

The supervisor is a function that runs every time the workflow needs to decide "what next?" It evaluates rules in a specific order and returns the first rule that matches.

### Current Routing Rules (Priority Order)

**Rule 0: Safety Check**
- If analysis failed, go to idle (don't loop forever on errors)

**Rule 1: Resume Upload**
- If user has no resume, route to "upload_resume" phase
- They can't do anything else until they have a resume

**Rule 2: Resume Analysis**
- If resume exists but hasn't been analyzed, route to "resume_analysis"
- This triggers the three-agent pipeline

**Rule 3: Critical Resume Score**
- If resume score < 50, route to "fix_resume"
- Don't let them proceed with a failing resume
- Must improve before other opportunities

**Rule 4: Medium Resume Score (50-74)**
- Check user status to decide what's most helpful:
  - interview_upcoming → Interview prep (urgent)
  - applying → Cold email help (sales support)
  - building → Study planner (growth path)
  - Default → Fix resume (improve the foundation)

**Rule 5: Good Resume Score (75+)**
- Resume is solid, focus on next steps:
  - interview_upcoming → Interview prep
  - applying → Cold email
  - exploring → Skill gap analysis (career discovery)
  - Default → Idle (all major tasks done)

**Rule 6: Fallback**
- If nothing matches, go to "idle"
- Idle means: "We don't have anything urgent, but user can explore tools"

### What "Idle" Means

Idle doesn't mean "do nothing" - it means "no automated workflow necessary right now." The user can still manually use any tool from the dashboard. The floating helper bot shows status-based suggestions even in idle.

### Adding New Routing Rules

When adding a new specialist, ask:
- **Where in the priority list should this go?**
- **What conditions trigger this?** (Status? Score? Completion flags?)
- **Does it replace an existing rule or add to the logic?**

Example thought process for "add skill gap analysis":
- Not urgent (can wait until resume is good)
- Helpful for exploring users
- Should go after resume is analyzed and score is decent
- Priority: Lower than interview prep, similar to study plan
- Add to Rule 5 logic when status="exploring"

### Why Order Matters

If interview prep rule came AFTER the "fix resume" rule, someone with an interview tomorrow might be forced to spend time fixing their resume first. That would be bad UX. Urgent things must be checked first.

### Supervisor Decision Messages

Every time the supervisor makes a routing decision, it writes a human-readable explanation:
- "Resume score is 45/100 (critical). Prioritizing fixes before other work."
- "Interview coming up. Let's practice common questions."
- "You're actively applying. Let's draft cold emails."

These messages:
- Help users understand why they're being shown certain tools
- Appear in the floating helper bot
- Get logged for debugging

### Testing Routing Logic

To verify routing works correctly:
1. Set up state with specific conditions (status, score, completion flags)
2. Call supervisor
3. Check: Did it choose the right phase?
4. Check: Is the decision message helpful?
5. Simulate completing that phase and call supervisor again
6. Verify it moves to the next appropriate phase

---

## Summary: The Complete Picture

### The Workflow in Motion

1. **User signs up** → Onboarding questionnaire (2 questions: status + target role)
2. **User uploads resume** → Orchestrator routes to resume_analysis
3. **Resume analyzed** → 3 agents run, score calculated, RAG suggestions added
4. **Profile updated** → Score delta computed, history updated
5. **Back to supervisor** → Evaluates new state, decides next phase
6. **Next phase determined** → Based on score + status:
   - Low score? → Fix resume
   - High score + interview soon? → Interview prep
   - High score + applying? → Cold email
   - Exploring? → Skill gap analysis
7. **User completes that task** → State updated, back to supervisor
8. **Repeat** until all relevant specialists have run → Idle state
9. **User can manually use any tool** from dashboard anytime

### What Makes This System Work

**Flexibility**: Every user gets a personalized path based on their situation

**Persistence**: Close browser, come back tomorrow, workflow remembers everything

**Adaptability**: Add new specialists without rewriting existing code

**Transparency**: Every decision logged and explained

**Efficiency**: Only run specialists when they're actually needed

### The Path Forward

**Immediate priorities:**
1. Integrate skill gap analysis (already built, just needs orchestrator connection)
2. Integrate interview prep (partially built, needs state tracking)
3. Integrate cold email (service exists, needs routing)
4. Implement real "fix_resume" logic (currently placeholder)

**Once orchestration is complete:**
- All four paths will work together seamlessly
- Users will have a guided experience start-to-finish
- The system will adapt to each person's journey
- Frontend floating helper will show accurate next-step suggestions
- Profile tracking will show progress over time

**The vision:**
A user uploads their resume once, answers two onboarding questions, and the system guides them through resume optimization, skill development, interview preparation, and job search outreach - all adapted to their specific career stage and goals. No manual decision-making needed; the orchestrator handles the routing intelligently.

---

**Questions to consider as you work:**
- Does this specialist need to run once or multiple times?
- What's the minimum information it needs from state?
- What's the minimum information orchestrator needs from its output?
- Where in the priority list does this belong?
- How do we know when it's "complete"?
- What happens if it fails? (Error handling)

**Remember:** The resume module is your reference implementation. Study how it connects to the orchestrator, and follow the same pattern for remaining modules.

---

**End of Guide**
