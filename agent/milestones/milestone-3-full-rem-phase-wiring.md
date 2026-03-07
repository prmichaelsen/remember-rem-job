# Milestone 3: Full REM Phase Wiring

**Goal**: Wire all 11 REM phases (0-10) including ghost-scoped cycles with per-ghost mood/perception isolation
**Duration**: 1-2 weeks
**Dependencies**: remember-core publish with new service exports + tag filter support in runCycle()
**Status**: Not Started

---

## Overview

remember-rem currently only wires 4 required RemService deps, enabling Phases 1-3 (candidate selection, clustering, relationship CRUD). This milestone wires the remaining optional deps to enable all 11 phases and implements ghost-scoped REM cycles so each ghost within a user collection gets its own mood/perception state.

---

## Deliverables

### 1. Phase 0-7 Dependency Wiring
- subLlm via createAnthropicSubLlm
- EmotionalScoringService (Phase 0)
- ScoringContextService (Phase 0)
- ClassificationService (Phase 7)

### 2. Ghost-Scoped REM Cycles
- Firestore-based ghost composite ID discovery
- Per-ghost tag-filtered REM cycle execution
- Non-ghost (user's own) memory cycle

### 3. Mood/Perception Wiring (Phases 8-10)
- MoodService per ghost
- ghostCompositeId passed to RemService
- Correct Firestore path isolation

### 4. Updated Test Scripts & Deploy
- test-fanout.ts updated with new deps
- cloudbuild.yaml updated if needed
- E2E verification

---

## Success Criteria

- [ ] RemService receives all optional deps (subLlm, emotionalScoringService, scoringContextService, classificationService, moodService, ghostCompositeId)
- [ ] Worker discovers ghost composite IDs from Firestore for each user collection
- [ ] Separate REM cycles run per ghost + one for user's own memories
- [ ] Mood state written to correct Firestore path per ghost
- [ ] test-fanout.ts exercises ghost-scoped cycles
- [ ] All existing tests still pass
- [ ] Deployed and verified E2E

---

## Tasks

1. [Task 12: Wire Phase 0-7 Dependencies](../tasks/milestone-3-full-rem-phase-wiring/task-12-wire-phase-0-7-deps.md) - Wire subLlm, emotional scoring, classification services
2. [Task 13: Ghost Composite ID Discovery](../tasks/milestone-3-full-rem-phase-wiring/task-13-ghost-composite-id-discovery.md) - Discover ghost composite IDs from Firestore per user collection
3. [Task 14: Per-Ghost REM Cycle Execution](../tasks/milestone-3-full-rem-phase-wiring/task-14-per-ghost-rem-cycles.md) - Tag-filtered REM cycles per ghost within worker
4. [Task 15: Wire Mood/Perception Dependencies](../tasks/milestone-3-full-rem-phase-wiring/task-15-wire-mood-perception-deps.md) - MoodService + ghostCompositeId for Phases 8-10
5. [Task 16: Update Tests and Deploy](../tasks/milestone-3-full-rem-phase-wiring/task-16-update-tests-deploy.md) - Update test scripts, deploy, E2E verify

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| remember-core not published | High | Medium | Tasks can be written against agreed API contract; won't compile until published |
| Tag filter API changes | Medium | Low | API contract agreed; adapt if interface differs |
| Ghost discovery perf on large user bases | Low | Low | Firestore subcollection listing is fast; bounded by number of ghosts per user |

---

**Next Milestone**: TBD
**Blockers**: remember-core publish with new service exports + runCycle tag filter
**Notes**: Design doc: agent/design/local.ghost-scoped-rem-cycles.md
