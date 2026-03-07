# Task 16: Update Tests and Deploy

**Milestone**: [M3 - Full REM Phase Wiring](../../milestones/milestone-3-full-rem-phase-wiring.md)
**Estimated Time**: 2-3 hours
**Dependencies**: T12, T13, T14, T15
**Status**: Not Started
**Design Reference**: [Ghost-Scoped REM Cycles](../../design/local.ghost-scoped-rem-cycles.md), [GCP Execution Environment](../../design/local.gcp-execution-environment.md)

---

## Objective

Update test scripts to exercise the new phase wiring and ghost-scoped cycles, deploy the updated worker/scheduler, and verify E2E.

---

## Context

After T12-T15, the worker runs all 11 REM phases with ghost-scoped cycles. The test scripts (test-fanout.ts, test-local.ts) need to wire the same deps, and the deployment needs to be verified.

---

## Steps

### 1. Update scripts/test-fanout.ts

Wire the new deps (subLlm, emotionalScoringService, scoringContextService, classificationService) into the test script's RemService instantiation. Add ghost discovery logging in dry-run mode.

### 2. Update scripts/test-local.ts

Wire the same new deps for legacy/worker mode testing.

### 3. Run test-fanout in dry-run mode

```bash
npm run test:fanout
```

Verify:
- Collections enumerated
- Jobs created
- Ghost composite IDs discovered and logged per user collection

### 4. Run test-fanout in live mode (small batch)

```bash
npm run test:fanout -- --live --batch=5 --collection=Memory_{testUserId}
```

Verify:
- Phase 0 (emotional scoring) runs
- Phase 4 (abstraction) runs
- Phase 7 (classification) runs
- Phases 8-10 (mood) run for ghost cycles
- Results summary shows all phases

### 5. Deploy to e1

```bash
npm run deploy
```

Verify cloudbuild.yaml deploys correctly with same secrets.

### 6. Trigger scheduler and verify E2E

Trigger the scheduler manually and verify in Cloud Logging that:
- Workers receive jobs
- All 11 phases execute
- Ghost-scoped cycles run for user collections with ghost memories
- Mood state written to correct Firestore paths

### 7. Update existing unit tests

Ensure existing config/mode tests still pass with the new deps. Add tests for new service instantiation logic if needed.

---

## Verification

- [ ] test-fanout.ts dry-run shows ghost discovery
- [ ] test-fanout.ts live mode executes all 11 phases
- [ ] test-local.ts works with new deps
- [ ] All existing unit tests pass
- [ ] Deploy succeeds
- [ ] Cloud Logging shows all phases executing in E2E
- [ ] Firestore mood state written correctly for ghost cycles

---

## Notes

- ANTHROPIC_API_KEY already in Secret Manager — no new secrets needed
- Monitor Haiku API costs during first live runs (emotional scoring + classification add LLM calls)
- Consider adding a `--phases` flag to test-fanout.ts for selective phase testing (future enhancement)
