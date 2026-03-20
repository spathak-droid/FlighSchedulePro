# Research: Agentic Scheduler for Flight Schedule Pro

**Date**: 2026-03-18
**Feature**: 001-agentic-fsp-scheduler

---

## R-001: Tech Stack Decision — TypeScript vs C#

**Decision**: TypeScript (NestJS + Next.js + Drizzle ORM + BullMQ + PostgreSQL)

**Rationale**: Developer has TypeScript/Next.js experience (zero ramp-up). C# would require 4-8 weeks ramp-up that directly delays MVP. Single-language full-stack enables shared FSP API types across backend and frontend. The workload is I/O-bound (FSP API calls, DB queries), not CPU-bound — ASP.NET Core's throughput advantage is irrelevant. C#'s multi-tenancy library (Finbuckle) is strong but achievable with NestJS middleware + PostgreSQL RLS.

**Alternatives Considered**:
- **C# / ASP.NET Core**: Better Azure-native support, Finbuckle for multi-tenancy, Hangfire for jobs. Rejected due to 4-8 week ramp-up and need for Blazor or dual-language frontend.
- **Python / FastAPI**: Developer knows it (CapManAI). Rejected because NestJS is better suited for the module-heavy, multi-tenant architecture needed here. Also, TypeScript gives shared types with Next.js frontend.

**Escape hatch**: If FSP provides a .NET-only auth SDK beyond REST, wrap it in a thin .NET microservice.

---

## R-002: Backend Framework — NestJS

**Decision**: NestJS with Fastify adapter

**Rationale**: Modular architecture with dependency injection, guards, interceptors, and pipes maps directly to multi-tenant middleware needs. Fastify adapter provides ~3x throughput over Express. First-class TypeScript support. Official BullMQ integration (`@nestjs/bullmq`).

**Alternatives Considered**:
- **Fastify standalone**: Lighter, faster. Rejected — lacks NestJS's module system, DI, and guard patterns needed for tenant isolation.
- **Express**: Too bare, no DI, would require building too much infrastructure.
- **Hono**: Modern, fast. Rejected — less mature ecosystem, fewer integrations for enterprise patterns.

---

## R-003: Frontend Framework — Next.js 15

**Decision**: Next.js 15 (App Router) with React 19

**Rationale**: Developer already knows Next.js. Staff-facing approval console benefits from SSR for fast initial load. React ecosystem has excellent component libraries for dashboards (TanStack Table for the suggestion queue, shadcn/ui for UI primitives). No public-facing component needed — simplifies auth.

**Alternatives Considered**:
- **Vite + React SPA**: Simpler setup. Rejected — loses SSR benefits and the developer's existing Next.js patterns.
- **Remix**: Good full-stack framework. Rejected — developer doesn't know it, less ecosystem support than Next.js.

---

## R-004: ORM — Drizzle ORM

**Decision**: Drizzle ORM with PostgreSQL

**Rationale**: SQL-like API gives explicit control over tenant-scoped queries (critical for data isolation). Excellent TypeScript inference — FSP entity types flow naturally. Lightweight (~7.4kb). Migration tooling built-in via `drizzle-kit`. Better for the complex queries this system needs (ranking algorithms, multi-table joins for scheduling) than Prisma's abstraction layer.

**Alternatives Considered**:
- **Prisma**: More popular, better documentation. Rejected — query abstraction makes it harder to write explicit tenant-scoped queries and complex ranking logic. Heavier runtime.
- **TypeORM**: Rejected — declining maintenance, known issues with TypeScript strict mode.
- **Kysely**: Excellent query builder. Rejected — less migration tooling than Drizzle.

---

## R-005: Database — Azure Database for PostgreSQL Flexible Server

**Decision**: PostgreSQL on Azure Flexible Server

**Rationale**: Row-Level Security (RLS) for tenant isolation — policies automatically filter by `operatorId` on every query. Append-only audit tables with triggers for immutable logging. Azure-managed, SOC 2 compliant. US data residency supported. The developer has PostgreSQL experience from CapManAI.

**Alternatives Considered**:
- **Azure SQL Database**: Better .NET integration but unnecessary for TypeScript stack. PostgreSQL RLS is more elegant for multi-tenancy than Azure SQL's approach.
- **Azure Cosmos DB**: Overkill for this workload. Document model doesn't fit the relational entity model well.

---

## R-006: Background Jobs — BullMQ

**Decision**: BullMQ with Azure Cache for Redis

**Rationale**: Reliable job queue with rate limiting (critical for FSP API calls), retries, delayed jobs, and repeatable jobs (for polling schedule). NestJS has official `@nestjs/bullmq` module. Bull Board provides monitoring dashboard.

**Job types**:
- **FSP Polling**: Repeatable job every 2-5 minutes per operator. Rate-limited to 60 req/min per operator.
- **Suggestion Generation**: Triggered when polling detects changes. CPU-bound ranking logic.
- **Suggestion Expiration**: Scheduled check for TTL-expired suggestions.
- **Notification Dispatch**: Triggered on approval. Fan-out to email (via FSP) and SMS (via external provider).

**Alternatives Considered**:
- **Azure Functions Timer Triggers**: Fully managed but requires separate deployment target. Adds operational complexity.
- **Agenda.js (MongoDB-backed)**: Rejected — don't want MongoDB as a dependency.
- **node-cron**: Too simple — no persistence, no retry, no rate limiting.

---

## R-007: Authentication — FSP REST Auth

**Decision**: Direct REST calls to FSP auth endpoints, session tokens stored in HTTP-only cookies

**Rationale**: No language-specific FSP SDK exists. The auth flow is standard REST: `POST /common/v1.0/sessions/credentials` → token. MFA via `POST /common/v1.0/sessions/mfa`. Token refresh via `POST /common/v1.0/sessions/refresh`. This is ~50 lines of code in TypeScript.

**Session management**: JWT or session cookie issued by our system after FSP auth succeeds. Contains `operatorId` + `userId` + `permissions`. NestJS guards enforce tenant isolation on every request.

---

## R-008: Multi-Tenancy — NestJS Guards + PostgreSQL RLS

**Decision**: Request-scoped tenant context via NestJS guard + PostgreSQL Row-Level Security

**Implementation**:
1. NestJS `TenantGuard` extracts `operatorId` from JWT/session on every request
2. Sets PostgreSQL session variable: `SET app.current_tenant = '<operatorId>'`
3. RLS policies on every table: `USING (operator_id = current_setting('app.current_tenant'))`
4. All queries automatically filtered — no way to accidentally access another tenant's data

**Alternatives Considered**:
- **Schema-per-tenant**: Better isolation but operationally complex at 1,300+ operators. Migration maintenance nightmare.
- **Database-per-tenant**: Maximum isolation but cost-prohibitive at scale.
- **Application-level filtering only**: Risky — one missed `WHERE` clause leaks data. RLS is defense-in-depth.

---

## R-009: SMS Provider

**Decision**: Twilio (deferred to implementation, interface-first)

**Rationale**: Industry standard, Azure-compatible, US data residency supported. But the SMS provider should be behind an interface so it's swappable. MVP can start with email-only (via FSP's `sendEmailNotification`) and add SMS in a later sprint.

---

## R-010: Hosting — Azure Container Apps

**Decision**: Azure Container Apps for API + workers, Azure Static Web Apps for frontend

**Rationale**: Container-native, scales independently per component. Supports background workers (BullMQ processor). Azure Static Web Apps handles Next.js SSR via edge functions. Both are SOC 2 compliant with US data residency.

**Components**:
- **API Container**: NestJS application
- **Worker Container**: BullMQ processors (polling, suggestion generation, notifications)
- **Frontend**: Next.js on Azure Static Web Apps
- **Database**: Azure Database for PostgreSQL Flexible Server
- **Cache/Queue**: Azure Cache for Redis (for BullMQ)

---

## R-011: FSP API Rate Limiting Strategy

**Decision**: Per-operator rate limiter at 60 req/min, exponential backoff on 429

**Rationale**: FSP has undocumented rate limits (~100 req/min per operator per the API appendix research). Safety margin of 60 req/min prevents hitting limits during normal operation. Exponential backoff (1s, 2s, 4s, 8s, max 30s) handles transient 429s. Circuit breaker pattern (5 consecutive failures → circuit open for 60s) prevents cascading failures.

---

## R-012: Audit Logging Strategy

**Decision**: Append-only PostgreSQL table with database triggers

**Rationale**: Immutable audit events stored as JSON in an append-only table (no UPDATE/DELETE allowed via RLS policy). Database trigger captures all suggestion state changes automatically. 1-year retention per PRD requirement. Indexed by `operatorId`, `timestamp`, `eventType` for efficient querying.
