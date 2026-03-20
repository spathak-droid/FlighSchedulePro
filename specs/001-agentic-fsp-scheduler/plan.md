# Implementation Plan: AI Integration Layer

**Branch**: `001-agentic-fsp-scheduler` | **Date**: 2026-03-19 | **Spec**: [spec.md](./spec.md)
**Input**: Add Claude AI to the suggestion generation pipeline for intelligent ranking, natural language rationale, and risk assessment.

## Summary

Integrate Claude API into the existing scheduling pipeline at three points: (1) AI-generated natural language rationale for every suggestion, (2) risk assessment scoring to prepare for Phase 2 autonomy, and (3) AI-enhanced ranking that considers holistic student context beyond numeric weights. All AI calls are async (BullMQ jobs), with deterministic fallback on failure. Feature-flagged per operator.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20 LTS
**Primary Dependencies**: NestJS, @anthropic-ai/sdk, BullMQ, Drizzle ORM
**Storage**: PostgreSQL (existing), Redis (existing for BullMQ)
**Testing**: Vitest
**Target Platform**: Azure (existing infra)
**Project Type**: Web service (NestJS backend + Next.js frontend)
**Performance Goals**: AI rationale generation < 5s per suggestion, fallback to deterministic < 100ms
**Constraints**: Claude API calls must never block the synchronous approval flow. AI failure must not prevent suggestion creation.
**Scale/Scope**: ~1000 AI calls/day at 50 operators, ~$0.50/day Sonnet cost

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  generate-suggestions job                  │
│                                                            │
│  1. Detect openings                                        │
│  2. Rank candidates (deterministic)                        │
│  3. Evaluate constraints                                   │
│  4. Build deterministic rationale (existing)                │
│  5. INSERT suggestion to DB (status=pending)               │
│  6. ─── NEW: Enqueue AI enrichment job ───                 │
│                                                            │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│              ai-enrich-suggestion job (NEW)                │
│                                                            │
│  1. Load suggestion + student + enrollment context         │
│  2. Call Claude API with structured prompt                  │
│  3. Parse response:                                        │
│     a. Natural language rationale summary                   │
│     b. Risk level (low/medium/high)                        │
│     c. AI confidence score                                  │
│  4. UPDATE suggestion.rationale with AI fields              │
│  5. On failure: log error, suggestion keeps deterministic   │
│     rationale (ai_enriched=false)                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Integration Points

### Point 1: AI Rationale Generation (Phase 1 — Ship First)

**Where**: After suggestion is created in DB, async enrichment job
**What Claude receives**:
```
Student: {name}, {totalHours}h total, last flight {timeSinceLastFlight}h ago
Opening: {activityType} on {date} {time} with {instructor} in {aircraft}
Ranking: scored {score}% — top factors: {breakdown}
Constraints: all passed / {failed constraints}
Suggestion type: {waitlist|reschedule|discovery|next_lesson}
```
**What Claude returns**: 2-3 sentence natural language explanation
**Stored in**: `suggestion.rationale.aiSummary` (JSONB field)
**Fallback**: Existing template-based `rationale.summary` always present

### Point 2: Risk Assessment (Phase 2 — Prepare for Autonomy)

**Where**: Same AI enrichment job, second prompt section
**What Claude assesses**:
- Student experience level (hours, enrollment progress)
- Schedule sensitivity (same-day vs. days out)
- Constraint margins (tight daylight? last-minute?)
- Suggestion type risk profile
**Output**: `riskLevel: 'low' | 'medium' | 'high'` + `riskReason: string`
**Stored in**: `suggestion.rationale.riskLevel`, `suggestion.rationale.riskReason`
**Use**: When Phase 2 autonomy is enabled, auto-approve `low` risk suggestions

### Point 3: AI-Enhanced Ranking (Phase 3 — Future)

**Where**: Replace/augment `rankWaitlistCandidates()` with Claude reasoning
**What Claude does**: Given N candidates with their full context, rank them holistically
**Why later**: Most expensive (one call per opening with all candidates), needs careful prompt engineering, and deterministic ranking already works well

## New Components

### 1. `AiService` (NestJS injectable)
```
src/api/modules/ai/
├── ai.module.ts
├── ai.service.ts          — Claude API wrapper with retry/fallback
└── ai.prompts.ts          — Prompt templates for each use case
```

### 2. `ai-enrich-suggestion` BullMQ job
```
src/worker/jobs/ai-enrich-suggestion.job.ts
```

### 3. Schema additions
- `suggestion.rationale` JSONB gets new optional fields: `aiSummary`, `riskLevel`, `riskReason`, `aiEnriched` (boolean), `aiModel` (string)

### 4. Environment variables
```
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-6-20250514
AI_RATIONALE_ENABLED=true
AI_RISK_ASSESSMENT_ENABLED=false
AI_MAX_TOKENS=512
AI_TIMEOUT_MS=10000
```

### 5. Frontend changes
- Show AI rationale in suggestion detail (if `aiSummary` exists, prefer it over template summary)
- Show risk badge on suggestion card (low=green, medium=yellow, high=red)

## Feature Flags

| Flag | Default | Controls |
|------|---------|----------|
| `AI_RATIONALE_ENABLED` | `true` | AI-generated natural language rationale |
| `AI_RISK_ASSESSMENT_ENABLED` | `false` | Risk level classification |
| `AI_RANKING_ENABLED` | `false` | AI-enhanced candidate ranking (future) |

Per-operator override via `scheduling_policies.aiFeatures` JSONB field.

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| Claude API down | Suggestion created with deterministic rationale. `aiEnriched=false`. Logged. |
| Claude API slow (>10s) | Timeout, fallback to deterministic. Logged. |
| Claude returns malformed response | Parse error caught, fallback to deterministic. Logged. |
| API key missing/invalid | AI features auto-disable on startup with warning log. |
| Rate limit hit | BullMQ retry with backoff. Max 3 retries per suggestion. |

## Implementation Phases

### Phase 1: AI Rationale (ship first, highest UX impact)
1. Install `@anthropic-ai/sdk`
2. Create `AiService` with Claude client, retry logic, timeout
3. Create prompt templates for each suggestion type
4. Create `ai-enrich-suggestion` BullMQ job
5. Wire: generate-suggestions → create suggestion → enqueue AI enrichment
6. Update frontend to show `aiSummary` when available
7. Add feature flag + env vars

### Phase 2: Risk Assessment
1. Add risk assessment prompt to AI enrichment job
2. Add `riskLevel` badge to frontend suggestion cards
3. Add risk filter to queue page
4. Prepare auto-approve logic (gated behind operator config)

### Phase 3: AI-Enhanced Ranking (future)
1. Design ranking prompt with full candidate context
2. A/B test AI ranking vs. deterministic
3. Blend AI ranking with deterministic scores

## Cost Analysis

| Component | Calls/day (50 ops) | Tokens/call | Model | Daily cost |
|-----------|-------------------|-------------|-------|------------|
| Rationale | ~1000 | ~700 (500 in + 200 out) | Sonnet | ~$0.50 |
| Risk assessment | ~1000 | ~600 (400 in + 200 out) | Sonnet | ~$0.40 |
| AI ranking | ~200 | ~2000 (1500 in + 500 out) | Sonnet | ~$0.30 |
| **Total** | | | | **~$1.20/day** |

## Success Criteria

- SC-008 from spec: "Every scheduling suggestion includes a human-readable rationale that the scheduler rates as 'helpful' at least 70% of the time" — AI rationale should push this to 90%+
- AI enrichment completes within 5 seconds for 95% of suggestions
- Zero suggestion creation failures due to AI integration (graceful degradation)
- Deterministic fallback activates within 100ms when AI fails
