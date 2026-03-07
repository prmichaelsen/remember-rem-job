# Task 9: Worker Mode Implementation

**Milestone**: M2 - Fan-Out Job Architecture
**Status**: Not Started
**Estimated Hours**: 2-3
**Dependencies**: [Task 7](task-7-dual-mode-entry-point.md)

---

## Objective

Implement the worker mode: read `JOB_ID` from env, fetch job params from Firestore, and execute `RemJobWorker.execute()` for full tracked REM cycle execution.

---

## Context

remember-core exports `RemJobWorker` which:
- Takes `jobService`, `remService`, and `logger` as constructor deps
- `execute(jobId, params)` runs a full REM cycle with 4 tracked steps:
  1. candidate-selection
  2. clustering
  3. haiku-validation
  4. relationship-crud
- Updates Firestore job record with progress (0-100%), step statuses, and final result
- Handles errors and marks job as failed
- Checks cancellation before starting

---

## Steps

1. Read `JOB_ID` from env (already validated by ConfigService from Task 7)

2. Instantiate job infrastructure
   - Create `JobService` instance
   - Fetch job record via `jobService.getStatus(jobId)` to get params (collection_id)
   - Validate job exists and is in `pending` status

3. Create `RemService` and `RemJobWorker`
   - `RemService` needs: weaviateClient, relationshipServiceFactory, stateStore, haikuClient, logger
   - `RemJobWorker` needs: jobService, remService, logger

4. Execute the job
   - Call `remJobWorker.execute(jobId, job.params)`
   - RemJobWorker handles all progress tracking, step updates, and completion

5. Exit with appropriate code
   - 0 on success (job completed)
   - 1 on failure (job failed)

---

## Key Decisions

- **RemService config**: Worker mode may need different `max_candidates_per_run` than the old 5000 — since each worker processes one collection, the default from remember-core should be fine
- **No RemStateStore cursor**: The old cursor-based round-robin is replaced by the scheduler's collection enumeration. RemService.runCycle() may still use a cursor internally — need to check if `collection_id` from job params is passed through

---

## Verification

- [ ] Worker reads `JOB_ID` from env
- [ ] Job record fetched from Firestore
- [ ] Worker rejects non-pending jobs gracefully
- [ ] `RemJobWorker.execute()` runs full cycle with step tracking
- [ ] Firestore job record updated with progress and result
- [ ] Worker exits 0 on success, 1 on failure
- [ ] Job visible via REST API with correct status/steps
- [ ] `npm run build` succeeds
