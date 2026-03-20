# Presearch: Full PRD Gap Closure

**Date**: 2026-03-19
**Type**: Feature addition (existing codebase)
**Scope**: All 3 phases of the Agentic Scheduler PRD — every gap between CompanyDocs PRD and current implementation

---

## Loop 1: CONSTRAINTS (Locked)

| Constraint | Value |
|-----------|-------|
| Stack | TypeScript 5.x / Node 20 LTS / NestJS / Next.js 15 / Drizzle ORM / BullMQ / React 19 |
| DB | PostgreSQL (Azure Flexible Server) + Redis (Azure Cache) |
| AI | OpenRouter (Claude Haiku 4.5) primary, OpenAI (gpt-4.1-nano) fallback |
| Weather | Live API (Open-Meteo — free, no API key, aviation data) |
| Auth | FSP bearer token + subscription key |
| Tenancy | operatorId isolation, RLS context |
| Timeline | NOW — ship everything |
| Phases | All 3 (MVP + Disruptions/Autonomy + Fleet Optimization) |

---

## Loop 2: DISCOVERY — Gap Inventory

### Category A: Critical Bugs (broken right now)

| # | Gap | Root Cause | Fix |
|---|-----|-----------|-----|
| A1 | Discovery flights show IDs not names | `returning()` only selects ID columns, not joined names | Join instructors/aircraft tables or enrich response |
| A2 | Confirm Booking fails (empty body) | `api.post()` sends Content-Type:json with no body | Send `{}` body on approve/decline calls |
| A3 | Template types mismatch | Onboarding seeds `suggestion_ready` etc, UI expects `waitlist` etc | Align template types to match use cases |

### Category B: Missing PRD Phase 1 Features

| # | Gap | PRD Section | What's Needed |
|---|-----|------------|---------------|
| B1 | Weather integration (METAR/TAF) | §4.3 Reactive triggers | Live weather API, weather-based scheduling constraints, weather display in UI |
| B2 | Find-a-Time API | §5.2 | Implement FSP Find-a-Time equivalent using our DB — slot-finding service |
| B3 | AutoSchedule solver | §5.2 | Constraint-satisfaction engine for bulk scheduling optimization |
| B4 | Batch reservation creation | §5.3 | Bulk booking endpoint for grouped suggestions |
| B5 | Flight alerts | API Appendix §19 | Overdue flights, alert management, aircraft-specific alerts |
| B6 | Aircraft maintenance impact | API Appendix §4 | Squawks/maintenance block aircraft from scheduling |
| B7 | Cancellation reasons | API Appendix §9 | Track why reservations were cancelled |
| B8 | Operator-visible dashboards | §5.7 | Queue health, time-to-fill, weekly flight hour trends |
| B9 | Feature flags | §5.7 | Per-tenant, per-feature rollout control |
| B10 | Reservation detail/history API | §5.2 | Get/list reservations with full details |

### Category C: Missing PRD Phase 2 Features

| # | Gap | PRD Section | What's Needed |
|---|-----|------------|---------------|
| C1 | Disruption adjustments | §3.3 Phase 2 | Weather/maintenance/instructor unavailability → auto-suggest swaps |
| C2 | Inactive student outreach | §3.3 Phase 2 | Detect students with no upcoming flights, propose aligned slots |
| C3 | Autonomous low-risk mode | §3.3 Phase 2 | Auto-approve suggestions when risk is strictly lower |
| C4 | Instructor unavailability triggers | §3.3 Phase 2 | When instructor calls out, suggest swaps for their students |

### Category D: Missing PRD Phase 3 Features

| # | Gap | PRD Section | What's Needed |
|---|-----|------------|---------------|
| D1 | Fleet utilization optimization | §3.3 Phase 3 | Proactive schedule adjustment for aircraft/instructor utilization |
| D2 | Checkride/exam prioritization | §3.3 Phase 3 | Identify milestone-ready students, prioritize scheduling |

### Category E: AI Intelligence Gaps

| # | Gap | What's Needed |
|---|-----|---------------|
| E1 | Weather-aware AI insights | AI rationale should mention weather conditions affecting the slot |
| E2 | Student momentum analysis | "Alex hasn't flown in 10 days, training momentum at risk" |
| E3 | Checkride readiness detection | "Ryan is at 38/40 lessons, checkride in sight — prioritize" |
| E4 | Long-lost student identification | "Sophie hasn't flown in 14 days with no upcoming reservation" |
| E5 | Instructor workload balancing | "James Wilson has 6 flights today, consider David Kim instead" |
| E6 | Maintenance-aware suggestions | "N172SP has 100-hr inspection due in 20 hours — avoid for long flights" |

---

## Loop 2.5: Weather API Selection

| Option | Cost | Auth | Aviation Data | Reliability |
|--------|------|------|--------------|-------------|
| **Open-Meteo** | Free | No key needed | Wind, visibility, pressure, cloud cover | High |
| AVWX | Freemium | API key | METAR/TAF native | Medium |
| CheckWX | Paid | API key | METAR/TAF | High |
| OpenWeatherMap | Freemium | API key | General weather | High |

**LOCKED: Open-Meteo** — Free, no API key, has hourly forecasts with wind/visibility/pressure data. We'll derive VFR/IFR conditions from raw weather data. For METAR-style data, we compute from Open-Meteo's aviation-relevant fields (visibility, ceiling, wind speed, gusts).

---

## Loop 3: REFINEMENT — Architecture Decisions

### 3.1 Weather Service Architecture
```
WeatherService (NestJS injectable)
  ├── fetchCurrentWeather(lat, lon) → { temp, wind, visibility, ceiling, conditions }
  ├── fetchForecast(lat, lon, hours) → hourly forecast array
  ├── assessFlightConditions(weather) → { vfr: boolean, ifrOnly: boolean, grounded: boolean, reason }
  └── Cache: Redis, 15min TTL (weather doesn't change faster)

DB: weather_observations table
  - locationId, observedAt, temperature, windSpeed, windGust, windDirection,
    visibility, ceiling, conditions (VFR/MVFR/IFR/LIFR), rawData (JSONB)
```

### 3.2 AutoSchedule Solver Architecture
```
ScheduleSolverService (NestJS injectable)
  ├── solve(operatorId, dateRange, constraints) → SolverResult[]
  │   - Constraint-satisfaction: instructor availability × aircraft availability × student availability × daylight × weather
  │   - Scoring: instructor continuity, aircraft type match, time preference, gap minimization
  │   - Returns ranked slot assignments
  ├── findTime(operatorId, query) → AvailableSlot[]
  │   - Single-student slot finding (replaces mock FSP Find-a-Time)
  └── optimizeDay(operatorId, date) → OptimizationSuggestion[]
      - Fleet utilization analysis for a single day

DB: solver_runs table (audit trail)
  - operatorId, runType, inputParams, results, duration, createdAt
```

### 3.3 Disruption Detection Architecture
```
DisruptionDetectorService
  ├── checkWeatherDisruptions(operatorId) → DisruptionEvent[]
  │   - Fetch weather → compare against VFR minimums → flag affected reservations
  ├── checkMaintenanceDisruptions(operatorId) → DisruptionEvent[]
  │   - Check aircraft approaching 100-hr → flag reservations on those aircraft
  ├── checkInstructorDisruptions(operatorId) → DisruptionEvent[]
  │   - Detect instructor availability changes → flag affected students
  └── generateSwapSuggestions(disruption) → Suggestion[]

DB: disruption_events table
  - operatorId, type (weather/maintenance/instructor), affectedReservations,
    severity, detectedAt, resolvedAt
```

### 3.4 Student Insights Architecture
```
StudentInsightsService
  ├── getInactiveStudents(operatorId) → InactiveStudent[]
  │   - Students with no reservation in past 14 days and none upcoming
  ├── getCheckrideReadyStudents(operatorId) → CheckrideCandidate[]
  │   - Students at >90% enrollment completion
  ├── getAtRiskStudents(operatorId) → AtRiskStudent[]
  │   - Students losing momentum (increasing gaps between flights)
  └── getWorkloadAnalysis(operatorId) → InstructorWorkload[]
      - Per-instructor daily/weekly flight hours, student count

DB: student_insights table (materialized/cached)
  - studentId, operatorId, lastFlightDate, nextFlightDate, daysSinceLastFlight,
    enrollmentProgress, isInactive, isCheckrideReady, isAtRisk, computedAt
```

### 3.5 Failure Mode Analysis

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Open-Meteo API down | No weather data for scheduling | Cache last known weather, degrade gracefully, log warning |
| Solver timeout (>30s) | Slow suggestion generation | Timeout at 30s, fall back to simple slot-finder |
| AI API down | No AI rationale | Already handled — deterministic fallback |
| DB connection lost | All services fail | Connection pooling, retry, health check |
| Redis down | No job queue, no cache | BullMQ retries on reconnect, weather falls back to live API |

---

## Loop 4: PLAN — Phased Implementation

### Phase 1: Critical Bug Fixes (1 hour)
**Goal**: Fix the 3 broken things users see right now.
- A1: Discovery flights show names not IDs
- A2: Confirm Booking sends `{}` body
- A3: Template types alignment

### Phase 2: Weather Integration (2 hours)
**Goal**: Live weather data in DB, weather-aware scheduling.
- WeatherService with Open-Meteo API
- weather_observations table + location coordinates
- Weather display on dashboard
- Weather conditions in AI rationale prompts

### Phase 3: Student Insights Engine (2 hours)
**Goal**: Identify inactive, at-risk, and checkride-ready students.
- StudentInsightsService
- student_insights table
- Inactive student outreach suggestions
- Checkride prioritization in ranking
- AI rationale enriched with student context

### Phase 4: Disruption Detection (2 hours)
**Goal**: Weather/maintenance/instructor disruptions auto-generate swap suggestions.
- DisruptionDetectorService
- disruption_events table
- Weather disruption: flag reservations in bad weather
- Maintenance disruption: flag aircraft approaching limits
- Instructor disruption: detect availability changes

### Phase 5: Schedule Solver & Find-a-Time (2 hours)
**Goal**: Real constraint-satisfaction solver replacing mock slot-finder.
- ScheduleSolverService
- solver_runs audit table
- Find-a-Time equivalent endpoint
- Batch reservation support
- Discovery flights use real solver (names not IDs)

### Phase 6: Fleet & Dashboard (1 hour)
**Goal**: Utilization metrics, operator dashboards, flight alerts.
- Fleet utilization analysis
- Enhanced dashboard (weekly trends, time-to-fill, queue health)
- Flight alert integration
- Cancellation reason tracking

### Phase 7: Autonomous Mode & Feature Flags (1 hour)
**Goal**: Auto-approve low-risk, per-tenant feature flags.
- Feature flag system (DB-backed, per operator)
- Auto-approve logic for low-risk suggestions
- Risk threshold configuration in policies

### Phase Dependency Map
```
Phase 1 (Bug Fixes)
  └── Phase 2 (Weather) + Phase 3 (Student Insights)  [parallel]
       └── Phase 4 (Disruptions)
            └── Phase 5 (Solver)
                 └── Phase 6 (Fleet/Dashboard) + Phase 7 (Autonomy)  [parallel]
```

---

## Loop 5: GAP ANALYSIS — Critic Pass

### 5.1 Requirements Coverage

| PRD Requirement | Phase | Status |
|----------------|-------|--------|
| Waitlist automation | Exists | ✅ Needs real flight history (DONE) |
| Reschedule on cancellation | Exists | ✅ Needs ID resolution (DONE) |
| Discovery flight booking | Phase 1 | Fix names + solver |
| Schedule next lesson | Exists | ✅ |
| Scheduler console | Exists | ✅ |
| Explainability | Exists | ✅ AI rationale |
| Auditability | Exists | ✅ |
| Email/SMS | Exists | ⚠️ SMS is stub |
| Weather triggers | Phase 2 | NEW |
| Inactive student outreach | Phase 3 | NEW |
| Checkride prioritization | Phase 3 | NEW |
| Disruption adjustments | Phase 4 | NEW |
| AutoSchedule solver | Phase 5 | NEW |
| Find-a-Time | Phase 5 | NEW |
| Batch reservations | Phase 5 | NEW |
| Flight alerts | Phase 6 | NEW |
| Fleet optimization | Phase 6 | NEW |
| Feature flags | Phase 7 | NEW |
| Autonomous mode | Phase 7 | NEW |
| METAR/TAF | Phase 2 | NEW |
| Maintenance impact | Phase 4 | NEW |
| Cancellation reasons | Phase 6 | NEW |

### 5.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Open-Meteo rate limits | Low | Medium | 15min cache, batch requests |
| Solver complexity explosion | Medium | High | Timeout at 30s, fall back to simple |
| Too many suggestions overwhelm scheduler | Medium | Medium | Smart grouping, risk-based filtering |
| Auto-approve creates bad booking | Low | High | Conservative risk thresholds, audit trail |

### 5.3 Patch List

| Gap Found | Fix | Phase |
|-----------|-----|-------|
| Location lat/lon not in DB | Add coordinates to locations or mock-data | Phase 2 |
| SMS still a stub | Document as known limitation, not blocking | N/A |
| No reservation detail endpoint | Add GET /reservations/:id | Phase 5 |
