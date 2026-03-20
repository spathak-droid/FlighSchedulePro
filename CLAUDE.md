# FlighSchedulePro — Agentic Scheduler for Flight Schedule Pro

## What This Project Is

A multi-tenant scheduling automation system that integrates with Flight Schedule Pro (FSP) to detect schedule openings, generate booking suggestions, and enable flight school schedulers to approve them. MVP operates in suggest-and-approve mode — all changes require human confirmation.

## Project Structure

```
FlighSchedulePro/
├── .claude/
│   ├── skills/              ← Multi-agent factory system (9 personas + orchestrators)
│   ├── commands/             ← Speckit workflow commands
│   ├── journal/              ← Execution journal (failures, what-worked, phase logs)
│   └── learnings.json        ← Persistent learning store (decisions, patterns, conventions)
├── .specify/                 ← Speckit templates and scripts
├── CompanyDocs/
│   ├── agentic-scheduler-prd.md    ← Full PRD
│   └── api-appendix.md             ← FSP API reference (19 endpoint groups)
├── specs/
│   └── 001-agentic-fsp-scheduler/  ← Feature spec, checklists, evidence
├── env.example               ← FSP API configuration template
├── SKILL.md                  ← Presearch methodology
└── [application code]        ← Will live here after tech stack is locked
```

## Tech Stack

**Status: TBD** — to be locked in `/speckit.plan`
**Candidates:** TypeScript or C#
**Hosting:** Azure (consistent with FSP infrastructure)
**Database:** TBD

## FSP Integration

All FSP API calls require:
- **Auth:** Bearer token from `POST /common/v1.0/sessions/credentials`
- **Subscription key:** `x-subscription-key` header on every request
- **Base URLs** (from env.example):
  - `FSP_API_BASE_URL` — Auth/gateway endpoints
  - `FSP_CORE_BASE_URL` — Core API endpoints
  - `FSP_CURRICULUM_BASE_URL` — Training/curriculum endpoints

**Critical patterns:**
- Reservation times are **local time** (no timezone suffix) — never send UTC with Z suffix
- Use **validate-then-create** pattern: `POST /V2/Reservation` with `validateOnly: true` first
- FSP has undocumented rate limits (~100 req/min per operator) — all calls must go through rate-limited client
- AutoSchedule solver returns composite aircraft IDs — must resolve via schedulingGroupAircraft mapping
- Polling interval: 2-5 minutes for schedule change detection

## Multi-Tenancy

- Tenant = FSP operator (identified by `operatorId`)
- Strict data isolation — no cross-tenant data access
- Per-tenant configuration: priority weights, search windows, TTL, notification templates

## Key Decisions (from speckit.clarify)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Suggestion expiration | Configurable TTL (default 24h) + expire when slot fills | Healthcare waitlist pattern |
| Reschedule alternatives | Default 5, configurable 3-10 | Balance of choice vs. overwhelm |
| Discovery flight intake | Scheduler enters manually | Staff-facing only, no public UI in MVP |
| FSP data sync | Polling every 2-5 minutes | FSP has no webhooks |
| Search window | Progressive: 7d initial, expand in 7d increments, 28d cap | Weekly patterns + fallback for constrained schools |

## Anti-Patterns

```
❌ Storing reservations locally — FSP is the source of truth
❌ Auto-approving suggestions without human confirmation (MVP)
❌ Sending SMS to non-opted-in students
❌ Cross-tenant data access — strict operator isolation
❌ Hardcoding FSP API URLs — use environment variables
❌ Polling FSP more frequently than every 2 minutes
❌ Creating reservations without validate-then-create pattern
❌ Sending UTC timestamps to FSP — use local time without timezone suffix
❌ Calling FSP without rate limiting — respect ~100 req/min per operator
```

## Factory System (Multi-Agent SDLC)

This project uses a multi-agent development system. See `.claude/skills/` for full documentation.

**Entry points:**
- `/team-presearch` — Multi-agent presearch (7 agents, 5 rounds, reaction loops)
- `/sdlc` — Full SDLC (sprint planning → dev → review → QA → deploy)
- `/project` — Full project lifecycle (presearch → phases → SDLC loops)

**Agents:** Researcher (Jordan), BA (Riley), PM (Alex), Architect (Morgan), Developer (Sam), QA (Casey), DevOps (Drew), Tech Lead (Taylor), Scrum Master (Jamie)

**Key protocols:**
- `execution-protocol.md` — All code must be actually executed and verified
- `browser-testing.md` — UI features require Playwright screenshots verified by Claude
- `learning-engine.md` — Persistent learning across sessions via learnings.json
- `execution-journal.md` — Failure/success logging for institutional memory
- `multi-agent-wiring.md` — How agents are spawned and communicate as real Claude Code teams
- `context-management.md` — Parallel execution, state files, summarization

## Testing Requirements

_To be filled after tech stack is locked._

## Deployment

_To be filled after tech stack is locked._

## Active Technologies
- TypeScript 5.x / Node.js 20 LTS + NestJS (Fastify adapter), Next.js 15, Drizzle ORM, BullMQ, React 19 (001-agentic-fsp-scheduler)
- Azure Database for PostgreSQL Flexible Server + Azure Cache for Redis (001-agentic-fsp-scheduler)
- TypeScript 5.x / Node.js 20 LTS + NestJS, @anthropic-ai/sdk, BullMQ, Drizzle ORM (001-agentic-fsp-scheduler)
- PostgreSQL (existing), Redis (existing for BullMQ) (001-agentic-fsp-scheduler)

## Recent Changes
- 001-agentic-fsp-scheduler: Added TypeScript 5.x / Node.js 20 LTS + NestJS (Fastify adapter), Next.js 15, Drizzle ORM, BullMQ, React 19
