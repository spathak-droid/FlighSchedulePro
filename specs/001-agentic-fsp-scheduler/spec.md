# Feature Specification: Agentic Scheduler for Flight Schedule Pro

**Feature Branch**: `001-agentic-fsp-scheduler`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "Multi-tenant agentic scheduling system integrating with FSP to automate flight school scheduling via suggest-and-approve model. MVP covers waitlist automation, reschedule on cancellation, discovery flight booking, and schedule-next-lesson-on-completion."

## Clarifications

### Session 2026-03-18

- Q: Should suggestions auto-expire from the approval queue? → A: Yes — auto-expire after an operator-configurable TTL (default 24 hours). Additionally, suggestions are immediately expired if the system detects the underlying slot was filled during a regular detection cycle. Modeled after healthcare waitlist systems (hybrid time + state-based expiration).
- Q: How many reschedule alternatives should the system generate (the "top N" in FR-004)? → A: Default 5, operator-configurable in range 3-10.
- Q: How do prospects submit discovery flight requests? → A: Scheduler manually enters the request on behalf of the prospect. No public-facing UI in MVP. The system is entirely staff-facing.
- Q: How does the system sync data from FSP? → A: Periodic polling (every 2-5 minutes) via background job. Matches PRD's "scheduled process" language and "within minutes" detection target. FSP does not expose webhooks.
- Q: What is the default search window for rescheduling alternatives? → A: Progressive expansion — start with 7 days, expand in 7-day increments if fewer than N alternatives found, hard cap at 28 days. Initial window, increment, and hard cap are all operator-configurable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Waitlist Automation (Priority: P1)

A schedule opening emerges at a flight school — a student cancels their 2pm lesson, or the scheduler notices a gap. The system detects this opening, evaluates all eligible students based on configurable priority weights (time since last flight, gap until next flight, total hours, custom operator rules), filters candidates by availability, required activity type, aircraft/instructor compatibility, and daylight constraints, then proposes ranked booking suggestions to the scheduler. The scheduler reviews the suggestion in-app and approves it. The student receives an offer or confirmation via email or SMS.

**Why this priority**: Waitlist automation directly drives the primary business outcome — increasing weekly flight hours through faster slot refill. Empty slots represent lost revenue and delayed student progress. This is the highest-impact use case.

**Independent Test**: Can be fully tested by creating a cancellation in FSP for a location with waitlisted students. The system should detect the opening, rank candidates, present a proposal to the scheduler, and upon approval, create the reservation in FSP and notify the student.

**Acceptance Scenarios**:

1. **Given** a schedule opening exists at a location with eligible waitlisted students, **When** the system detects the opening, **Then** it generates a ranked list of candidate bookings with a rationale for each ranking.
2. **Given** the system has generated booking proposals, **When** the scheduler approves a proposal in-app, **Then** the reservation is created in FSP and the student receives a confirmation notification (email/SMS).
3. **Given** the system has generated booking proposals, **When** the scheduler declines a proposal, **Then** the system records the decline in the audit log and no reservation is created.
4. **Given** multiple openings exist simultaneously, **When** the system evaluates candidates, **Then** it proposes grouped bookings where appropriate to reduce the number of approvals needed.
5. **Given** a candidate matches an opening, **When** the candidate does not meet daylight constraints or aircraft/instructor requirements, **Then** the candidate is excluded from the proposal with the exclusion reason logged.

---

### User Story 2 - Reschedule on Cancellation (Priority: P2)

A student or operator cancels an existing reservation. The system detects the cancellation and generates the top 5 (default, operator-configurable) compatible alternative time slots for the affected student. Alternatives respect the same activity type, same location, and optionally prefer the same instructor or aircraft. The search window is operator-configurable. The scheduler reviews the alternatives and approves one. The student receives an offer or confirmation.

**Why this priority**: Rescheduling directly supports student continuity — a canceled lesson that goes unscheduled delays training progress. This complements waitlist automation by ensuring the canceled student is also taken care of, not just the waitlist candidates.

**Independent Test**: Can be tested by canceling an existing reservation in FSP and verifying the system generates valid alternative slots for the affected student, presents them for approval, and upon approval creates the new reservation.

**Acceptance Scenarios**:

1. **Given** a reservation is canceled, **When** the system detects the cancellation, **Then** it generates the top 5 (default) alternative time slots for the affected student using progressive search window expansion (7-day initial, expanding in 7-day increments up to 28-day cap).
2. **Given** alternatives have been generated, **When** the scheduler approves one, **Then** the new reservation is created in FSP with the same activity type and location, and the student is notified.
3. **Given** no compatible alternatives exist within the search window, **When** the system evaluates options, **Then** the scheduler is informed that no alternatives are available, with an explanation of why (e.g., no instructor availability, no aircraft, outside daylight hours).
4. **Given** the student has preferences for a specific instructor or aircraft, **When** alternatives are generated, **Then** options matching those preferences are ranked higher but non-matching options are still included.

---

### User Story 3 - Discovery Flight Booking (Priority: P3)

A scheduler receives a discovery flight request from a prospect (via phone, email, or walk-in) and enters it into the system on the prospect's behalf. The system generates available scheduling options that respect daylight-only constraints, eligible instructor/aircraft pairings, and the operator's defined search window. Payment is handled externally (outside this system). The scheduler confirms the booking. The prospect receives a confirmation. If FSP does not have fields needed for discovery flight attributes, this system stores them. There is no public-facing UI in MVP — the system is entirely staff-facing.

**Why this priority**: Discovery flights are the entry point for new students — they drive the sales pipeline. While lower volume than regular training flights, they represent new revenue and are a distinct workflow that doesn't depend on existing student data.

**Independent Test**: Can be tested by submitting a discovery flight request and verifying the system returns valid scheduling options that respect daylight and resource constraints, and upon scheduler confirmation, the reservation is created and the prospect is notified.

**Acceptance Scenarios**:

1. **Given** a scheduler enters a discovery flight request on behalf of a prospect, **When** the system evaluates availability, **Then** it returns scheduling options that are daylight-only, with eligible instructor/aircraft pairings, within the operator's search window.
2. **Given** the scheduler confirms a discovery flight option, **When** the confirmation is processed, **Then** a reservation is created in FSP and the prospect receives a confirmation notification.
3. **Given** FSP does not have required fields for discovery flight data, **When** a discovery flight is booked, **Then** the system stores the supplemental attributes (prospect contact information, flight preferences) alongside the FSP reservation reference.
4. **Given** no eligible time slots exist for a discovery flight, **When** the system evaluates options, **Then** the scheduler is informed with specific reasons (e.g., no daylight slots available, all instructors booked).

---

### User Story 4 - Schedule Next Lesson on Completion (Priority: P4)

A training lesson is completed, or a periodic process identifies students with pending lessons in their enrollment. The system determines the student's next required training event based on their enrollment and course progression. It generates scheduling options that consider the student's availability, instructor continuity preferences, and aircraft requirements. The scheduler approves the suggestion, and the student receives a confirmation.

**Why this priority**: Proactive next-lesson scheduling maintains training momentum and ensures students don't fall through the cracks. It relies on enrollment and progress data, making it more complex than the other use cases, hence lower priority for initial delivery.

**Independent Test**: Can be tested by completing a lesson in FSP for a student with an active enrollment and verifying the system identifies the next required event, generates valid scheduling options, and upon approval creates the reservation.

**Acceptance Scenarios**:

1. **Given** a training lesson is completed, **When** the system evaluates the student's enrollment, **Then** it identifies the next required training event based on course sequence and lesson order.
2. **Given** the next required event is identified, **When** the system generates scheduling options, **Then** options respect the student's availability, prefer the same instructor for continuity, and match aircraft requirements.
3. **Given** scheduling options are generated, **When** the scheduler approves one, **Then** the reservation is created in FSP with the correct course, lesson, and enrollment linkage, and the student is notified.
4. **Given** a periodic process identifies students with pending lessons but no upcoming reservations, **When** the system evaluates their enrollment, **Then** it generates proactive scheduling suggestions for those students.
5. **Given** the student has completed all lessons in their enrollment, **When** the system checks for a next event, **Then** it does not generate scheduling suggestions and marks the enrollment as fully scheduled.

---

### User Story 5 - Scheduler Approval Console (Priority: P1)

A scheduler logs into the system and sees a work queue of pending scheduling suggestions across all active use cases (waitlist, reschedule, discovery, next-lesson). They can filter suggestions by type, location, date range, and priority. They can approve or decline individual suggestions, or bulk approve/decline groups. Each suggestion includes a rationale explaining why it was generated and the constraints that were evaluated. An activity feed shows recent actions and their outcomes.

**Why this priority**: This is the primary user interface for all other use cases. Without the approval console, no suggestions can be acted upon. It is co-P1 with waitlist automation as the delivery vehicle for all scheduling suggestions.

**Independent Test**: Can be tested by populating the queue with mock suggestions and verifying the scheduler can view, filter, approve, decline, and bulk-process them, with all actions reflected in the activity feed and audit log.

**Acceptance Scenarios**:

1. **Given** the scheduler opens the console, **When** pending suggestions exist, **Then** they see a prioritized list of suggestions with type, student name, proposed time, and rationale summary.
2. **Given** the scheduler wants to focus on a specific location, **When** they apply a location filter, **Then** only suggestions for that location are displayed.
3. **Given** the scheduler selects multiple suggestions, **When** they choose bulk approve, **Then** all selected suggestions are processed and corresponding reservations are created in FSP.
4. **Given** the scheduler approves or declines a suggestion, **When** the action is recorded, **Then** the activity feed updates in near real-time showing the action, outcome, and timestamp.
5. **Given** a suggestion includes a rationale, **When** the scheduler views the suggestion detail, **Then** they see the inputs considered, constraints evaluated, and policies matched.

---

### User Story 6 - Multi-Tenant Operator Onboarding (Priority: P2)

An operator (flight school) is onboarded to the system. Their FSP account is connected via authentication. The system begins syncing their schedule data, resource data (aircraft, instructors, locations), and student data from FSP. The operator configures their scheduling policies — priority weights for waitlist ranking, search windows for rescheduling, and communication preferences (email/SMS templates, opt-in settings). Each operator's data is strictly isolated from other operators.

**Why this priority**: Multi-tenancy is foundational infrastructure. Without operator onboarding and FSP integration, none of the scheduling use cases can function. It is P2 because it is prerequisite infrastructure, not a user-facing scheduling workflow.

**Independent Test**: Can be tested by connecting a new operator's FSP account, verifying data sync (aircraft, instructors, students, schedule), configuring scheduling policies, and confirming data isolation from other tenants.

**Acceptance Scenarios**:

1. **Given** a new operator wants to use the system, **When** they authenticate with their FSP credentials, **Then** their account is provisioned with their operator ID as the tenant identifier.
2. **Given** an operator is onboarded, **When** the system syncs with FSP, **Then** it retrieves the operator's locations, aircraft, instructors, students, and current schedule.
3. **Given** an operator configures priority weights, **When** the waitlist ranking runs for that operator, **Then** it uses the operator's configured weights, not defaults.
4. **Given** two operators are onboarded, **When** one operator's scheduler views suggestions, **Then** they see only suggestions for their own operator — no data from other operators is visible or accessible.

---

### User Story 7 - Notification Delivery (Priority: P3)

When a scheduling action is approved (new booking, reschedule, or discovery flight), the affected student or prospect receives a notification via email and/or SMS. Notification templates are operator-editable and operator-branded. The system respects opt-in preferences — students who have not opted into SMS receive email only. All notifications are logged for audit purposes.

**Why this priority**: Notifications close the loop with students and prospects. Without them, approved schedule changes would require manual communication by staff, reducing the value of automation. It is P3 because the core scheduling logic can function without it (schedulers could manually contact students initially).

**Independent Test**: Can be tested by approving a scheduling suggestion and verifying the correct notification is sent to the student via their preferred channel, using the operator's branded template, with the notification logged.

**Acceptance Scenarios**:

1. **Given** a scheduler approves a booking suggestion, **When** the approval is processed, **Then** the affected student receives a notification via their opted-in channel(s) (email and/or SMS).
2. **Given** an operator has customized their email template, **When** a notification is sent, **Then** it uses the operator's branded template with the correct scheduling details populated.
3. **Given** a student has not opted into SMS, **When** a notification is triggered, **Then** the student receives an email only.
4. **Given** a notification is sent, **When** the delivery completes (or fails), **Then** the delivery status and content are recorded in the audit log.

---

### Edge Cases

- What happens when a schedule opening is detected but no eligible candidates exist on the waitlist? The system logs the opening as unfilled and notifies the scheduler.
- What happens when the FSP API is unavailable during a reservation creation attempt? The system retries with backoff, holds the suggestion in a pending state, and alerts the scheduler if the outage persists beyond a threshold.
- What happens when two schedulers attempt to approve conflicting suggestions simultaneously? The system validates the reservation against FSP before creating it; the second approval receives a conflict error and the suggestion is removed from the queue.
- What happens when a student's availability changes between suggestion generation and approval? The system re-validates constraints at approval time and warns the scheduler if the suggestion is no longer valid.
- What happens when daylight constraints eliminate all available slots? The system reports no options available with a clear explanation referencing civil twilight times for the location.
- What happens when an operator modifies priority weights while suggestions are pending? Existing suggestions are not retroactively re-ranked; new suggestions use updated weights. The scheduler sees a notice that policy has changed.
- What happens when a cancellation triggers both a waitlist fill and a reschedule for the canceled student? Both workflows run independently — the canceled student receives reschedule options while the opening is simultaneously offered to waitlist candidates. The system prevents double-booking the same slot.
- What happens when a suggestion expires (TTL exceeded or slot filled)? The suggestion is marked as expired in the audit log with the expiration reason, removed from the active queue, and if the slot is still open, the next detection cycle may regenerate a fresh suggestion.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect schedule openings (cancellations, gaps, shifts) within minutes of occurrence via periodic schedule state evaluation.
- **FR-002**: System MUST rank waitlist candidates using a configurable priority weight model supporting at minimum: time since last flight, time until next scheduled flight, total flight hours, and operator-defined custom weights.
- **FR-003**: System MUST filter candidates by availability, required activity type, aircraft/instructor compatibility, and daylight constraints before proposing bookings.
- **FR-004**: System MUST generate the top 5 (default, operator-configurable in range 3-10) compatible alternative time slots when a reservation is canceled, respecting same activity type, same location, using progressive search window expansion (default 7 days initial, expanding in 7-day increments until N alternatives found or 28-day hard cap reached; initial window, increment, and hard cap are operator-configurable).
- **FR-005**: System MUST generate discovery flight options respecting daylight-only constraints, eligible instructor/aircraft pairings, and operator-defined search window.
- **FR-006**: System MUST determine a student's next required training event from their enrollment and course progression when a lesson is completed.
- **FR-007**: System MUST provide a scheduler-facing approval console with a work queue of pending suggestions, supporting approve/decline (individual and bulk), filtering by type/location/date/priority, and an activity feed.
- **FR-008**: System MUST include an explainability rationale with every suggestion, describing the inputs considered, constraints evaluated, and policies matched.
- **FR-009**: System MUST maintain an immutable audit log of all suggestions, approvals, declines, reservation creations, and notification deliveries.
- **FR-010**: System MUST support multi-tenancy with strict data isolation per operator (identified by FSP operator ID).
- **FR-011**: System MUST allow operators to configure scheduling policies including priority weights, search windows, and communication preferences.
- **FR-012**: System MUST send notifications (email and/or SMS) to students and prospects upon approved scheduling actions, using operator-editable, operator-branded templates.
- **FR-013**: System MUST respect student notification opt-in preferences — no SMS to students who have not opted in.
- **FR-014**: System MUST validate all reservations against FSP constraints (using validate-then-create pattern) before finalizing bookings.
- **FR-015**: System MUST authenticate operators using the FSP authentication library for shared login.
- **FR-016**: System MUST sync resource data (aircraft, instructors, locations, students, schedule) from FSP as the authoritative source of truth via periodic polling (every 2-5 minutes) using a background job.
- **FR-017**: System MUST store its own derived artifacts: suggestions, audit logs, policy configurations, communication records, and any discovery flight attributes not available in FSP.
- **FR-018**: System MUST prevent double-booking when concurrent workflows target the same time slot by validating against FSP at approval time.
- **FR-019**: System MUST support grouped proposals (multiple students for multiple openings) to reduce scheduler approval volume.
- **FR-020**: System MUST re-validate suggestion constraints at approval time and warn the scheduler if conditions have changed since the suggestion was generated.
- **FR-021**: System MUST auto-expire suggestions after an operator-configurable TTL (default 24 hours) and immediately expire suggestions when the underlying slot is detected as filled during a regular detection cycle.
- **FR-022**: System MUST include suggestion TTL as part of the operator-configurable scheduling policy (FR-011).

### Key Entities

- **Operator (Tenant)**: A flight school or training organization. Identified by FSP operator ID. Has locations, scheduling policies, communication templates, and priority weight configurations. Represents the tenancy boundary.
- **Scheduler**: A staff member at an operator who reviews and approves/declines scheduling suggestions. Authenticated via FSP. Primary user of the approval console.
- **Student**: A person enrolled in flight training at an operator. Has availability windows, enrollment(s) in course(s), flight history, and notification preferences. Sourced from FSP.
- **Prospect**: A potential student requesting a discovery flight. May not exist in FSP yet. Contact information and flight preferences stored by this system.
- **Instructor**: A flight instructor at an operator. Has availability windows, qualifications, and assigned students. Sourced from FSP.
- **Aircraft**: A training aircraft at an operator. Has scheduling group membership, maintenance status, and availability. Sourced from FSP.
- **Location**: A training location (airport/facility) for an operator. Has operating hours, time zone, and civil twilight data. Sourced from FSP.
- **Suggestion**: A system-generated scheduling recommendation. Contains the proposed booking details, ranking score, explainability rationale, status (pending/approved/declined/expired), expiration time (based on operator-configurable TTL, default 24 hours), and audit trail. Stored by this system.
- **Scheduling Policy**: Operator-configured rules governing how suggestions are generated. Includes priority weights, search windows, and constraints. Stored by this system.
- **Notification Record**: A log of each notification sent, including channel (email/SMS), template used, content, delivery status, and timestamp. Stored by this system.
- **Audit Event**: An immutable record of any system action — suggestion generation, approval, decline, reservation creation, notification delivery, policy change. Stored by this system.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Schedule openings are detected and suggestions generated within 5 minutes of a cancellation or gap emerging.
- **SC-002**: 80% of approved scheduling suggestions require no manual edits by the scheduler beyond clicking "approve" — the suggestion is ready to book as-is.
- **SC-003**: Operators see a measurable increase in weekly flight hours (target: 10% increase within 90 days of adoption) through faster slot refill.
- **SC-004**: Scheduler time spent on manual rescheduling and waitlist management is reduced by 50% within 60 days of adoption.
- **SC-005**: 95% of reservation creations resulting from approved suggestions succeed on first attempt (no FSP validation errors).
- **SC-006**: Students receive notifications within 2 minutes of a scheduling action being approved.
- **SC-007**: System supports onboarding of at least 50 operators concurrently with no cross-tenant data leakage.
- **SC-008**: Every scheduling suggestion includes a human-readable rationale that the scheduler rates as "helpful" at least 70% of the time.
- **SC-009**: Discovery flight booking requests receive available options within 30 seconds of submission.
- **SC-010**: The system correctly identifies and proposes the next required training lesson for 95% of students with active enrollments.

## Assumptions

- FSP APIs are available and performant per the documented endpoints in the API Appendix. The system design accounts for transient FSP API unavailability with retry logic.
- FSP remains the authoritative source of truth for reservations, resources, and student data. This system does not create a parallel scheduling database — it reads from and writes to FSP.
- Email delivery leverages FSP's existing email notification capability (triggered via `sendEmailNotification` on reservation creation). SMS requires an external provider to be integrated.
- The MVP operates in suggest-and-approve mode only — no autonomous booking without human confirmation.
- Operators will configure their scheduling policies (priority weights, search windows) during onboarding. Reasonable defaults are provided for operators who skip configuration.
- Student availability data in FSP is kept reasonably up-to-date by students and operators.
- The system will be deployed on Azure, consistent with FSP's existing infrastructure.
- US data residency and SOC 2 Type 2 compliance are required from day one.
