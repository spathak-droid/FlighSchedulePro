# PRD: Full Gap Closure — Agentic Scheduler

**Date**: 2026-03-19
**Branch**: `001-agentic-fsp-scheduler`
**Presearch**: [presearch.md](./presearch.md)
**Source PRD**: [CompanyDocs/agentic-scheduler-prd.md](../../CompanyDocs/agentic-scheduler-prd.md)

---

## Phase 1: Critical Bug Fixes

**Goal**: Fix the 3 things broken right now.
**Depends on**: Nothing.

### Requirements
- [ ] **P1-1**: Discovery flights response includes `instructorName` and `aircraftRegistration` (not just IDs)
- [ ] **P1-2**: Confirm Booking / Approve / Decline send `{}` body to avoid empty-body JSON error
- [ ] **P1-3**: Notification template types aligned: seed `waitlist`, `reschedule`, `discovery`, `next_lesson` (both email+SMS) during onboarding
- [ ] **P1-4**: Discovery flight cards show instructor name and aircraft registration in UI

### Acceptance Criteria
- Discovery page shows "James Wilson" not "inst-001"
- Confirm Booking button works without console errors
- Templates page shows all 4 suggestion types with editable templates

---

## Phase 2: Live Weather Integration

**Goal**: Real-time weather data from Open-Meteo API. Weather impacts scheduling decisions and AI rationale.
**Depends on**: Phase 1.

### Requirements
- [ ] **P2-1**: `WeatherService` — fetches current conditions and hourly forecast from Open-Meteo API (no API key needed)
- [ ] **P2-2**: `weather_observations` DB table — caches weather per location (15min TTL via Redis)
- [ ] **P2-3**: Location coordinates — add `latitude`/`longitude` to locations (mock-data has ICAO codes: KPAO=37.46/-122.11, KSQL=37.51/-122.25, KHWD=37.66/-122.12)
- [ ] **P2-4**: `assessFlightConditions()` — derive VFR/MVFR/IFR/LIFR from visibility+ceiling+wind
- [ ] **P2-5**: Weather widget on dashboard — current conditions per location
- [ ] **P2-6**: Weather data included in AI rationale prompt — "Current conditions at KPAO: VFR, wind 8kt, visibility 10sm"
- [ ] **P2-7**: Weather constraint in suggestion generation — flag slots in IFR/LIFR conditions for non-instrument-rated students
- [ ] **P2-8**: `GET /api/v1/weather/:locationId` endpoint — returns current + forecast

### Acceptance Criteria
- Dashboard shows live weather for operator's locations
- AI rationale mentions weather conditions
- Non-instrument students not scheduled in IFR conditions

---

## Phase 3: Student Insights Engine

**Goal**: Proactively identify inactive, at-risk, and checkride-ready students. AI uses these insights.
**Depends on**: Phase 1.

### Requirements
- [ ] **P3-1**: `StudentInsightsService` with methods: `getInactiveStudents()`, `getCheckrideReadyStudents()`, `getAtRiskStudents()`, `getInstructorWorkload()`
- [ ] **P3-2**: `student_insights` DB table — materialized view of per-student metrics (refreshed every poll cycle)
- [ ] **P3-3**: Inactive = no flight in 14+ days AND no upcoming reservation
- [ ] **P3-4**: Checkride-ready = enrollment progress >= 90%
- [ ] **P3-5**: At-risk = flight gap increasing (each gap longer than previous)
- [ ] **P3-6**: Auto-generate outreach suggestions for inactive students (type='outreach')
- [ ] **P3-7**: Boost checkride-ready students in waitlist ranking (+20% score)
- [ ] **P3-8**: AI rationale includes student insights — "Sophie hasn't flown in 14 days, risk of losing training momentum"
- [ ] **P3-9**: Instructor workload analysis — per-instructor daily/weekly hours
- [ ] **P3-10**: `GET /api/v1/insights` endpoint — returns inactive, checkride-ready, at-risk lists
- [ ] **P3-11**: Insights panel on dashboard — cards showing inactive count, checkride-ready count, at-risk count

### Acceptance Criteria
- Dashboard shows "3 inactive students" / "1 checkride-ready" / "2 at-risk"
- Clicking each card shows the student list
- AI rationale mentions student momentum/checkride context
- Inactive students get automatic outreach suggestions

---

## Phase 4: Disruption Detection & Response

**Goal**: Automatically detect weather/maintenance/instructor disruptions and generate swap suggestions.
**Depends on**: Phase 2 + Phase 3.

### Requirements
- [ ] **P4-1**: `DisruptionDetectorService` — runs on each poll cycle
- [ ] **P4-2**: `disruption_events` DB table — tracks active disruptions with affected reservations
- [ ] **P4-3**: Weather disruption — fetch forecast, flag reservations in bad weather windows, generate reschedule suggestions
- [ ] **P4-4**: Maintenance disruption — aircraft approaching 100-hr inspection or with open squawks → flag reservations, suggest aircraft swap
- [ ] **P4-5**: Instructor unavailability — detect new availability overrides (time off) → flag affected students, suggest instructor swap
- [ ] **P4-6**: Disruption suggestions have type='disruption' with sub-type (weather/maintenance/instructor)
- [ ] **P4-7**: AI rationale explains the disruption — "Weather at KPAO dropping below VFR minimums at 2pm, your 2-4pm flight affected"
- [ ] **P4-8**: `GET /api/v1/disruptions` endpoint — active disruptions for operator
- [ ] **P4-9**: Disruption banner on queue page when active disruptions exist

### Acceptance Criteria
- Bad weather auto-generates reschedule suggestions for affected flights
- Aircraft nearing maintenance triggers swap suggestions
- Instructor calling out triggers reassignment suggestions
- Queue shows disruption banner with count

---

## Phase 5: Schedule Solver & Reservation Management

**Goal**: Real constraint-satisfaction solver, Find-a-Time, batch reservations, full reservation lifecycle.
**Depends on**: Phase 4.

### Requirements
- [ ] **P5-1**: `ScheduleSolverService` — constraint-satisfaction engine considering: instructor availability × aircraft availability × student availability × daylight × weather × maintenance
- [ ] **P5-2**: `solver_runs` DB table — audit trail of solver executions
- [ ] **P5-3**: `POST /api/v1/solver/find-time` — Find-a-Time equivalent: given student + activity type + date range, return available slots with scoring
- [ ] **P5-4**: `POST /api/v1/solver/optimize` — optimize a day's schedule for an operator (fleet utilization)
- [ ] **P5-5**: `POST /api/v1/reservations/batch` — create multiple reservations from approved suggestions
- [ ] **P5-6**: `GET /api/v1/reservations/:id` — get reservation details
- [ ] **P5-7**: `GET /api/v1/reservations` — list reservations with filters (date range, student, instructor, aircraft, status)
- [ ] **P5-8**: `DELETE /api/v1/reservations/:id` — cancel reservation with reason
- [ ] **P5-9**: `cancellation_reasons` DB table — operator-configurable reasons
- [ ] **P5-10**: Discovery flights use solver for real availability (not mock slot-finder)
- [ ] **P5-11**: Validate-then-create pattern for all reservation creation

### Acceptance Criteria
- Find-a-Time returns real available slots from DB data
- Batch approve creates all reservations in one operation
- Reservation list/detail endpoints work
- Discovery flights show real instructor names and times

---

## Phase 6: Fleet Dashboard & Flight Alerts

**Goal**: Operator-visible dashboards with utilization metrics, flight alerts, and trend analysis.
**Depends on**: Phase 5.

### Requirements
- [ ] **P6-1**: Enhanced dashboard stats: weekly flight hour trends (7-day chart), time-to-fill metric, queue health score
- [ ] **P6-2**: Fleet utilization view — per-aircraft daily utilization percentage
- [ ] **P6-3**: Instructor utilization view — per-instructor daily hours and student count
- [ ] **P6-4**: `flight_alerts` DB table — overdue flights, return alerts, safety alerts
- [ ] **P6-5**: `GET /api/v1/flight-alerts` — list active alerts
- [ ] **P6-6**: `POST /api/v1/flight-alerts/:reservationId/complete` — resolve alert
- [ ] **P6-7**: Flight alert banner on dashboard when overdue flights exist
- [ ] **P6-8**: Weekly email summary for operators (acceptance rate, flight hours delta, top issues)
- [ ] **P6-9**: Cancellation reason analytics — which reasons are most common

### Acceptance Criteria
- Dashboard shows weekly flight hour trend chart
- Fleet page shows aircraft utilization bars
- Overdue flight alerts show prominently
- Operators see time-to-fill and acceptance rate

---

## Phase 7: Autonomous Mode & Feature Flags

**Goal**: Auto-approve low-risk suggestions. Per-tenant feature flags for phased rollout.
**Depends on**: Phase 6.

### Requirements
- [ ] **P7-1**: `feature_flags` DB table — `operatorId`, `flagName`, `enabled`, `config` (JSONB)
- [ ] **P7-2**: `FeatureFlagService` — `isEnabled(operatorId, flag)`, `getConfig(operatorId, flag)`
- [ ] **P7-3**: Feature flags for: `ai_rationale`, `risk_assessment`, `auto_approve`, `disruption_detection`, `weather_integration`, `student_insights`, `fleet_optimization`
- [ ] **P7-4**: Auto-approve logic: when `auto_approve` enabled for operator AND suggestion riskLevel='low' AND all constraints pass → auto-approve without scheduler review
- [ ] **P7-5**: Auto-approve creates reservation immediately, sends notification, logs audit event with `actorId='system-auto'`
- [ ] **P7-6**: `PUT /api/v1/policies` extended with `autoApproveEnabled`, `autoApproveRiskThreshold` fields
- [ ] **P7-7**: Policies page UI shows auto-approve toggle and risk threshold selector
- [ ] **P7-8**: `GET /api/v1/feature-flags` — admin endpoint to view/manage flags
- [ ] **P7-9**: All new features (Phase 2-6) gated behind feature flags

### Acceptance Criteria
- Low-risk suggestions auto-approve when enabled
- Auto-approved suggestions show "Auto-approved" badge in queue
- Feature flags control which features are active per operator
- Operators can enable/disable auto-approve in policies

---

## MVP Validation Checklist

| # | PRD Requirement | Phase | Covered |
|---|----------------|-------|---------|
| 1 | Waitlist automation | Exists | ✅ |
| 2 | Reschedule on cancellation | Exists | ✅ |
| 3 | Discovery flight booking | P1 | Fix names |
| 4 | Schedule next lesson | Exists | ✅ |
| 5 | Scheduler console | Exists | ✅ |
| 6 | Explainability/rationale | Exists + AI | ✅ |
| 7 | Auditability | Exists | ✅ |
| 8 | Email/SMS | Exists (SMS stub) | ⚠️ |
| 9 | Weather triggers | P2 | NEW |
| 10 | METAR/TAF equivalent | P2 | NEW |
| 11 | Inactive student outreach | P3 | NEW |
| 12 | Checkride prioritization | P3 | NEW |
| 13 | Disruption adjustments | P4 | NEW |
| 14 | AutoSchedule solver | P5 | NEW |
| 15 | Find-a-Time | P5 | NEW |
| 16 | Batch reservations | P5 | NEW |
| 17 | Flight alerts | P6 | NEW |
| 18 | Fleet optimization | P6 | NEW |
| 19 | Operator dashboards | P6 | NEW |
| 20 | Feature flags | P7 | NEW |
| 21 | Autonomous mode | P7 | NEW |
| 22 | Cancellation reasons | P5 | NEW |
| 23 | Maintenance impact | P4 | NEW |
| 24 | Instructor workload | P3 | NEW |
| 25 | Student momentum | P3 | NEW |
