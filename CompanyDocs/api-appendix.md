# FSP API Appendix

API reference for Flight Schedule Pro services relevant to the Agentic Scheduler.

All endpoints require authentication via FSP token (Bearer header) and are scoped to an operator via `operatorId` unless otherwise noted.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Operators & Users](#2-operators--users)
3. [Locations](#3-locations)
4. [Aircraft](#4-aircraft)
5. [Instructors](#5-instructors)
6. [Activity Types](#6-activity-types)
7. [Scheduling Groups](#7-scheduling-groups)
8. [Student & Instructor Availability](#8-student--instructor-availability)
9. [Schedule Data](#9-schedule-data)
10. [Schedulable Events (Training Queue)](#10-schedulable-events-training-queue)
11. [AutoSchedule Solver](#11-autoschedule-solver)
12. [Find-a-Time](#12-find-a-time)
13. [Reservations — Individual](#13-reservations--individual)
14. [Reservations — Batch](#14-reservations--batch)
15. [Enrollment & Training Progress](#15-enrollment--training-progress)
16. [Students](#16-students)
17. [Weather](#17-weather)
18. [Civil Twilight](#18-civil-twilight)
19. [Flight Alerts](#19-flight-alerts)
---

## 1. Authentication

### Authenticate User
```
POST /common/v1.0/sessions/credentials
```
**Body:** `{ email, password }`
**Returns:** `{ token, user: { email, ... } }`

### Verify MFA
```
POST /common/v1.0/sessions/mfa
```
**Body:** `{ mfaToken, mfaCode, mfaMethod, rememberMe }`
- `mfaMethod`: 1 = Authenticator App, 2 = Email, 100 = Backup Codes

**Returns:** `{ token, ... }`

### Resend MFA Email Code
```
POST /common/v1.0/mfa/ResendEmailCodeViaMfaAuthToken
```
**Body:** `{ mfaToken }`

### Refresh Session
```
POST /common/v1.0/sessions/refresh
```

### Logout
```
DELETE /api/V1/sessions
```

---

## 2. Operators & Users

### List User's Operators
```
GET /api/V1/myoperators
```
**Returns:** Array of operator objects with `id`, `name`, `isActive`, `isPending`

### Get Operator Details
```
GET /api/V1/myoperators/{operatorId}
```
**Returns:** Operator details including `userId`, `firstName`, `lastName`, `email`

### List Operator Users
```
GET /core/v1.0/operators/{operatorId}/users?limit=1000
```
**Returns:** Array of user objects:
```json
{
  "id": "guid",
  "firstName": "string",
  "lastName": "string",
  "fullName": "string",
  "email": "string",
  "role": "string",
  "isActive": true,
  "imageUrl": "string"
}
```

### Get User Details
```
GET /core/v1.0/operators/{operatorId}/users/{userId}
```

### Get User Permissions
```
GET /core/v1.0/operators/{operatorId}/users/{userId}/permissions
```
**Returns:** Array of permission strings (e.g., `["canManageSchedule", "canViewReports"]`)

---

## 3. Locations

### List Locations
```
GET /common/v1.0/operators/{operatorId}/locations
```
**Returns:** Array of location objects:
```json
{
  "id": "string",
  "name": "string",
  "code": "string (ICAO)",
  "timeZone": "string",
  "isActive": true
}
```

### Get Location Details
```
GET /common/v1.0/operators/{operatorId}/locations/location/{locationId}
```

---

## 4. Aircraft

### List Aircraft
```
GET /core/v1.0/operators/{operatorId}/aircraft
```
**Returns:** Array of aircraft objects:
```json
{
  "id": "string",
  "registration": "string (tail number)",
  "make": "string",
  "model": "string",
  "makeModel": "string",
  "isActive": true,
  "isSimulator": false
}
```

### Get Aircraft Times/Hours
```
GET /core/v1.0/operators/{operatorId}/aircraft/{aircraftId}/times
```

### Get Aircraft Squawks
```
GET /core/v1.0/operators/{operatorId}/aircraft/{aircraftId}/squawks
```

### Get Maintenance Reminders
```
GET /core/v1.0/operators/{operatorId}/aircraft/{aircraftId}/maintenanceReminders
```

---

## 5. Instructors

### List Instructors
```
GET /core/v1.0/operators/{operatorId}/instructors
```
**Returns:** Array of instructor objects:
```json
{
  "id": "string (guid)",
  "firstName": "string",
  "lastName": "string",
  "fullName": "string",
  "instructorType": "string",
  "isActive": true
}
```

Also available via legacy endpoint:
```
GET /api/V2/operator/{operatorId}/instructors/list?status=1
```

---

## 6. Activity Types

### List Activity Types
```
GET /api/v1/operator/{operatorId}/activitytypes
```
**Returns:** Array of activity type objects:
```json
{
  "id": "string",
  "name": "string",
  "displayType": 0,
  "isActive": true
}
```
`displayType`: 0 = Rental/Instruction, 1 = Maintenance, 2 = Class, 3 = Meeting

---

## 7. Scheduling Groups

### List Scheduling Groups
```
GET /common/v1.0/operators/{operatorId}/schedulinggroups
```
Returns scheduling group definitions that map sets of aircraft to training activities.

---

## 8. Student & Instructor Availability

### Get Availability for Single User
```
GET /schedulinghub/v1.0/operators/{operatorId}/users/{userGuidId}/availability
```

### Update Availability for Single User
```
PUT /schedulinghub/v1.0/operators/{operatorId}/users/{userGuidId}/availability
```

### Get Availability for Multiple Users (batch)
```
POST /schedulinghub/v1.0/operators/{operatorId}/users/availability
```

### Get Availability with Overrides (batch)
```
POST /schedulinghub/v1.0/operators/{operatorId}/users/availabilityAndOverrides
```
**Body:**
```json
{
  "userGuidIds": ["guid1", "guid2"],
  "startAtUtc": "2025-10-11T00:00",
  "endAtUtc": "2025-10-18T00:00:00.000"
}
```
**Returns:** Array of availability objects:
```json
{
  "userGuidId": "guid",
  "availabilities": [
    {
      "dayOfWeek": 1,
      "startAtTimeUtc": "14:00",
      "endAtTimeUtc": "22:00"
    }
  ],
  "availabilityOverrides": [
    {
      "date": "2025-10-15",
      "startTime": "2025-10-15T14:00:00Z",
      "endTime": "2025-10-15T18:00:00Z",
      "isUnavailable": true
    }
  ]
}
```
`dayOfWeek`: 0 = Sunday, 6 = Saturday

### Check Reservation Availability
```
POST /schedulinghub/v1.0/operators/{operatorId}/availability/reservationAvailability
```
Checks whether a specific reservation configuration is available (aircraft, instructor, time slot).

### Get Availability Overrides (Time Off)
```
GET /schedulinghub/v1.0/operators/{operatorId}/users/{userGuidId}/availabilityOverride
```

### Add Availability Override
```
POST /schedulinghub/v1.0/operators/{operatorId}/users/{userGuidId}/availabilityOverride
```

### Update Override
```
PUT /schedulinghub/v1.0/operators/{operatorId}/users/{userGuidId}/availabilityOverride
```

### Delete Override
```
DELETE /schedulinghub/v1.0/operators/{operatorId}/users/{userGuidId}/availabilityOverride/{overrideId}
```

---

## 9. Schedule Data

### Get Schedule
```
POST /api/v2/schedule
```
**Body:**
```json
{
  "start": "2025-10-11",
  "end": "2025-10-18",
  "locationIds": [123],
  "aircraftIds": [],
  "instructorIds": [],
  "outputFormat": "bryntum",
  "pageSize": 500
}
```
**Returns:**
```json
{
  "results": {
    "events": [
      {
        "Start": "2025-10-11T14:00:00Z",
        "End": "2025-10-11T16:00:00Z",
        "Title": "string",
        "CustomerName": "string",
        "InstructorName": "string",
        "AircraftName": "string"
      }
    ],
    "resources": [],
    "unavailability": [
      {
        "ResourceId": "string",
        "StartDate": "string",
        "EndDate": "string",
        "Name": "string"
      }
    ]
  }
}
```

### Get Schedule Display Hours
```
GET /v2/operator/{operatorId}/operators/scheduleDisplayHours
```

### Get Schedule Filters
```
GET /scheduling/v1.0/operators/{operatorId}/scheduleFilters
```

### Get Cancellation Reasons
```
GET /scheduling/v1.0/operators/{operatorId}/cancellationReasons
```

---

## 10. Schedulable Events (Training Queue)

### Get Schedulable Events
```
POST /traininghub/v1.0/operators/{operatorId}/schedulableEvents
```
Returns the queue of pending training events that need to be scheduled for students at a location.

**Body:**
```json
{
  "startDate": "2025-10-11T00:00",
  "endDate": "2025-10-18T00:00",
  "locationId": 123,
  "listType": 1,
  "filters": [],
  "priorities": [],
  "useAllInstructors": false
}
```
**Returns:** Array of schedulable event objects:
```json
{
  "eventId": "string",
  "enrollmentId": "string",
  "studentId": "guid",
  "studentFirstName": "string",
  "studentLastName": "string",
  "courseId": "string",
  "courseName": "string",
  "lessonId": "string",
  "lessonName": "string",
  "lessonOrder": 1,
  "flightType": 0,
  "routeType": 0,
  "timeOfDay": 0,
  "durationTotal": 60,
  "aircraftDurationTotal": 60,
  "instructorDurationPre": 15,
  "instructorDurationPost": 15,
  "instructorDurationTotal": 90,
  "instructorRequired": true,
  "instructorIds": ["guid"],
  "aircraftIds": ["guid"],
  "schedulingGroupIds": ["guid"],
  "meetingRoomIds": [],
  "isStageCheck": false,
  "reservationTypeId": "guid",
  "activityTypeId": "guid"
}
```

**Enum values:**
- `flightType`: 0 = Dual, 1 = Solo
- `routeType`: 0 = Local, 1 = Cross Country
- `timeOfDay`: 0 = Anytime, 1 = Day, 2 = Night

---

## 11. AutoSchedule Solver

A constraint-satisfaction engine that optimizes the placement of multiple training events across a date range, respecting resource availability, operating hours, daylight constraints, and scheduling policies.

### Get AutoSchedule Settings
```
GET /schedulinghub/v1.0/operators/{operatorId}/settings/autoSchedule
```
**Returns:** Operator-specific scheduling configuration:
```json
{
  "minutesBetweenEvents": 0,
  "percentageUtilized": 100,
  "reservationStaggerGroups": 2,
  "schedulingWindowStart": "04:00",
  "schedulingWindowEnd": "21:00",
  "staggerOffsetTime": 30,
  "useAllInstructors": false
}
```

### Update AutoSchedule Settings
```
PUT /schedulinghub/v1.0/operators/{operatorId}/settings/autoSchedule
```

### Execute AutoSchedule
```
POST /schedulinghub/v1.0/operators/{operatorId}/autoSchedule
```

**Payload structure:**

```json
{
  "config": {
    "aircraftTargetUtilizationPercent": 100,
    "constraintsByDay": [
      {
        "forDate": "2025-10-11T00:00:00.000Z",
        "timeZoneOffset": -300,
        "civilTwilightDay": {
          "startDate": "2025-10-11T11:58:22.22Z",
          "endDate": "2025-10-12T00:12:35.35Z"
        },
        "operatingHours": {
          "startDate": "2025-10-11T05:00:00.000Z",
          "endDate": "2025-10-12T05:00:00.000Z"
        }
      }
    ],
    "intervalLengthInMinutes": 15,
    "requestRange": {
      "startDate": "2025-10-11T00:00:00.000Z",
      "endDate": "2025-10-18T00:00:00.000Z"
    },
    "reservationGapInMinutes": 0,
    "reservationStaggerGroups": 2,
    "schedulingWindowStart": "04:00",
    "schedulingWindowEnd": "21:00",
    "staggerDurationInMinutes": 30
  },
  "aircraft": [
    {
      "order": 0,
      "aircraftId": "guid",
      "scheduling": {
        "timeBeforeMaintenance": 0,
        "preFlightTime": 0,
        "postFlightTime": 0
      }
    }
  ],
  "customers": [
    {
      "order": 0,
      "userId": "guid",
      "resourceId": "guid",
      "scheduling": {
        "maximumConcurrentFlightTime": 480
      }
    }
  ],
  "events": [
    {
      "activityTypeLayout": 0,
      "aircraftDuration": 60,
      "aircraftIds": [],
      "courseId": "string",
      "customer1Guid": "guid",
      "customer2Guid": "",
      "eventId": "string",
      "flightTimeEstimate": 60,
      "flightType": "Dual",
      "instructorDurationFlight": 60,
      "instructorDurationPost": 15,
      "instructorDurationPre": 15,
      "instructorDurationTotal": 90,
      "instructorIds": ["guid"],
      "instructorRequired": true,
      "isCheck": false,
      "lessonId": "string",
      "lessonNumber": 1,
      "lessonType": "Flight",
      "locationId": 123,
      "meetingRoomIds": [],
      "order": 0,
      "routeType": "Local",
      "schedulingGroupIds": ["guid"],
      "studentId": "guid",
      "time": "Anytime",
      "totalLength": 90
    }
  ],
  "instructors": [
    {
      "order": 0,
      "userId": "guid",
      "resourceId": "guid",
      "instructorId": "guid",
      "name": "string",
      "scheduling": {
        "maximumConcurrentFlightTime": 480
      }
    }
  ],
  "meetingRooms": [],
  "resourceAvailability": [
    {
      "resourceId": "guid:dayOfWeek",
      "resourceType": "user",
      "dayOfWeek": 1,
      "startTime": "14:00",
      "endTime": "22:00"
    },
    {
      "resourceId": "guid",
      "resourceType": "unavailable",
      "startDate": "2025-10-15T00:00:00Z",
      "endDate": "2025-10-15T23:59:59Z",
      "name": "Maintenance"
    }
  ],
  "schedulingGroupAircraft": [
    {
      "schedulingGroupId": "guid",
      "aircraftIds": ["guid1", "guid2"],
      "reserveAircraft": 1,
      "slots": 2
    }
  ]
}
```

**Key notes:**
- `timeZoneOffset` is in minutes from UTC (e.g., -300 = EST/UTC-5).
- `civilTwilightDay` defines daylight boundaries for Day/Night flight type constraints. Use the Civil Twilight API (Section 18) to calculate these per location and date.
- Events use string enum values: `flightType` ("Dual"/"Solo"), `routeType` ("Local"/"Cross Country"), `time` ("Anytime"/"Day"/"Night").
- `schedulingGroupIds` on events map to `schedulingGroupAircraft` entries. The solver selects specific aircraft from eligible groups.
- `resourceAvailability` combines recurring weekly availability (keyed by `guid:dayOfWeek`) with one-time unavailability blocks.

**Returns:**
```json
{
  "events": [
    {
      "eventId": "string",
      "customerId": "guid",
      "instructorId": "guid",
      "aircraftId": "string",
      "success": true,
      "startTime": "2025-10-11T14:00:00Z",
      "endTime": "2025-10-11T16:00:00Z",
      "error": null
    }
  ]
}
```

**Notes on results:**
- `aircraftId` may be returned in composite format `"schedulingGroupId:slotNumber"` when scheduling groups are used. Resolve to actual aircraft IDs using the `schedulingGroupAircraft` mapping from the request payload.
- Times are returned in UTC. Convert to local time using `timeZoneOffset` from the config when creating reservations.
- The API may return duplicate events — deduplicate by `eventId`.

### Submit AutoSchedule Feedback
```
POST /schedulinghub/v1.0/operators/{operatorId}/autoSchedule/feedback
```

---

## 12. Find-a-Time

A slot-finding service that returns available time windows for a specific activity configuration.

### Get Find-a-Time Preferences
```
GET /schedulinghub/v1.0/operators/{operatorId}/scheduleMatch/preferences
```

### Update Find-a-Time Preferences
```
POST /schedulinghub/v1.0/operators/{operatorId}/scheduleMatch/preferences
```

### Delete Find-a-Time Preferences
```
DELETE /schedulinghub/v1.0/operators/{operatorId}/scheduleMatch/preferences
```

### Get Available Time Slots
```
POST /schedulinghub/v1.0/operators/{operatorId}/scheduleMatch/availability
```
**Accepts:** Activity type, instructors, aircraft, scheduling groups, customer, date range, equipment, instructor pre/post time, student availability flag.

---

## 13. Reservations — Individual

### Create / Validate Reservation
```
POST /api/V2/Reservation
```

Supports a two-step pattern:
1. **Validate** — Set `validateOnly: true` in the request body. Returns any constraint violations without creating the reservation.
2. **Create** — Set `validateOnly: false` (or omit). Creates the reservation if valid.

**Body:**
```json
{
  "aircraftId": "guid",
  "application": 2,
  "client": "V4",
  "comments": "",
  "end": "2025-10-11T16:00",
  "equipmentIds": [],
  "estimatedFlightHours": "1.00",
  "flightRoute": "",
  "flightRules": 1,
  "flightType": 0,
  "instructorId": "guid",
  "instructorPostFlightMinutes": 15,
  "instructorPreFlightMinutes": 15,
  "internalComments": "",
  "locationId": 123,
  "operatorId": 456,
  "overrideExceptions": false,
  "pilotId": "guid",
  "recurring": false,
  "reservationTypeId": "guid",
  "schedulingGroupId": null,
  "schedulingGroupSlotId": null,
  "sendEmailNotification": true,
  "start": "2025-10-11T14:00",
  "trainingSessions": [
    {
      "courseId": "string",
      "lessonId": "string",
      "enrollmentId": "string",
      "studentId": "guid"
    }
  ],
  "validateOnly": true
}
```

**Key notes:**
- `start` and `end` are in **local time** (no timezone suffix), not UTC.
- `flightType`: 0 = Dual, 1 = Solo
- `flightRules`: 1 = VFR, 2 = IFR
- `trainingSessions` links the reservation to a student's course/lesson enrollment.
- `sendEmailNotification` triggers FSP's built-in email notification to participants.

**Returns:**
```json
{
  "id": "guid (reservation ID, only on create)",
  "errors": [
    { "message": "string", "field": "string" }
  ]
}
```

### Get Reservation Details
```
GET /api/V2/Reservation/{reservationId}?operatorId={operatorId}
```

### Get Reservations for Person
```
GET /V2/Reservation?personId={userId}&operatorId={operatorId}
```

### Update Reservation
```
PUT /api/V2/Reservation
```
Includes student availability check.

### Delete Reservation
```
DELETE /scheduling/v1.0/operators/{operatorId}/reservations/{reservationId}
```

### List Reservations with Filters
```
POST /api/V1/operator/{operatorId}/operatorReservations/list
```
**Body:**
```json
{
  "dateRangeType": 3,
  "startRange": "2025-10-11T00:00:00Z",
  "endRange": "2025-10-18T00:00:00Z",
  "locationIds": [123],
  "pageSize": 50,
  "pageIndex": 0
}
```
`dateRangeType`: 1 = Future, 2 = Past, 3 = Custom

**Returns:**
```json
{
  "total": 100,
  "pageIndex": 0,
  "pageSize": 50,
  "results": [
    {
      "reservationId": "guid",
      "reservationNumber": 12345,
      "resource": "N12345 (tail number)",
      "start": "2025-10-11T14:00:00Z",
      "end": "2025-10-11T16:00:00Z",
      "pilotFirstName": "string",
      "pilotLastName": "string",
      "pilotId": "guid",
      "status": 1
    }
  ]
}
```

### Check Available Times
```
GET /scheduling/v1.0/operators/{operatorId}/reservations/availableTimes
```

### Check Availability
```
GET /scheduling/v1.0/operators/{operatorId}/reservations/checkavailability
```

### Get Aircraft Options for Reservation
```
GET /scheduling/v1.0/operators/{operatorId}/reservations/{reservationId}/aircraftOptions
```

---

## 14. Reservations — Batch

### Publish Batch Reservations
```
POST /schedulinghub/v1.0/operators/{operatorId}/batchReservations
```
Submits multiple reservations for bulk creation.

### Track Batch Progress
```
GET /schedulinghub/v1.0/operators/{operatorId}/batchReservations/status/{batchId}
```
Returns progress/status of a batch publish operation.

---

## 15. Enrollment & Training Progress

### Get Student Enrollments
```
GET /traininghub/v1.0/operators/{operatorId}/enrollments/list/{studentId}
```
**Query params:** `Status` (optional), `IncludeContentProviderCourses` (optional)

### Get Enrollment Details
```
GET /traininghub/v1.0/operators/{operatorId}/enrollments/{enrollmentId}
```

### Get Enrollment Progress
```
GET /traininghub/v1.0/operators/{operatorId}/enrollments/{enrollmentId}/progress
```

### Update Enrollment Progress
```
PUT /traininghub/v1.0/operators/{operatorId}/enrollments/{enrollmentId}/progress
```

### Notify on Enrollment Status Change
```
POST /traininghub/v1.0/operators/{operatorId}/enrollments/{enrollmentId}/status-changed
```

### Get Enrollment History
```
GET /traininghub/v1.0/operators/{operatorId}/programs/{programGuid}/enrollments/{userGuid}/history
```

### Get Training Sessions
```
GET /api/v1/trainingsessions?enrollmentId={id}&operatorId={id}&studentId={id}
```

### Get Student Progress Report
```
GET /api/v1/reports?enrollmentId={id}&operatorId={id}&reportType=studentprogress
```
Returns completion percentages and milestone data.

### Get Checkride Exam Scores
```
GET /traininghub/v1.0/operators/{operatorId}/checkrideExamScores
```

### Get Knowledge Tests
```
GET /traininghub/v1.0/operators/{operatorId}/knowledgetests
```

---

## 16. Students

### Search Students
```
POST /traininghub/v1.0/operators/{operatorId}/students/search
```

### List Students
```
GET /traininghub/v1.0/operators/{operatorId}/students
```

### Get Student Dropdown Items
```
GET /traininghub/v1.0/operators/{operatorId}/students/dropdownitems
```

### Get Training Alerts
```
GET /traininghub/v1.0/operators/{operatorId}/alerts
```

---

## 17. Weather

### Get METAR
```
GET /common/v1.0/weather/metar
```
Returns current METAR weather observation data. Useful for VFR/IFR determination and weather-based scheduling decisions.

### Get TAF
```
GET /common/v1.0/weather/taf
```
Returns Terminal Aerodrome Forecast data. Useful for forward-looking weather-based scheduling.

---

## 18. Civil Twilight

### Get Civil Twilight for Location
```
GET /common/v1.0/operators/{operatorId}/locations/{locationId}/civilTwilight
```
Returns civil twilight (sunrise/sunset) times for a location. Required for calculating daylight boundaries in scheduling constraints — particularly for the AutoSchedule solver's `civilTwilightDay` config and for enforcing Day/Night flight type requirements.

---

## 19. Flight Alerts

### List Flight Alerts
```
GET /schedulinghub/v1.0/operators/{operatorId}/flightAlerts
```

### Create Flight Alert
```
POST /schedulinghub/v1.0/operators/{operatorId}/flightAlerts/{reservationId}
```

### Update Flight Alert
```
PUT /schedulinghub/v1.0/operators/{operatorId}/flightAlerts/{reservationId}
```

### Complete Flight Alert
```
POST /schedulinghub/v1.0/operators/{operatorId}/flightAlerts/{reservationId}/complete
```

### Get Overdue Flight Alerts
```
GET /schedulinghub/v1.0/operators/{operatorId}/flightAlerts/overdue
```

### Get Flight Alerts by Aircraft
```
GET /schedulinghub/v1.0/operators/{operatorId}/flightAlerts/aircraft/{aircraftId}
```

### Get Flight Alerts by Type
```
GET /schedulinghub/v1.0/operators/{operatorId}/flightAlerts/type/{flightAlertType}
```

