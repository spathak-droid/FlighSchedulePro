# Quickstart: Agentic Scheduler for Flight Schedule Pro

## Prerequisites

- Node.js 20+ (LTS)
- pnpm 9+
- PostgreSQL 16+
- Redis 7+ (for BullMQ)
- Docker + Docker Compose (recommended for local dev)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd FlighSchedulePro
pnpm install
```

### 2. Environment

```bash
cp env.example .env.local
# Fill in FSP API credentials:
# FSP_API_BASE_URL, FSP_CORE_BASE_URL, FSP_CURRICULUM_BASE_URL, FSP_SUBSCRIPTION_KEY
# Fill in database + Redis:
# DATABASE_URL=postgresql://user:pass@localhost:5432/fsp_scheduler
# REDIS_URL=redis://localhost:6379
```

### 3. Database

```bash
# Start PostgreSQL + Redis via Docker
docker compose up -d postgres redis

# Run migrations
pnpm db:migrate

# Seed default data (notification templates, default policies)
pnpm db:seed
```

### 4. Run

```bash
# Backend API (NestJS)
pnpm dev:api          # http://localhost:3001

# Background workers (BullMQ)
pnpm dev:worker       # Polls FSP, generates suggestions, sends notifications

# Frontend (Next.js)
pnpm dev:web          # http://localhost:3000

# All at once
pnpm dev              # Runs all three concurrently
```

### 5. Verify

```bash
# Health check
curl http://localhost:3001/api/v1/health

# Login with FSP credentials
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "scheduler@school.com", "password": "..."}'

# List suggestions (with auth token)
curl http://localhost:3001/api/v1/suggestions \
  -H "Authorization: Bearer <token>"
```

## Project Structure

```
FlighSchedulePro/
├── src/
│   ├── api/                    # NestJS backend
│   │   ├── modules/
│   │   │   ├── auth/           # FSP authentication
│   │   │   ├── suggestions/    # Suggestion CRUD + approval
│   │   │   ├── discovery/      # Discovery flight intake
│   │   │   ├── policies/       # Scheduling policy config
│   │   │   ├── notifications/  # Notification dispatch
│   │   │   ├── activity/       # Activity feed
│   │   │   └── dashboard/      # Dashboard stats
│   │   ├── common/
│   │   │   ├── guards/         # TenantGuard, AuthGuard
│   │   │   ├── interceptors/   # AuditInterceptor
│   │   │   └── filters/        # GlobalExceptionFilter
│   │   ├── fsp/                # FSP API client (rate-limited)
│   │   └── main.ts
│   ├── worker/                 # BullMQ background jobs
│   │   ├── jobs/
│   │   │   ├── poll-schedule.job.ts
│   │   │   ├── generate-suggestions.job.ts
│   │   │   ├── expire-suggestions.job.ts
│   │   │   └── send-notification.job.ts
│   │   └── main.ts
│   ├── core/                   # Shared business logic
│   │   ├── ranking/            # Waitlist ranking algorithm
│   │   ├── scheduling/         # Slot finding, constraint evaluation
│   │   └── types/              # Shared TypeScript types
│   └── db/                     # Drizzle schema + migrations
│       ├── schema/
│       ├── migrations/
│       └── index.ts
├── web/                        # Next.js frontend
│   ├── app/
│   │   ├── dashboard/
│   │   ├── queue/              # Approval queue
│   │   ├── policies/           # Policy configuration
│   │   ├── templates/          # Notification templates
│   │   └── layout.tsx
│   ├── components/
│   └── lib/
│       ├── api.ts              # API client
│       └── types.ts            # Shared types (imported from src/core/types)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docker-compose.yml
├── drizzle.config.ts
├── nest-cli.json
├── package.json
└── tsconfig.json
```

## Key Commands

```bash
# Development
pnpm dev              # Run all services
pnpm dev:api          # API only
pnpm dev:worker       # Worker only
pnpm dev:web          # Frontend only

# Database
pnpm db:migrate       # Run migrations
pnpm db:generate      # Generate migration from schema changes
pnpm db:seed          # Seed default data
pnpm db:studio        # Open Drizzle Studio (DB browser)

# Testing
pnpm test             # Run all tests
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests (needs DB + Redis)
pnpm test:e2e         # E2E tests (needs full stack running)

# Linting
pnpm lint             # ESLint
pnpm typecheck        # TypeScript strict mode
pnpm format           # Prettier

# Build
pnpm build            # Production build (all)
pnpm build:api        # API build
pnpm build:web        # Frontend build
```

## Docker Compose (local dev)

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: fsp_scheduler
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pgdata:
```
