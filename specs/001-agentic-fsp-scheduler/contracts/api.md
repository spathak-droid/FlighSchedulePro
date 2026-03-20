# API Contracts: Agentic Scheduler

**Base URL**: `/api/v1`
**Auth**: Bearer token (FSP-authenticated session)
**Tenant**: All endpoints scoped by `operatorId` extracted from session token

---

## Authentication

### POST /api/v1/auth/login
Authenticate via FSP credentials.

**Request**:
```json
{ "email": "string", "password": "string" }
```

**Response 200**:
```json
{
  "token": "string",
  "user": { "id": "string", "email": "string", "operatorId": 123, "permissions": ["string"] },
  "mfaRequired": false
}
```

### POST /api/v1/auth/mfa
Complete MFA verification.

**Request**:
```json
{ "mfaToken": "string", "mfaCode": "string", "mfaMethod": 1 }
```

### POST /api/v1/auth/refresh
Refresh session token.

### DELETE /api/v1/auth/logout
End session.

---

## Suggestions

### GET /api/v1/suggestions
List pending suggestions for the authenticated operator.

**Query params**:
- `status` — filter: pending, approved, declined, expired (default: pending)
- `type` — filter: waitlist, reschedule, discovery, next_lesson
- `locationId` — filter by FSP location ID
- `dateFrom`, `dateTo` — filter by proposed time range
- `page`, `pageSize` — pagination (default: page=1, pageSize=20)

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "waitlist",
      "status": "pending",
      "locationId": "string",
      "studentName": "string",
      "studentId": "string",
      "instructorName": "string",
      "aircraftRegistration": "string",
      "proposedStart": "2026-03-20T14:00:00Z",
      "proposedEnd": "2026-03-20T16:00:00Z",
      "activityType": "string",
      "rankingScore": 0.87,
      "rationale": {
        "summary": "string",
        "inputs": ["string"],
        "constraints": ["string"],
        "policies": ["string"]
      },
      "groupId": "uuid | null",
      "expiresAt": "2026-03-21T14:00:00Z",
      "createdAt": "2026-03-20T10:00:00Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 45 }
}
```

### POST /api/v1/suggestions/:id/approve
Approve a suggestion. Creates reservation in FSP.

**Response 200**:
```json
{
  "suggestion": { "id": "uuid", "status": "approved", "fspReservationId": "string" },
  "reservation": { "id": "string", "start": "string", "end": "string" }
}
```

**Response 409** (conflict — slot no longer available):
```json
{ "error": "SLOT_CONFLICT", "message": "The proposed time slot is no longer available.", "details": { "reason": "string" } }
```

**Response 422** (validation failed — constraints changed):
```json
{ "error": "VALIDATION_FAILED", "message": "Suggestion constraints have changed since generation.", "details": { "changes": ["string"] } }
```

### POST /api/v1/suggestions/:id/decline
Decline a suggestion.

**Request**:
```json
{ "reason": "string (optional)" }
```

### POST /api/v1/suggestions/bulk-approve
Approve multiple suggestions at once.

**Request**:
```json
{ "suggestionIds": ["uuid"] }
```

**Response 200**:
```json
{
  "results": [
    { "id": "uuid", "status": "approved", "fspReservationId": "string" },
    { "id": "uuid", "status": "failed", "error": "SLOT_CONFLICT" }
  ],
  "summary": { "approved": 3, "failed": 1 }
}
```

### POST /api/v1/suggestions/bulk-decline
Decline multiple suggestions.

**Request**:
```json
{ "suggestionIds": ["uuid"], "reason": "string (optional)" }
```

---

## Discovery Flights

### POST /api/v1/discovery-flights
Create a discovery flight request (scheduler enters on behalf of prospect).

**Request**:
```json
{
  "firstName": "string",
  "lastName": "string",
  "email": "string (optional)",
  "phone": "string (optional)",
  "preferredDates": ["2026-03-20"],
  "timeOfDay": "morning | afternoon | anytime",
  "notes": "string (optional)"
}
```

**Response 201**:
```json
{
  "prospect": { "id": "uuid", "firstName": "string", "lastName": "string" },
  "suggestions": [
    { "id": "uuid", "proposedStart": "string", "proposedEnd": "string", "instructorName": "string", "aircraftRegistration": "string" }
  ]
}
```

---

## Activity Feed

### GET /api/v1/activity
Recent actions for the authenticated operator.

**Query params**:
- `page`, `pageSize`
- `dateFrom`, `dateTo`

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "eventType": "suggestion_approved",
      "summary": "Waitlist booking approved for John Smith — Tue 2pm",
      "actor": "scheduler@school.com",
      "timestamp": "2026-03-20T14:30:00Z",
      "details": {}
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 100 }
}
```

---

## Scheduling Policies

### GET /api/v1/policies
Get the operator's scheduling policy configuration.

### PUT /api/v1/policies
Update the operator's scheduling policy.

**Request**:
```json
{
  "waitlistWeights": { "timeSinceLastFlight": 0.3, "timeUntilNextFlight": 0.2, "totalHours": 0.2, "custom": {} },
  "rescheduleAlternativesCount": 5,
  "searchWindowInitialDays": 7,
  "searchWindowIncrementDays": 7,
  "searchWindowMaxDays": 28,
  "suggestionTtlHours": 24,
  "pollingIntervalMinutes": 5,
  "notificationPreferences": { "email": true, "sms": false }
}
```

---

## Notification Templates

### GET /api/v1/templates
List operator's notification templates.

### PUT /api/v1/templates/:id
Update a notification template.

**Request**:
```json
{
  "subject": "Your flight has been scheduled",
  "bodyTemplate": "Hi {{studentName}}, you're booked for {{proposedTime}} with {{instructorName}}..."
}
```

---

## Operator Dashboard

### GET /api/v1/dashboard/stats
Key metrics for the operator.

**Response 200**:
```json
{
  "pendingSuggestions": 12,
  "approvedToday": 8,
  "declinedToday": 2,
  "expiredToday": 3,
  "avgTimeToApproval": "45 minutes",
  "acceptanceRate": 0.78,
  "weeklyFlightHoursDelta": "+4.2 hours"
}
```

---

## Error Response Shape (all endpoints)

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "details": {}
}
```

| Code | HTTP Status | When |
|------|-------------|------|
| UNAUTHORIZED | 401 | No/invalid auth token |
| FORBIDDEN | 403 | Wrong operator / insufficient permissions |
| NOT_FOUND | 404 | Resource doesn't exist |
| SLOT_CONFLICT | 409 | Time slot no longer available |
| VALIDATION_FAILED | 422 | Input validation or constraint check failed |
| FSP_UNAVAILABLE | 503 | FSP API is down, retry later |
