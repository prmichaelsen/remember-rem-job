# Task 7: Dual-Mode Entry Point

**Milestone**: M2 - Fan-Out Job Architecture
**Status**: Not Started
**Estimated Hours**: 2-3
**Dependencies**: None

---

## Objective

Refactor `src/index.ts` to support two execution modes via `REM_MODE` env var:
- `scheduler`: Enumerate collections, create jobs, trigger worker executions
- `worker`: Pick up a specific job by `JOB_ID` and execute it

Extract shared infrastructure initialization (Weaviate, Firestore, Anthropic client) into a reusable setup function.

---

## Context

Currently `src/index.ts` runs 30 sequential `RemService.runCycle()` calls. This needs to be replaced with a mode switch that delegates to scheduler or worker logic. Both modes share the same infrastructure initialization but diverge after setup.

---

## Steps

1. Add `REM_MODE` and `JOB_ID` to `ConfigService` and `config.types.ts`
   - `REM_MODE`: required, enum `'scheduler' | 'worker'`
   - `JOB_ID`: required when `REM_MODE=worker`, optional otherwise
   - Add GCP project/region config for Cloud Run Admin API calls (scheduler mode)

2. Extract shared initialization into a helper
   - Weaviate client init
   - Firestore init
   - Logger creation
   - Return initialized clients/services

3. Refactor `main()` to switch on `REM_MODE`
   - `scheduler`: call scheduler logic (Task 8)
   - `worker`: call worker logic (Task 9)
   - Unknown mode: fail-fast with clear error

4. Remove old 30-cycle sequential logic

---

## Verification

- [ ] `REM_MODE=scheduler` enters scheduler code path
- [ ] `REM_MODE=worker JOB_ID=xxx` enters worker code path
- [ ] Missing `REM_MODE` throws clear error
- [ ] `REM_MODE=worker` without `JOB_ID` throws clear error
- [ ] Shared infra (Weaviate, Firestore) initialized in both modes
- [ ] Old 30-cycle loop removed
- [ ] `npm run build` succeeds
