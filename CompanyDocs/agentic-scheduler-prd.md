# Agentic Scheduler for Flight Schedule Pro (FSP)

## Product Requirements Document

---

## 1. Overview

### 1.1 Summary

An independently deployable, multi-tenant application that integrates with Flight Schedule Pro (FSP) to automate and optimize flight school scheduling. The system observes schedule state (cancellations, openings, disruptions), generates suggested schedule adjustments, and enables operators to manage their schedules more effectively through an in-app approval queue.

Phase 1 (MVP) operates in a **suggest-and-approve** model where all changes require human confirmation. Later phases steadily increase autonomy by removing approval requirements for low-risk changes, evolving toward an autonomous scheduling optimization agent.

### 1.2 Goals & Objectives

**Problems solved:**
- Schedule efficiency is a primary driver of student progress and business profitability.
- Scheduling is time-consuming, particularly for larger operations, often requiring multiple dedicated staff.

**Primary outcomes (by priority):**
1. Increase weekly flight hours through faster slot refill and better resource matching.
2. Reduce manual effort — measured as accepted schedule adjustments requiring no staff edits beyond approval.

---

## 2. Background & Context

**Scale:** The system must be designed for the full FSP customer base:
- ~1,300 operators
- ~5,000 locations
- ~30,000 instructors
- ~80,000 students
- ~20,000 daily flights

---

## 3. Users & Use Cases

### 3.1 Target Users

| Role | Responsibility |
|------|---------------|
| Schedulers / Dispatch | Review and approve suggestions in-app (primary approvers) |
| Instructors | Manage availability; receive confirmations and changes |
| Students | Receive offers and confirmations |
| Prospects | Request and receive discovery flight options |
| Managers / Owners | Monitor performance; configure policies |

### 3.2 MVP Use Cases

#### A. Waitlist Automation

**Trigger:** A schedule opening emerges (cancellation, schedule shift, or detected via scheduled process).

**Behavior:**
- Rank eligible candidates using a configurable priority weight system (see Section 4.2).
- Candidates must satisfy: availability, required activity type, aircraft/instructor constraints, and daylight limits.
- Propose booking(s) to scheduler — proposals may include a group of students to reduce approval volume.

**Flow:** Agent ranks candidates &rarr; proposes booking &rarr; scheduler approves in-app &rarr; student receives offer/confirmation (email/SMS).

#### B. Reschedule on Cancellation

**Trigger:** A reservation is canceled by student or operator.

**Behavior:**
- Generate top N compatible alternatives for the affected student (same activity and location; optional preference for same instructor/aircraft; operator-defined search window).

**Flow:** Agent generates alternatives &rarr; scheduler approves &rarr; student receives offer/confirmation.

#### C. Discovery Flight Booking

**Trigger:** A prospect requests a discovery flight.

**Behavior:**
- Generate available options respecting daylight-only constraints, eligible instructor/aircraft pairings, and operator-defined search window.
- Payment is handled externally. If FSP lacks required fields for discovery flights, this product stores the needed attributes.

**Flow:** Agent generates options &rarr; scheduler confirms &rarr; prospect receives confirmation.

#### D. Schedule Next Lesson on Completion

**Trigger:** A training lesson is completed or a scheduled process identifies students with pending lessons.

**Behavior:**
- Determine the student's next required training event from their enrollment.
- Generate scheduling options considering the student's availability, instructor continuity preferences, and aircraft requirements.

**Flow:** Agent suggests next slot(s) &rarr; scheduler approves &rarr; student receives confirmation.

### 3.3 Future Scope (not MVP, provided for architectural context)

**Phase 2:**
- **Disruption adjustments:** Weather advisories, aircraft maintenance status changes, or instructor unavailability trigger suggested time/instructor/aircraft swaps.
- **Inactive student outreach:** Detect students with no upcoming flights; propose slots aligned to their availability.
- **Autonomous low-risk mode:** Automatically apply changes when the target state is strictly lower risk than the current state (e.g., "student flying" is lower risk than "nobody flying"; avoiding a no-show when aircraft will be unavailable).

**Phase 3:**
- **Fleet utilization optimization:** Proactively adjust schedules to optimize aircraft and instructor utilization and create consistent student progress opportunities.
- **Checkride/exam prioritization:** Identify milestone-ready students and coordinate with appropriate DPEs for schools without self-examining authority.

### 3.4 Notable Exclusions (MVP)

- Fees, penalties, and payments (handled by FSP)
- Payroll, timekeeping, training records, grading
- Auto-approval SLAs or timer-based auto-fallback behavior

---

## 4. Feature Description

### 4.1 Shared Capabilities (all sub-features)

**Autonomy model:** Phase 1 operates in suggest-only mode. Phase 2 introduces auto-apply for changes meeting defined risk thresholds. The system should be architecturally designed to support this progression.

**Explainability:** All suggestions include a rationale describing the inputs, constraints evaluated, and policies matched.

**Auditability:** Immutable event log of all suggestions, approvals, bookings, and communications.

**Communication channels:** Email and SMS (templated, operator-editable, opt-in aware, operator-branded).

**Scheduler console:** Work queue with bulk approve/decline, filters, and activity feed.

### 4.2 Configurable Priority Weights (Waitlist)

The waitlist ranking system uses an operator-configurable weight model. Default weights should be evaluated during implementation. Signal sources include but are not limited to:

- **Time since last flight** — longer gap increases priority
- **Time until next scheduled flight** — longer gap increases priority
- **Total flight hours** — configurable direction (higher hours may indicate checkride readiness)
- **Operator-defined custom weights** — extensible for operator-specific business rules

These signals can be sourced from FSP APIs (reservation history, enrollment progress, student profiles). The weight configuration is stored as part of the agent's per-operator settings.

### 4.3 Schedule Change Detection

The system should detect schedule changes and opportunities through one or more of:

- **Scheduled process:** Periodic evaluation of schedule state to identify openings, gaps, and optimization opportunities.
- **Reactive triggers:** Response to external signals such as weather events (METAR/TAF data) or maintenance status changes.
- **On-demand:** Operator or system-initiated requests to evaluate and suggest schedule improvements for a given time range, student group, or resource.

The system should be capable of proactively suggesting one or many schedule changes per evaluation cycle.

---

## 5. Technical Requirements

### 5.1 Architecture

- **Hosting:** Azure preferred; modern engineering practices (automated testing, CI/CD, observability).
- **Tenancy:** Multi-tenant from day one. Tenant = FSP `operatorId`. Strict data isolation and per-tenant policy/configuration.
- **Authentication:** FSP authentication library is available for implementing shared login.
- **Source of truth:** FSP is authoritative for reservations and resources. The agent stores derived artifacts: suggestions, audit logs, policy configurations, communication records.

### 5.2 Available FSP Capabilities

FSP exposes several APIs that may be useful for schedule optimization. These are documented in the **API Appendix** and include:

- **AutoSchedule solver** — A constraint-satisfaction engine that accepts a structured payload (aircraft, instructors, students, availability windows, operating hours, daylight constraints) and returns optimized event placements. Useful for bulk scheduling across a date range.
- **Find-a-Time** — A slot-finding service that returns available time windows for a specific activity type, instructor, aircraft, and date range. Useful for single-slot lookups (e.g., rescheduling, waitlist fill).
- **Schedulable Events queue** — Returns pending training events for students at a location, representing the work to be scheduled.
- **Reservation management** — Individual reservation creation with a validate-then-create pattern, and a batch reservation endpoint for bulk publishing.
- **Resource and availability data** — Aircraft, instructors, locations, student/instructor availability windows and overrides.

How these capabilities are leveraged — or whether alternative approaches are used — is an implementation decision.

### 5.3 Reservation Creation

FSP supports two patterns for creating reservations:

1. **Individual creation** — `POST /V2/Reservation` supports a `validateOnly` flag. The recommended pattern is to validate first, surface any conflicts or constraint violations, then create upon confirmation. This enables granular error handling per reservation.
2. **Batch creation** — `POST /operators/{operatorId}/batchReservations` publishes multiple reservations and provides a status tracking endpoint. Useful for bulk operations where individual error handling is less critical.

Both patterns are documented in the API Appendix.

### 5.4 Communication

- FSP's existing email capabilities are available via API (email notifications on reservation creation).
- SMS delivery requires implementation of an external provider. SMS should be built as a reusable service.

### 5.5 Performance Targets

| Metric | Target |
|--------|--------|
| Schedule change detection | Within minutes of trigger |
| Recommendation generation | < 30 seconds |
| UI responsiveness | Modern web standards |
| Approved action execution | Finalized within minutes |

### 5.6 Security & Compliance

- FSP auth library for API access; least-privilege scopes.
- US data residency.
- SOC 2 Type 2 program adherence.
- Encryption in transit and at rest.
- Tenant isolation.
- Immutable audit retention (1 year minimum recommended).

### 5.7 Observability & Rollout

- Centralized logs, metrics, and traces.
- Operator-visible dashboards: queue health, suggestion acceptance rate, time-to-fill.
- Feature flags for phased rollout per tenant and per sub-feature.

---

## 6. API Reference

All FSP API endpoints, request/response schemas, and data structures are documented in the **[API Appendix](./api-appendix.md)**.
