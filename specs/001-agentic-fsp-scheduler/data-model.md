# Data Model: Agentic Scheduler for Flight Schedule Pro

**Date**: 2026-03-18
**ORM**: Drizzle ORM + PostgreSQL
**Multi-tenancy**: Row-Level Security on `operator_id`

---

## Tenancy Rule

Every table (except `operators`) has an `operator_id` column. PostgreSQL RLS policy:
```sql
CREATE POLICY tenant_isolation ON <table>
  USING (operator_id = current_setting('app.current_tenant')::integer);
```

All queries are automatically filtered. No application-level `WHERE operator_id = ?` needed.

---

## Entities

### operators

The tenant entity. Sourced from FSP during onboarding.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK | FSP operatorId |
| name | varchar(255) | NOT NULL | Operator/school name |
| fsp_token | text | ENCRYPTED | FSP auth token (encrypted at rest) |
| fsp_token_expires_at | timestamptz | | Token expiration |
| status | varchar(20) | NOT NULL, DEFAULT 'active' | active, suspended, offboarding |
| onboarded_at | timestamptz | NOT NULL, DEFAULT now() | |
| last_sync_at | timestamptz | | Last successful FSP sync |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### scheduling_policies

Per-operator configuration. One row per operator.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| operator_id | integer | FK operators, NOT NULL, UNIQUE | One policy per operator |
| waitlist_weights | jsonb | NOT NULL, DEFAULT '{}' | Priority weight config: { "timeSinceLastFlight": 0.3, "timeUntilNextFlight": 0.2, "totalHours": 0.2, "custom": {} } |
| reschedule_alternatives_count | integer | NOT NULL, DEFAULT 5 | Range 3-10 |
| search_window_initial_days | integer | NOT NULL, DEFAULT 7 | Progressive expansion start |
| search_window_increment_days | integer | NOT NULL, DEFAULT 7 | Expansion increment |
| search_window_max_days | integer | NOT NULL, DEFAULT 28 | Hard cap |
| suggestion_ttl_hours | integer | NOT NULL, DEFAULT 24 | TTL before auto-expire |
| polling_interval_minutes | integer | NOT NULL, DEFAULT 5 | FSP sync frequency (2-5 range) |
| notification_preferences | jsonb | NOT NULL, DEFAULT '{}' | { "email": true, "sms": false, "smsProvider": null } |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### suggestions

The core entity. System-generated scheduling recommendations.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| operator_id | integer | FK operators, NOT NULL | Tenant key |
| type | varchar(30) | NOT NULL | waitlist, reschedule, discovery, next_lesson |
| status | varchar(20) | NOT NULL, DEFAULT 'pending' | pending, approved, declined, expired, processing |
| location_id | varchar(50) | NOT NULL | FSP location ID |
| student_id | varchar(50) | | FSP student ID (null for discovery flights) |
| prospect_id | uuid | FK prospects | Only for discovery flights |
| instructor_id | varchar(50) | | Proposed FSP instructor ID |
| aircraft_id | varchar(50) | | Proposed FSP aircraft ID |
| proposed_start | timestamptz | NOT NULL | Proposed slot start (UTC) |
| proposed_end | timestamptz | NOT NULL | Proposed slot end (UTC) |
| activity_type_id | varchar(50) | | FSP activity type |
| course_id | varchar(50) | | For next_lesson type |
| lesson_id | varchar(50) | | For next_lesson type |
| enrollment_id | varchar(50) | | For next_lesson type |
| ranking_score | decimal(10,4) | | Waitlist ranking score |
| rationale | jsonb | NOT NULL | Explainability: { "inputs": [], "constraints": [], "policies": [], "summary": "" } |
| group_id | uuid | | Groups related suggestions for bulk approval |
| expires_at | timestamptz | NOT NULL | TTL-based expiration timestamp |
| approved_by | varchar(50) | | FSP user ID of approver |
| approved_at | timestamptz | | |
| declined_by | varchar(50) | | |
| declined_at | timestamptz | | |
| expired_reason | varchar(50) | | ttl_exceeded, slot_filled |
| fsp_reservation_id | varchar(50) | | Created FSP reservation ID (on approval) |
| fsp_validation_errors | jsonb | | Any FSP validation errors |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**State transitions**:
```
pending → approved (scheduler approves)
pending → declined (scheduler declines)
pending → expired  (TTL exceeded or slot filled)
pending → processing (approval in progress, optimistic lock)
processing → approved (FSP reservation created successfully)
processing → pending (FSP validation failed, returned to queue with warning)
```

**Indexes**:
- `(operator_id, status, type)` — queue filtering
- `(operator_id, expires_at)` WHERE status = 'pending' — TTL expiration job
- `(operator_id, location_id, proposed_start)` — slot conflict detection
- `(group_id)` WHERE group_id IS NOT NULL — bulk approval

---

### prospects

Discovery flight prospects (not yet in FSP).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| operator_id | integer | FK operators, NOT NULL | |
| first_name | varchar(100) | NOT NULL | |
| last_name | varchar(100) | NOT NULL | |
| email | varchar(255) | | |
| phone | varchar(20) | | |
| preferred_dates | jsonb | | { "dates": ["2026-03-20", "2026-03-21"], "timeOfDay": "morning" } |
| notes | text | | Scheduler notes |
| fsp_reservation_id | varchar(50) | | Linked FSP reservation once booked |
| status | varchar(20) | NOT NULL, DEFAULT 'pending' | pending, booked, cancelled |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### audit_events

Immutable log. No UPDATE or DELETE allowed (enforced by RLS policy).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| operator_id | integer | NOT NULL | Tenant key (no FK — audit outlives data) |
| event_type | varchar(50) | NOT NULL | suggestion_created, suggestion_approved, suggestion_declined, suggestion_expired, reservation_created, reservation_failed, notification_sent, notification_failed, policy_changed, sync_completed, sync_failed |
| entity_type | varchar(30) | | suggestion, prospect, policy, notification |
| entity_id | uuid | | Reference to the affected entity |
| actor_id | varchar(50) | | FSP user ID who performed the action (null for system actions) |
| data | jsonb | NOT NULL | Event-specific payload |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Immutable timestamp |

**RLS policy**: `SELECT` only (no INSERT from application — trigger-based), `NO UPDATE`, `NO DELETE`.
**Retention**: 1 year minimum, per PRD requirement.
**Indexes**: `(operator_id, created_at DESC)`, `(operator_id, event_type, created_at DESC)`

---

### notification_records

Log of all notifications sent.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| operator_id | integer | FK operators, NOT NULL | |
| suggestion_id | uuid | FK suggestions | |
| recipient_type | varchar(20) | NOT NULL | student, prospect |
| recipient_id | varchar(50) | NOT NULL | FSP user ID or prospect ID |
| channel | varchar(10) | NOT NULL | email, sms |
| template_id | varchar(50) | | Operator's template identifier |
| content | jsonb | NOT NULL | Rendered notification content |
| delivery_status | varchar(20) | NOT NULL, DEFAULT 'pending' | pending, sent, delivered, failed |
| delivery_error | text | | Error details if failed |
| sent_at | timestamptz | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### notification_templates

Operator-editable, operator-branded templates.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| operator_id | integer | FK operators, NOT NULL | |
| type | varchar(30) | NOT NULL | waitlist_offer, reschedule_offer, discovery_confirmation, next_lesson_offer |
| channel | varchar(10) | NOT NULL | email, sms |
| subject | varchar(255) | | Email subject line (null for SMS) |
| body_template | text | NOT NULL | Template with placeholders: {{studentName}}, {{proposedTime}}, {{instructorName}}, etc. |
| is_active | boolean | NOT NULL, DEFAULT true | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Unique**: `(operator_id, type, channel)`

---

### sync_state

Tracks FSP sync progress per operator.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| operator_id | integer | FK operators, NOT NULL, UNIQUE | |
| last_schedule_hash | varchar(64) | | Hash of last fetched schedule (for change detection) |
| last_schedule_sync_at | timestamptz | | |
| last_resource_sync_at | timestamptz | | Aircraft, instructors, locations |
| last_student_sync_at | timestamptz | | |
| sync_errors | jsonb | DEFAULT '[]' | Recent sync errors for monitoring |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

---

## FSP-Sourced Data (NOT stored — queried live)

These entities live in FSP and are accessed via API. We do NOT replicate them:

- **Reservations** — queried via `POST /api/v2/schedule` and `POST /api/V1/operator/{operatorId}/operatorReservations/list`
- **Aircraft** — queried via `GET /core/v1.0/operators/{operatorId}/aircraft`
- **Instructors** — queried via `GET /core/v1.0/operators/{operatorId}/instructors`
- **Students** — queried via `GET /traininghub/v1.0/operators/{operatorId}/students`
- **Locations** — queried via `GET /common/v1.0/operators/{operatorId}/locations`
- **Availability** — queried via `POST /schedulinghub/v1.0/operators/{operatorId}/users/availabilityAndOverrides`
- **Enrollments** — queried via `GET /traininghub/v1.0/operators/{operatorId}/enrollments/list/{studentId}`
- **Schedulable Events** — queried via `POST /traininghub/v1.0/operators/{operatorId}/schedulableEvents`
- **Civil Twilight** — queried via `GET /common/v1.0/operators/{operatorId}/locations/{locationId}/civilTwilight`

**Exception**: We may cache frequently-accessed resource data (aircraft list, instructor list, location list) in Redis with short TTL (5-10 minutes) to reduce FSP API load during suggestion generation.

---

## Relationships

```
operators 1──* scheduling_policies (1:1 enforced by UNIQUE)
operators 1──* suggestions
operators 1──* prospects
operators 1──* audit_events
operators 1──* notification_records
operators 1──* notification_templates
operators 1──1 sync_state

suggestions *──1 prospects (optional, for discovery type)
suggestions 1──* notification_records
suggestions 1──* audit_events (via entity_id)
```
