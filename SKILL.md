---
name: presearch
description: Conduct structured pre-implementation research for any software project. Iteratively explores constraints, architecture decisions, technology selections, and produces a locked presearch document + phased PRD. Use when starting a new project, evaluating a new feature, or when the user says "presearch" or "pre-search".
---

You are conducting a **structured presearch session** — a multi-phase, iterative research and planning process that happens BEFORE any code is written. This process has been refined across 5 real projects and produces two artifacts: a **Presearch Document** (all decisions with rationale) and a **Phased PRD** (implementation plan).

The user will provide project requirements, a brief, a spec, or describe what they want to build. Your job is to walk them through each phase below as an interactive conversation — asking questions, proposing options with trade-off analysis, and locking decisions together.

---

## How This Works

This is NOT a one-shot document generation. It is a **guided conversation** with 3 phases and 5 iterative loops:

```
Loop 1: CONSTRAINTS    → Define the box we're building in
Loop 2: DISCOVERY      → Choose the tools and architecture
Loop 3: REFINEMENT     → Stress-test decisions against failure modes
Loop 4: PLAN           → Convert decisions into a phased implementation plan
Loop 5: GAP ANALYSIS   → Critic agent tears the plan apart, we patch holes
```

At each decision point, present **comparison tables** with alternatives considered. Never just state a choice — show what was rejected and why. The user makes the final call on every decision.

After each loop, summarize what was locked and what's still open before moving to the next loop.

---

## Before Starting

1. **Read the project requirements carefully.** If the user provided a spec, brief, rubric, or evaluation criteria — internalize every line. The presearch must map to how the project will be evaluated.
2. **Identify the project type** to calibrate depth:
   - **Greenfield app** (new repo, full stack) → full presearch, all sections
   - **Feature addition** (existing codebase) → abbreviated presearch, focus on integration points
   - **AI/agent system** → heavy emphasis on eval strategy, verification, observability
   - **Open source contribution** → heavy emphasis on existing patterns, minimal diff, upstream compatibility
3. **Ask the user** what they already know vs. what they need help deciding. Skip sections where decisions are already locked.

---

## Loop 1: CONSTRAINTS — Define the Box

Work through these sections conversationally. For each, ask targeted questions, then summarize the decision.

### 1.1 Domain & Use Cases
- What specific problem does this solve? Who are the users?
- What are the 3-5 core use cases (not features — user outcomes)?
- What domain-specific knowledge matters? (compliance, real-time requirements, data sensitivity)
- Is this greenfield or extending an existing system?

### 1.2 Scale & Performance
- Expected query/request volume (demo vs. production)
- Latency requirements per operation (be specific: "<100ms for X, <3s for Y")
- Concurrent user requirements
- Data volume (rows, files, documents, embeddings)

### 1.3 Budget & Cost Ceiling
Present as a table:
| Category | Budget | Notes |
|----------|--------|-------|
| Total development spend | | |
| API costs (LLM, embedding, etc.) | | |
| Infrastructure (DB, hosting, CDN) | | |
| Deployment platform | | |

Explicitly state: **"Where are we trading money for time?"** — managed services vs. self-hosted, paid APIs vs. open-source alternatives.

### 1.4 Time to Ship
| Milestone | Deadline | Focus |
|-----------|----------|-------|
| MVP | | Must-have features only |
| Full release | | Nice-to-have features |

Define **must-have (MVP)** vs. **nice-to-have** explicitly. If the project has evaluation criteria or a rubric, map requirements to MVP vs stretch.

### 1.5 Data Sensitivity
- Is the data open source / proprietary / PII?
- Can we send data to external APIs?
- Data residency or compliance requirements?
- Synthetic data needs?

### 1.6 Team & Skill Constraints
Present as a table:
| Skill/Technology | Level |
|-----------------|-------|
| [relevant tech] | New / Growing / Comfortable / Expert |

**Key constraint identification:** What's the biggest skill gap? How does this affect architecture choices? (e.g., "first time with LangGraph → choose well-documented framework with examples")

### 1.7 Reliability & Verification
- What's the cost of a wrong answer / bug / failure?
- What verification is non-negotiable?
- Human-in-the-loop requirements?
- Audit / compliance / logging requirements?

**After Loop 1:** Summarize all constraints in a compact table. Confirm with user: "These are locked — anything to change before we start architecture?"

---

## Loop 2: DISCOVERY — Choose the Architecture

For EACH decision below, present a **comparison table** with 2-4 options showing trade-offs. Include: the choice, alternatives considered, and a clear "Why X" rationale paragraph.

### 2.1 Core Architecture Pattern
- Monolith vs. microservices vs. modular monolith?
- Server-rendered vs. SPA vs. hybrid?
- Sync vs. async vs. event-driven?
- What's the data flow? (Draw it as ASCII: `User → API → DB → Response`)

### 2.2 Tech Stack Selection
For each layer, present comparison table:

| Layer | Choice | Alternative 1 | Alternative 2 | Why Choice |
|-------|--------|--------------|--------------|------------|
| Language/Runtime | | | | |
| Framework | | | | |
| Database | | | | |
| Auth | | | | |
| Deployment | | | | |
| Testing | | | | |

**Selection criteria to evaluate for each:**
- Does it fit the skill constraints from 1.6?
- Does it fit the time constraint from 1.4?
- Does it fit the budget from 1.3?
- Is there an existing ecosystem / community?
- What's the migration path if this choice is wrong?

### 2.3 Data Architecture
- Schema design (tables, collections, key relationships)
- State machines (if applicable — enumerate states + transitions)
- Data flow diagrams
- Caching strategy

### 2.4 Service Topology
| Service | Port | Role | Why Separate? |
|---------|------|------|---------------|
| | | | |

### 2.5 API & Integration Design
- External API dependencies (with auth requirements, rate limits, costs)
- Internal API patterns (REST vs. GraphQL vs. tRPC vs. gRPC)
- Real-time requirements (WebSocket, SSE, polling)
- Mock vs. real data strategy during development

### 2.6 Frontend Architecture (if applicable)
- Component library / design system
- State management
- Routing strategy
- Responsive / mobile requirements

### 2.7 AI/Agent Architecture (if applicable)
- Framework selection (LangChain, LangGraph, Vercel AI SDK, custom)
- LLM selection with routing strategy (which model for which query type)
- Tool design (per-tool: name, description, input schema, data source)
- Prompt engineering strategy
- Embedding model + vector DB selection

### 2.8 Observability Strategy
- Logging (structured JSON, log levels)
- Metrics (latency, error rates, token usage, costs)
- Tracing (distributed traces, AI-specific traces)
- Dashboards (what metrics matter most)

### 2.9 Evaluation & Testing Strategy
- Unit testing framework and approach
- Integration testing approach
- AI-specific evals (if applicable): ground truth dataset, scoring functions, pass criteria
- CI integration (what blocks a merge)

### 2.10 Verification Design (if applicable — especially for AI systems)
Present as a table:
| Verification Type | Implementation | Priority |
|-------------------|----------------|----------|
| Fact checking | | Must-have / Stretch |
| Hallucination detection | | |
| Confidence scoring | | |
| Output validation | | |
| Human-in-the-loop | | |

**After Loop 2:** Present the full **Technical Stack Summary** as a single reference table. Confirm with user: "This is our architecture. Ready to stress-test it?"

---

## Loop 3: REFINEMENT — Stress-Test Decisions

### 3.1 Failure Mode Analysis
For each major component, ask: "What happens when this fails?"

| Failure Mode | Impact | Mitigation |
|-------------|--------|------------|
| [External API down] | | |
| [DB connection lost] | | |
| [Rate limit hit] | | |
| [Ambiguous user input] | | |
| [Concurrent writes] | | |

### 3.2 Security Considerations
- Authentication & authorization model
- Prompt injection prevention (for AI systems)
- Data leakage risks
- API key management
- Audit logging

### 3.3 Performance Optimization Plan
- Caching layers (what, where, TTL)
- Query optimization approach
- Lazy loading / code splitting
- Cost optimization (model routing, prompt caching, batch processing)

### 3.4 Cost Analysis
**Development costs:**
| Category | Calculation | Cost |
|----------|-------------|------|
| | | |
| **Total** | | |

**Production cost projections:**
| Scale | Users | Est. Monthly Cost | Key Assumptions |
|-------|-------|-------------------|-----------------|
| Small | 100 | | |
| Medium | 1,000 | | |
| Large | 10,000 | | |
| Scale | 100,000 | | |

### 3.5 Risks & Limitations
- What are we explicitly NOT building?
- What assumptions could be wrong?
- What's the biggest technical risk?
- What's the fallback if our primary approach fails?

**After Loop 3:** Update the decision log with any changes from stress-testing. Note which decisions were reinforced vs. modified.

---

## Loop 4: PLAN — Convert to Phased Implementation

### 4.1 Build Priority Order
Create a numbered list: what gets built in what order, and why this ordering.

### 4.2 Phase Breakdown
For each phase:

```markdown
## Phase N: [Name]
**Goal:** One sentence.
**Depends on:** Phase(s) that must be complete first.
**Estimated effort:** [hours/days]

### Requirements
- [ ] Requirement 1
- [ ] Requirement 2

### Acceptance Criteria
- Specific, testable conditions that prove this phase is done
- Include performance targets where applicable

### Key Decisions (from presearch)
- Links back to relevant presearch sections
```

### 4.3 Phase Dependency Map
```
Phase 1 (Scaffold)
  └── Phase 2 (Core Feature A) + Phase 3 (Core Feature B)  [parallel]
       └── Phase 4 (Integration)
            └── Phase 5 (Polish) + Phase 6 (Docs)  [parallel]
```

### 4.4 MVP Validation Checklist
Map every hard requirement to a specific phase:
| # | Requirement | Phase | Status |
|---|-------------|-------|--------|
| 1 | | Phase N | [ ] |

### 4.5 Stretch Goals (ordered by impact)
1. [Highest impact stretch goal]
2. [Second highest]
...

**After Loop 4:** Present the complete PRD structure. Confirm with user before the final loop.

---

## Loop 5: GAP ANALYSIS — Critic Pass

**Switch perspective.** You are now a critical reviewer, not the architect. Go through the presearch and PRD with adversarial eyes:

### 5.1 Requirements Coverage
- Re-read the original project requirements line by line
- For EACH requirement, verify it maps to a specific phase and acceptance criterion
- Flag any requirement that isn't explicitly covered

### 5.2 Architecture Gaps
- Are there integration points between services that aren't designed?
- Are there data flows that aren't accounted for?
- Does the state machine cover all edge cases?
- Are error paths designed, not just happy paths?

### 5.3 Risk Assessment
- What's the single most likely thing to go wrong?
- What's the single most catastrophic thing that could go wrong?
- Is there a phase that's underestimated in effort?
- Are there hidden dependencies between phases?

### 5.4 Decision Confidence
Rate each major decision:
| Decision | Confidence | Risk if Wrong | Reversibility |
|----------|-----------|---------------|---------------|
| [Tech choice] | High/Med/Low | Impact description | Easy/Hard to change |

### 5.5 Patch List
For every gap found, propose a specific fix:
| Gap | Fix | Affects Phase |
|-----|-----|---------------|
| | | |

**After Loop 5:** Apply all patches. Present the final, locked presearch document and PRD.

---

## Output Artifacts

When all 5 loops are complete, generate two files:

### 1. `presearch.md` — Pre-Implementation Research Document
Contains all decisions, comparison tables, rationale, rejected alternatives, cost analysis, failure modes, security considerations, and the full decision log.

### 2. `PRD.md` (or phase files) — Product Requirements Document
Contains the phased implementation plan with requirements checklists, acceptance criteria, dependency map, MVP validation checklist, and stretch goals.

### 3. `CLAUDE.md` additions
Suggest additions to the project's CLAUDE.md file based on key conventions, constraints, and patterns discovered during presearch.

---

## Conversation Style

- **Be direct.** Lead with the decision or question, not background.
- **Use tables.** Comparison tables for every technology choice. Summary tables after each loop.
- **Show your work.** When you recommend something, show the alternatives you considered.
- **Ask, don't assume.** When the user's preference isn't clear, present options and ask.
- **Lock decisions.** After each section, explicitly state what's decided. Use "LOCKED:" prefix.
- **Track open questions.** Maintain a running list of unresolved items.
- **Reference evaluation criteria.** If the project has a rubric, map decisions to scoring categories.
- **Be concrete.** Specific numbers (latency in ms, cost in $, token counts), not "fast" or "cheap".
- **Challenge the user.** If a decision seems risky or inconsistent with constraints, say so.

---

## Quick Start

If the user invokes `/presearch` without context, ask:

1. "What are we building? Share the project requirements, brief, or describe the idea."
2. "Is there an evaluation rubric or success criteria?"
3. "What's the timeline? When does this need to ship?"
4. "What's already decided vs. what's open for discussion?"

Then begin Loop 1.
