# FlighSchedule Pro — 6-Minute Demo Script

**Format:** STAR Method (Situation, Task, Action, Result)
**Live App:** https://fsp-web-production.up.railway.app
**Test Login:** `sarah@skywest.edu` / any password (or click "Test Login")

---

## Opening (0:00 – 0:45) — Situation & Task

> "Flight schools lose thousands of dollars every week to empty schedule slots. When a student cancels, the slot sits empty because the scheduler is busy, doesn't know who's available, or can't reach students fast enough.
>
> Scheduling is a full-time job at most schools — some have multiple staff just managing the calendar. The bigger the school, the worse it gets.
>
> I was tasked with building an autonomous scheduling agent that integrates with Flight Schedule Pro — the industry-standard software flight schools already use — to detect openings, rank eligible students, and suggest optimal rebookings. Phase 1 is suggest-and-approve: the system does the heavy lifting, but a human confirms every change."

---

## Action — Live Feature Walkthrough

### 1. Login & Dashboard (0:45 – 1:30)

**What to do:**
1. Go to the live app URL
2. Click **"Test Login"** button (or enter `sarah@skywest.edu` with any password)
3. You land on the **Dashboard**

**What to say:**
> "The system authenticates against Flight Schedule Pro's API with MFA support, then issues a local JWT. On first login, the operator is auto-onboarded with default scheduling policies.
>
> The dashboard gives the scheduler a pulse check — pending suggestions waiting for review, approvals and declines today, acceptance rate over 30 days, and weekly flight hours. The queue health panel shows how quickly suggestions are being acted on and the expiration rate."

**Point out:** The 4 stat cards at top, the weekly flight hours chart, and queue health metrics.

---

### 2. Approval Queue — Core Workflow (1:30 – 3:00)

**What to do:**
1. Click **"Queue"** in the sidebar
2. Show the list of pending suggestions
3. Click on any suggestion to expand its details
4. Point out the **Rationale Panel** (ranking score, constraint results, AI summary)
5. Show the **type** labels: waitlist, reschedule, discovery, next_lesson
6. Demonstrate **Approve** on one suggestion
7. Demonstrate **Decline** on another
8. Show the **filter bar** — filter by status (switch to "approved" to show approved ones)

**What to say:**
> "This is the core of the system. The agent runs in the background — every few minutes it polls the FSP schedule, detects cancellations and openings, ranks eligible students using a weighted algorithm, evaluates constraints like instructor availability, aircraft status, and daylight hours, then creates suggestions here.
>
> Each suggestion has a full rationale — you can see the ranking score, which factors contributed most, which constraints passed or failed, and an AI-generated risk assessment. The scheduler sees exactly *why* this student was recommended for this slot.
>
> When I approve, it creates the reservation in FSP, expires competing suggestions in the same group, logs an audit event, and enqueues a notification to the student. If FSP rejects it — say there's a conflict — it reverts to pending and shows the validation error. The scheduler never has to leave this screen.
>
> Bulk actions let you approve or decline multiple suggestions at once — critical for larger schools processing dozens of changes per day."

---

### 3. Discovery Flights (3:00 – 3:45)

**What to do:**
1. Click **"Discovery"** in the sidebar
2. Fill in a prospect: First name, Last name, email (optional), preferred date, time of day
3. Click **Submit**
4. Show the generated slot options

**What to say:**
> "Discovery flights are the sales pipeline for flight schools — a prospect wants their first flight. The scheduler enters their info, and the system finds available slots filtered to daylight hours only — FAA requires VFR for intro flights.
>
> It checks instructor and aircraft availability, applies civil twilight constraints, deduplicates by instructor-time combo, and presents ranked options. The scheduler picks one, and the prospect gets a confirmation. This used to take 15-20 minutes of back-and-forth — now it's under a minute."

---

### 4. Ask Mode — AI Chat (3:45 – 4:30)

**What to do:**
1. Click **"Ask"** in the sidebar
2. Type: **"Which students are at risk of dropping out?"**
3. Wait for the response
4. Then ask: **"How many aircraft do we have and what's their status?"**

**What to say:**
> "Ask Mode gives the scheduler a natural language interface to the school's data. It's powered by Claude with full database context — students, instructors, aircraft, enrollments, flight history.
>
> The scheduler can ask about student progress, identify who hasn't flown in weeks, check aircraft availability, or find scheduling gaps — without writing a single query or navigating through multiple screens. This is the kind of operational intelligence that was previously locked in spreadsheets."

---

### 5. Schedule View (4:30 – 4:50)

**What to do:**
1. Click **"Schedule"** in the sidebar
2. Scroll through the reservation list
3. Point out the status badges (completed, cancelled)

**What to say:**
> "The schedule view pulls all reservations from FSP — every student, instructor, and aircraft assignment. The system uses this data for conflict detection and to compute student insights like days since last flight."

---

### 6. Policies & Templates (4:50 – 5:15)

**What to do:**
1. Click **"Policies"** in the sidebar — show the configurable fields
2. Click **"Templates"** — show notification template editor

**What to say:**
> "Every operator can customize their scheduling rules — how many alternatives to generate per cancellation, how far ahead to search, how long suggestions live before expiring, and the weights for the ranking algorithm. Notification templates are also per-operator so each school can brand their student communications."

---

## Result (5:15 – 6:00) — Technical Depth & Impact

**What to say:**
> "Let me talk about what's under the hood. The backend is NestJS with TypeScript — strict mode, only one `any` in the entire codebase. PostgreSQL with Row-Level Security for multi-tenant isolation — every query is scoped to the operator. BullMQ handles async jobs: schedule polling, suggestion generation, AI enrichment, notification dispatch.
>
> The ranking algorithm uses weighted multi-factor scoring — time since last flight, upcoming schedule density, total hours, plus custom operator-defined factors. All normalized min-max across candidates so the weights are meaningful regardless of scale.
>
> Security: AES-256-GCM encryption for FSP tokens at rest, Helmet for HTTP security headers, DOMPurify for XSS protection, rate limiting, and a full audit trail on every mutation.
>
> Testing: 280 unit tests across 17 test files covering the core algorithms, approval workflow, discovery booking flow, auth, policies, and more. CI runs lint, typecheck, and tests on every push.
>
> The system is designed to evolve — Phase 1 is suggest-and-approve, but the auto-approve service is already scaffolded. As trust builds, low-risk suggestions can be auto-approved, moving toward a fully autonomous scheduling agent.
>
> **The bottom line: this system turns a full-time scheduling job into a review queue. Instead of manually hunting for openings and calling students, the scheduler just approves or declines. That's the difference between 2 hours of work and 2 minutes.**"

---

## If Asked — Common Questions

**Q: How does it handle concurrent modifications?**
> "Optimistic locking. When you approve, it sets status to 'processing' first. If another user tries to approve the same suggestion, the WHERE clause fails and they get a conflict error. No double-bookings."

**Q: What happens if FSP is down?**
> "The polling job gracefully skips the cycle and retries next interval. Suggestions already in the queue are unaffected. The system never blocks on FSP availability."

**Q: How is multi-tenancy enforced?**
> "PostgreSQL Row-Level Security at the database layer — not just application-level filtering. Every table has an RLS policy: `operator_id = current_setting('app.current_tenant')`. Even if there's a bug in application code, the database won't return another operator's data."

**Q: Why suggest-and-approve instead of fully autonomous?**
> "Trust. Flight schools are safety-critical operations. Phase 1 builds confidence by showing the system makes good decisions. The auto-approve service is already built — it just needs the operator to flip a feature flag once they're comfortable. It's a deliberate product decision, not a technical limitation."

**Q: What's the test coverage like?**
> "280 tests across 17 files. Core algorithms — ranking, constraint evaluation, slot finding, cancellation detection — have thorough edge case coverage. The approval workflow and discovery booking flow are tested end-to-end with mock FSP responses. CI enforces lint, typecheck, and all tests on every push."
