# Tasks: Agentic Scheduler for Flight Schedule Pro

**Input**: Design documents from `/specs/001-agentic-fsp-scheduler/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: Not explicitly requested — test tasks omitted. Tests should be added during implementation per the execution-protocol.md.

**Organization**: Tasks grouped by user story. US6 (Operator Onboarding) is foundational and placed in Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US7)
- Exact file paths included

---

## Phase 1: Setup

**Purpose**: Project initialization, dependencies, tooling

- [x] T001 Initialize pnpm workspace with package.json at repository root
- [x] T002 Configure TypeScript with tsconfig.json (strict mode, path aliases for src/ and web/)
- [x] T003 [P] Initialize NestJS project with Fastify adapter in src/api/main.ts and nest-cli.json
- [x] T004 [P] Initialize Next.js 15 project with App Router in web/ directory
- [x] T005 [P] Initialize BullMQ worker entry point in src/worker/main.ts
- [x] T006 [P] Create docker-compose.yml with PostgreSQL 16 and Redis 7 services
- [x] T007 [P] Configure ESLint and Prettier for the monorepo
- [x] T008 [P] Create .env.local from env.example with DATABASE_URL and REDIS_URL additions
- [x] T009 Configure Drizzle ORM with drizzle.config.ts and src/db/index.ts connection setup
- [x] T010 Add pnpm scripts: dev, dev:api, dev:worker, dev:web, build, lint, typecheck, test, db:migrate, db:generate

---

## Phase 2: Foundational (includes US6 - Operator Onboarding)

**Purpose**: Core infrastructure that MUST complete before any user story. Includes multi-tenancy, FSP integration, auth, database schema, and audit logging.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema & Multi-Tenancy

- [x] T011 Create Drizzle schema for operators table in src/db/schema/operators.ts
- [x] T012 [P] Create Drizzle schema for scheduling_policies table in src/db/schema/scheduling-policies.ts
- [x] T013 [P] Create Drizzle schema for suggestions table in src/db/schema/suggestions.ts
- [x] T014 [P] Create Drizzle schema for prospects table in src/db/schema/prospects.ts
- [x] T015 [P] Create Drizzle schema for audit_events table in src/db/schema/audit-events.ts
- [x] T016 [P] Create Drizzle schema for notification_records table in src/db/schema/notification-records.ts
- [x] T017 [P] Create Drizzle schema for notification_templates table in src/db/schema/notification-templates.ts
- [x] T018 [P] Create Drizzle schema for sync_state table in src/db/schema/sync-state.ts
- [x] T019 Create schema barrel export in src/db/schema/index.ts
- [x] T020 Generate initial Drizzle migration with drizzle-kit generate
- [x] T021 Create PostgreSQL RLS policies migration: tenant_isolation policy on all tenant-scoped tables, append-only policy on audit_events
- [x] T022 Implement TenantGuard in src/api/common/guards/tenant.guard.ts — extracts operatorId from JWT, sets PostgreSQL session variable app.current_tenant

### FSP API Client

- [x] T023 Define FSP API TypeScript types in src/api/fsp/fsp.types.ts — all request/response shapes from CompanyDocs/api-appendix.md
- [x] T024 Implement rate-limited FSP HTTP client in src/api/fsp/fsp.client.ts — per-operator rate limiter (60 req/min), exponential backoff on 429, circuit breaker (5 failures → 60s open)
- [x] T025 Implement FSP auth methods in src/api/fsp/fsp-auth.service.ts — login, MFA, refresh, logout wrapping FSP endpoints
- [x] T026 Implement FSP schedule methods in src/api/fsp/fsp-schedule.service.ts — getSchedule, getReservations, createReservation (validate-then-create), deleteReservation
- [x] T027 [P] Implement FSP resource methods in src/api/fsp/fsp-resource.service.ts — getAircraft, getInstructors, getLocations, getStudents, getAvailability, getCivilTwilight
- [x] T028 [P] Implement FSP training methods in src/api/fsp/fsp-training.service.ts — getSchedulableEvents, getEnrollments, getEnrollmentProgress
- [x] T029 Create FSP NestJS module in src/api/fsp/fsp.module.ts — exports all FSP services

### Authentication & Authorization

- [x] T030 Implement auth module in src/api/modules/auth/auth.module.ts
- [x] T031 Implement auth service in src/api/modules/auth/auth.service.ts — login via FSP, issue JWT with operatorId + userId + permissions, MFA flow, refresh, logout
- [x] T032 Implement auth controller in src/api/modules/auth/auth.controller.ts — POST /api/v1/auth/login, /mfa, /refresh, DELETE /logout per contracts/api.md
- [x] T033 Implement AuthGuard in src/api/common/guards/auth.guard.ts — validates JWT, extracts user context
- [x] T034 Implement GlobalExceptionFilter in src/api/common/filters/global-exception.filter.ts — structured error responses per contracts/api.md error shape

### Audit & Observability

- [x] T035 Implement AuditInterceptor in src/api/common/interceptors/audit.interceptor.ts — auto-logs all mutations to audit_events table
- [x] T036 Implement AuditService in src/api/modules/activity/audit.service.ts — creates audit events, enforces append-only semantics

### Operator Onboarding (US6)

- [x] T037 [US6] Implement operator onboarding service in src/api/modules/auth/onboarding.service.ts — provisions operator record, creates default scheduling_policy, creates default notification_templates, initializes sync_state
- [x] T038 [US6] Implement policies module in src/api/modules/policies/policies.module.ts
- [x] T039 [US6] Implement policies service in src/api/modules/policies/policies.service.ts — GET/PUT scheduling policy per contracts/api.md
- [x] T040 [US6] Implement policies controller in src/api/modules/policies/policies.controller.ts — GET /api/v1/policies, PUT /api/v1/policies

### Shared Types & Utilities

- [x] T041 [P] Define shared domain types in src/core/types/domain.ts — Suggestion, Prospect, Policy, AuditEvent, NotificationRecord types
- [x] T042 [P] Define shared FSP entity types in src/core/types/fsp.ts — Operator, Student, Instructor, Aircraft, Location, Reservation, SchedulableEvent
- [x] T043 [P] Implement time conversion utilities in src/core/utils/time.ts — UTC to FSP local time (no timezone suffix), location timezone lookup, civil twilight helpers
- [x] T044 [P] Implement rate limiter utility in src/core/utils/rate-limiter.ts — token bucket per operatorId, configurable rate

### App Bootstrap

- [x] T045 Wire all foundational modules in src/api/main.ts — register guards (AuthGuard global, TenantGuard), interceptors (AuditInterceptor), filters (GlobalExceptionFilter), FSP module, auth module, policies module
- [x] T046 Add health check endpoint GET /api/v1/health in src/api/modules/health/health.controller.ts

**Checkpoint**: Foundation ready. FSP client works, auth works, RLS isolates tenants, audit logs mutations. Operator can onboard and configure policies.

---

## Phase 3: US5 - Scheduler Approval Console (Priority: P1) 🎯 MVP

**Goal**: Staff-facing web console with suggestion queue — view, filter, approve, decline, bulk operations, activity feed.

**Independent Test**: Populate queue with mock suggestions, verify scheduler can view/filter/approve/decline with activity feed updates.

### API Layer

- [x] T047 [US5] Implement suggestions module in src/api/modules/suggestions/suggestions.module.ts
- [x] T048 [US5] Implement suggestions service in src/api/modules/suggestions/suggestions.service.ts — list (with filters/pagination), getById, approve (validate-then-create via FSP), decline, bulkApprove, bulkDecline, optimistic locking on status transition
- [x] T049 [US5] Implement suggestions controller in src/api/modules/suggestions/suggestions.controller.ts — GET /api/v1/suggestions, POST /:id/approve, POST /:id/decline, POST /bulk-approve, POST /bulk-decline per contracts/api.md
- [x] T050 [US5] Implement activity module with controller in src/api/modules/activity/activity.controller.ts — GET /api/v1/activity with pagination and date filters
- [x] T051 [US5] Implement dashboard module with controller in src/api/modules/dashboard/dashboard.controller.ts — GET /api/v1/dashboard/stats

### Frontend

- [x] T052 [US5] Create API client in web/lib/api.ts — fetch wrapper with auth token, error handling, typed responses
- [x] T053 [P] [US5] Re-export shared types in web/lib/types.ts from src/core/types
- [x] T054 [US5] Create auth context and login page in web/app/login/page.tsx — FSP credential form, JWT storage
- [x] T055 [US5] Create app layout in web/app/layout.tsx — sidebar nav (Dashboard, Queue, Policies, Templates), auth check, operator context
- [x] T056 [US5] Create suggestion-table component in web/components/suggestion-table.tsx — TanStack Table with columns: type, student, time, instructor, aircraft, score, rationale summary, actions
- [x] T057 [P] [US5] Create filter-bar component in web/components/filter-bar.tsx — type dropdown, location dropdown, date range picker, status toggle
- [x] T058 [P] [US5] Create suggestion-card component in web/components/suggestion-card.tsx — detail view with full rationale panel
- [x] T059 [P] [US5] Create rationale-panel component in web/components/rationale-panel.tsx — expandable panel showing inputs, constraints, policies matched
- [x] T060 [P] [US5] Create activity-feed component in web/components/activity-feed.tsx — timeline of recent actions with event type icons and timestamps
- [x] T061 [US5] Create approval queue page in web/app/queue/page.tsx — integrates suggestion-table, filter-bar, bulk actions toolbar, activity feed sidebar
- [x] T062 [US5] Create dashboard page in web/app/dashboard/page.tsx — stats cards (pending, approved today, acceptance rate, flight hours delta)
- [x] T063 [US5] Implement bulk approve/decline UI in web/app/queue/page.tsx — checkbox selection, bulk action buttons, confirmation modal, result summary

**Checkpoint**: Scheduler can log in, view suggestion queue, filter, approve/decline individually and in bulk, see activity feed and dashboard stats.

---

## Phase 4: US1 - Waitlist Automation (Priority: P1) 🎯 MVP

**Goal**: System detects schedule openings, ranks eligible students, generates waitlist suggestions automatically.

**Independent Test**: Create a cancellation in FSP, system detects opening, generates ranked suggestions visible in the approval console.

### Core Ranking Logic

- [x] T064 [US1] Implement waitlist ranking algorithm in src/core/ranking/waitlist-ranker.ts — weighted scoring: timeSinceLastFlight, timeUntilNextFlight, totalHours, custom weights from operator policy
- [x] T065 [US1] Implement constraint evaluator in src/core/scheduling/constraint-evaluator.ts — checks availability, activity type match, aircraft/instructor compatibility, daylight constraints (civil twilight)
- [x] T066 [US1] Implement rationale builder in src/core/scheduling/rationale-builder.ts — constructs explainability JSON: inputs considered, constraints evaluated, policies matched, summary text

### Background Jobs

- [x] T067 [US1] Implement FSP schedule polling job in src/worker/jobs/poll-schedule.job.ts — polls FSP schedule per operator at configured interval, detects changes via hash comparison, triggers suggestion generation on change
- [x] T068 [US1] Implement waitlist suggestion generator job in src/worker/jobs/generate-suggestions.job.ts — on opening detected: fetch eligible students, run ranking, evaluate constraints, create suggestion records with rationale and TTL
- [x] T069 [US1] Implement suggestion expiration job in src/worker/jobs/expire-suggestions.job.ts — periodic check for TTL-exceeded suggestions, immediate expire when slot detected as filled, audit log entry on expiration
- [x] T070 [US1] Register all BullMQ jobs and repeatable schedules in src/worker/main.ts — poll-schedule (repeatable per operator), expire-suggestions (every 5 min global)
- [x] T071 [US1] Implement schedule change detector in src/core/scheduling/change-detector.ts — compares current FSP schedule against last sync hash, identifies new openings (cancellations, gaps)

### Integration

- [x] T072 [US1] Wire suggestion generation to approval flow — generated suggestions appear in GET /api/v1/suggestions, approve creates FSP reservation via validate-then-create
- [x] T073 [US1] Implement grouped proposals in src/api/modules/suggestions/suggestions.service.ts — when multiple openings detected simultaneously, group related suggestions under shared group_id

**Checkpoint**: Full waitlist automation pipeline works — FSP polling detects openings, ranking generates suggestions, scheduler sees them in console, approves to create FSP reservation.

---

## Phase 5: US2 - Reschedule on Cancellation (Priority: P2)

**Goal**: When a reservation is canceled, generate alternative time slots for the affected student.

**Independent Test**: Cancel a reservation in FSP, system generates 5 alternative slots, scheduler approves one to create new reservation.

- [x] T074 [US2] Implement cancellation detector in src/core/scheduling/cancellation-detector.ts — identifies canceled reservations from schedule diff, extracts affected student and activity details
- [x] T075 [US2] Implement slot finder with progressive expansion in src/core/scheduling/slot-finder.ts — uses FSP Find-a-Time API, starts at 7 days, expands in 7-day increments until N alternatives found or 28-day cap, respects same activity type and location
- [x] T076 [US2] Implement reschedule suggestion generator in src/worker/jobs/generate-suggestions.job.ts — extends existing generator with reschedule type: on cancellation detected, find slots, rank by instructor/aircraft preference match, create suggestions
- [x] T077 [US2] Handle concurrent waitlist + reschedule on same cancellation in src/worker/jobs/generate-suggestions.job.ts — both workflows run independently, slot conflict prevention via FSP validation at approval time

**Checkpoint**: Cancellation triggers reschedule suggestions. Scheduler sees alternatives, approves to rebook. Works alongside waitlist automation.

---

## Phase 6: US3 - Discovery Flight Booking (Priority: P3)

**Goal**: Scheduler enters prospect info, system generates daylight-only scheduling options.

**Independent Test**: Enter a prospect's details, system returns available discovery flight slots, scheduler confirms to create FSP reservation.

- [x] T078 [US3] Implement discovery module in src/api/modules/discovery/discovery.module.ts
- [x] T079 [US3] Implement discovery service in src/api/modules/discovery/discovery.service.ts — create prospect record, generate daylight-only options using FSP Find-a-Time with daylight filter, create suggestions linked to prospect
- [x] T080 [US3] Implement discovery controller in src/api/modules/discovery/discovery.controller.ts — POST /api/v1/discovery-flights per contracts/api.md
- [x] T081 [US3] Implement daylight constraint filter in src/core/scheduling/constraint-evaluator.ts — uses FSP civil twilight API to filter slots to daylight-only hours

**Checkpoint**: Scheduler can enter discovery flight request, see daylight-only options, confirm booking.

---

## Phase 7: US7 - Notification Delivery (Priority: P3)

**Goal**: Students/prospects receive email and/or SMS notifications on approved scheduling actions.

**Independent Test**: Approve a suggestion, verify student receives email notification via FSP and notification is logged.

- [x] T082 [US7] Implement notification module in src/api/modules/notifications/notifications.module.ts
- [x] T083 [US7] Implement notification service in src/api/modules/notifications/notification.service.ts — dispatches email (via FSP sendEmailNotification flag on reservation create) and SMS (via provider interface), respects opt-in preferences, renders templates, logs notification record
- [x] T084 [US7] Implement SMS provider interface in src/api/modules/notifications/sms-provider.interface.ts — interface with send() method, Twilio implementation behind it (swappable)
- [x] T085 [US7] Implement notification dispatch job in src/worker/jobs/send-notification.job.ts — triggered on suggestion approval, fans out to email + SMS based on preferences
- [x] T086 [US7] Implement notification template CRUD in src/api/modules/notifications/templates.controller.ts — GET /api/v1/templates, PUT /api/v1/templates/:id per contracts/api.md
- [x] T087 [US7] Create notification template editor page in web/app/templates/page.tsx — list templates by type, edit subject + body with placeholder preview
- [x] T088 [US7] Wire notification dispatch into suggestion approval flow — on approve → enqueue send-notification job

**Checkpoint**: Approved suggestions trigger notifications. Email via FSP, SMS optional. Templates are operator-editable. Delivery logged.

---

## Phase 8: US4 - Schedule Next Lesson on Completion (Priority: P4)

**Goal**: System identifies students with pending lessons and suggests next scheduling options.

**Independent Test**: Complete a lesson in FSP, system identifies next required event, generates scheduling options respecting availability and instructor continuity.

- [x] T089 [US4] Implement enrollment analyzer in src/core/scheduling/enrollment-analyzer.ts — reads student enrollment + progress from FSP, determines next required training event by course sequence and lesson order
- [x] T090 [US4] Implement next-lesson suggestion generator in src/worker/jobs/generate-suggestions.job.ts — extends generator with next_lesson type: finds slots respecting student availability, prefers same instructor, matches aircraft requirements, creates suggestions with enrollment linkage
- [x] T091 [US4] Implement pending lesson detector in src/worker/jobs/poll-schedule.job.ts — periodic check for students with active enrollments but no upcoming reservations, triggers next-lesson suggestion generation
- [x] T092 [US4] Handle enrollment completion detection — when all lessons in enrollment are complete, do not generate suggestions, mark enrollment as fully scheduled in rationale

**Checkpoint**: System proactively identifies students needing next lessons and suggests slots. Works alongside all other use case types.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories

- [ ] T093 [P] Create policies configuration page in web/app/policies/page.tsx — form for waitlist weights, search window, TTL, polling interval, notification preferences
- [ ] T094 [P] Add operator dashboard real-time stats in web/app/dashboard/page.tsx — acceptance rate chart, flight hours trend, queue health indicators
- [ ] T095 Implement Redis caching for FSP resource data in src/api/fsp/fsp-cache.service.ts — aircraft, instructor, location lists cached with 5-10 minute TTL
- [ ] T096 Add structured logging across all modules — request ID, operator ID, action type in every log entry
- [ ] T097 [P] Add Bull Board monitoring dashboard for BullMQ jobs — mount at /admin/queues (auth-protected)
- [ ] T098 Security hardening — verify all endpoints have AuthGuard + TenantGuard, audit sensitive field exclusion, validate FSP token encryption at rest
- [ ] T099 Run quickstart.md validation — verify full dev setup works from clean state
- [ ] T100 Update conventions/flighschedulepro-reference.md with actual code patterns discovered during implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational + US6)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US5 Console)**: Depends on Phase 2
- **Phase 4 (US1 Waitlist)**: Depends on Phase 2 + Phase 3 (needs suggestion API to store/display results)
- **Phase 5 (US2 Reschedule)**: Depends on Phase 2 + Phase 3 (extends existing suggestion pipeline)
- **Phase 6 (US3 Discovery)**: Depends on Phase 2 + Phase 3 (independent module, uses suggestion API)
- **Phase 7 (US7 Notifications)**: Depends on Phase 2 + Phase 3 (wires into approval flow)
- **Phase 8 (US4 Next Lesson)**: Depends on Phase 2 + Phase 3 + Phase 4 (extends polling + suggestion pipeline)
- **Phase 9 (Polish)**: Depends on all desired user stories

### User Story Dependencies

- **US5 (Console)**: Foundation only — no other story dependency. First to build.
- **US1 (Waitlist)**: Needs US5 (suggestion display) — builds on console infrastructure
- **US2 (Reschedule)**: Needs US5 + extends US1 pipeline — can parallel with US1 after Phase 3
- **US3 (Discovery)**: Needs US5 — independent module, can parallel with US1/US2 after Phase 3
- **US7 (Notifications)**: Needs US5 — wires into approval, can parallel with US1-US3 after Phase 3
- **US4 (Next Lesson)**: Needs US5 + US1 (extends polling) — last in sequence

### Parallel Opportunities per Phase

**Phase 2**: T012-T018 (all schemas), T023+T041-T044 (types/utils), T027+T028 (FSP services)
**Phase 3**: T056-T060 (all frontend components), T050+T051 (activity + dashboard APIs)
**Phase 5-7**: Can run in parallel with each other after Phase 3 completes

---

## Implementation Strategy

### MVP First (US5 Console + US1 Waitlist)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational + US6 Onboarding
3. Complete Phase 3: US5 Approval Console
4. Complete Phase 4: US1 Waitlist Automation
5. **STOP and VALIDATE**: End-to-end test — FSP polling → opening detected → suggestions generated → scheduler approves → FSP reservation created
6. Deploy MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US5 Console → Scheduler can log in and see the queue (even if empty)
3. US1 Waitlist → Queue fills with real suggestions → Deploy MVP!
4. US2 Reschedule → Canceled students get alternatives → Deploy
5. US3 Discovery + US7 Notifications → Discovery intake + automated notifications → Deploy
6. US4 Next Lesson → Proactive scheduling → Deploy
7. Polish → Dashboard, caching, monitoring → Deploy

### Agent Teams Strategy

With the multi-agent factory system:
1. Full team completes Setup + Foundational
2. Once Phase 2 done:
   - Teammate A (Sam): US5 Console backend
   - Teammate B (Sam): US5 Console frontend
   - After Phase 3: teammates split across US1, US2, US3, US7 in parallel
3. Tech Lead (Taylor) reviews each phase's PRs
4. QA (Casey) tests each phase independently with browser screenshots
