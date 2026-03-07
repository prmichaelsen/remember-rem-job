# Milestone 2: Fan-Out Job Architecture

**Goal**: Refactor remember-rem-job from a sequential multi-cycle runner into a daily scheduler that fans out per-collection Cloud Run Job executions using remember-core's job tracking system
**Duration**: 1-2 weeks
**Dependencies**: remember-core JobService, RemJobWorker, scheduleRemJobs (all available in current version)
**Status**: Not Started

---

## Overview

Currently, remember-rem-job runs hourly and executes 30 sequential REM cycles in a single container. This milestone refactors it into a fan-out architecture:

1. **Scheduler mode** (daily): Enumerates collections via `scheduleRemJobs()`, creates Firestore job records, then calls the Cloud Run Admin API per job to trigger independent worker executions
2. **Worker mode** (triggered by scheduler): Picks up a specific job by `JOB_ID`, runs `RemJobWorker.execute()` with full job tracking (progress, cancellation, step tracking, REST API visibility)

Same Docker image, two modes driven by `REM_MODE=scheduler|worker` env var.

### Why

- **Parallel processing**: N collections processed concurrently instead of 30 sequential cycles
- **Per-collection observability**: Each collection gets its own job record queryable via REST API
- **Cancellable**: Individual collection jobs can be cancelled via `POST /api/svc/v1/jobs/{id}/cancel`
- **Leverages existing infrastructure**: `scheduleRemJobs()`, `RemJobWorker`, and `JobService` already exist in remember-core

### Architecture

```
Cloud Scheduler (daily, 0 0 * * *)
    |
    v
Cloud Run Job: remember-rem-job (REM_MODE=scheduler)
    |
    |-- scheduleRemJobs() --> creates N Firestore job records (status: pending)
    |
    |-- for each job:
    |     Cloud Run Admin API: jobs.run() with JOB_ID override
    |     |
    |     v
    |     Cloud Run Job: remember-rem-job (REM_MODE=worker, JOB_ID=xxx)
    |         |
    |         v
    |         RemJobWorker.execute(jobId, params)
    |             - candidate-selection
    |             - clustering
    |             - haiku-validation
    |             - relationship-crud
    |         |
    |         v
    |         JobService updates Firestore (progress, steps, result)
    |
    v
    Scheduler exits (fire-and-forget)
```

---

## Deliverables

### 1. Dual-Mode Entry Point
- `REM_MODE=scheduler` triggers scheduler logic
- `REM_MODE=worker` triggers worker logic with `JOB_ID` env var
- Shared infrastructure initialization (Weaviate, Firestore, Anthropic)

### 2. Scheduler Mode
- Calls `scheduleRemJobs()` to enumerate collections and create Firestore job records
- Loops through created jobs, calls Cloud Run Admin API per job with `JOB_ID` container override
- Fire-and-forget: exits after triggering all workers
- No concurrency limit

### 3. Worker Mode
- Reads `JOB_ID` from env
- Fetches job record from Firestore via `JobService.getStatus()`
- Calls `RemJobWorker.execute(jobId, params)` for full tracked execution
- Exits with code 0/1

### 4. Infrastructure Updates
- Cloud Scheduler cron changed from hourly to daily (`0 0 * * *`)
- Deploy script updated for new env vars and mode
- IAM: scheduler service account needs `roles/run.invoker` to trigger worker executions

### 5. Testing
- Unit tests for mode switching logic
- Local test script updated for both modes
- E2E verification on e1

---

## Success Criteria

- [ ] `REM_MODE=scheduler` enumerates collections and creates Firestore job records
- [ ] Scheduler triggers Cloud Run Job executions via Admin API per job
- [ ] `REM_MODE=worker` picks up a job by ID and runs RemJobWorker
- [ ] Worker jobs visible in Firestore with progress, steps, and result
- [ ] Worker jobs queryable via REST API (`GET /api/svc/v1/jobs/{id}`)
- [ ] Cloud Scheduler triggers daily and scheduler completes successfully
- [ ] Workers process collections in parallel
- [ ] Old sequential 30-cycle code removed

---

## Tasks

1. [Task 7: Dual-Mode Entry Point](../tasks/milestone-2-fan-out-job-architecture/task-7-dual-mode-entry-point.md) - Refactor src/index.ts to support scheduler/worker modes
2. [Task 8: Scheduler Mode Implementation](../tasks/milestone-2-fan-out-job-architecture/task-8-scheduler-mode.md) - scheduleRemJobs integration + Cloud Run Admin API fan-out
3. [Task 9: Worker Mode Implementation](../tasks/milestone-2-fan-out-job-architecture/task-9-worker-mode.md) - RemJobWorker integration with JOB_ID pickup
4. [Task 10: Infrastructure & Deploy Updates](../tasks/milestone-2-fan-out-job-architecture/task-10-infra-deploy-updates.md) - Cloud Scheduler, IAM, deploy scripts
5. [Task 11: Testing & E2E Verification](../tasks/milestone-2-fan-out-job-architecture/task-11-testing-e2e.md) - Unit tests, local testing, e1 verification

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Cloud Run Admin API rate limits | Medium | Low | Collections are typically < 50; API calls are fast |
| IAM permission issues for self-triggering | Medium | Medium | Follow GCP docs for Cloud Run invoker role; test on e1 first |
| Worker cold start overhead per collection | Low | High | Acceptable — each worker runs independently, cold start is ~2-5s |
| Duplicate job execution (API call retry) | Medium | Low | RemJobWorker checks job status before executing; JobService tracks state |

---

**Next Milestone**: None planned
**Blockers**: None — all remember-core dependencies already available
**Notes**: The `scheduleRemJobs()` function and `RemJobWorker` class already exist in remember-core. This milestone is primarily integration and infrastructure work.
