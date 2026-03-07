# Task 8: Scheduler Mode Implementation

**Milestone**: M2 - Fan-Out Job Architecture
**Status**: Not Started
**Estimated Hours**: 3-4
**Dependencies**: [Task 7](task-7-dual-mode-entry-point.md)

---

## Objective

Implement the scheduler mode: enumerate collections via `scheduleRemJobs()`, then fan out by calling the Cloud Run Admin API to trigger a worker execution per job.

---

## Context

remember-core exports `scheduleRemJobs(jobService, collectionEnumerator, logger)` which:
- Iterates an async generator of collection IDs
- Creates a Firestore job record per collection (`type: 'rem_cycle'`, `params: { collection_id }`, `status: 'pending'`)
- Returns `{ jobs_created: number }`

After job records are created, the scheduler must trigger a Cloud Run Job execution per job via the Admin API with `JOB_ID` and `REM_MODE=worker` as container overrides.

---

## Steps

1. Implement collection enumerator
   - Create async generator that lists all Weaviate collections eligible for REM processing
   - Filter by minimum collection size (50 memories per design spec)
   - This may already exist in remember-core or can use Weaviate client directly

2. Call `scheduleRemJobs()` to create Firestore job records
   - Instantiate `JobService`
   - Pass collection enumerator and logger
   - Log count of jobs created

3. Implement Cloud Run Admin API fan-out
   - Use `google-auth-library` or raw fetch with metadata server token for auth
   - For each created job, call `POST https://run.googleapis.com/v2/projects/{PROJECT}/locations/{REGION}/jobs/{JOB_NAME}:run`
   - Pass container overrides: `REM_MODE=worker`, `JOB_ID={jobId}`
   - Fire-and-forget: don't wait for worker completion
   - Log each trigger (job ID, collection ID)

4. Handle API errors gracefully
   - If a trigger fails, log the error but continue triggering remaining jobs
   - Log summary at end: N triggered, M failed

5. Exit after all triggers sent

---

## Key Decisions

- **No concurrency limit**: Fire all API calls. Could use `Promise.all()` for parallel triggers or sequential loop. Sequential is simpler and avoids API rate issues.
- **Auth**: Use GCP metadata server for service account token (automatic in Cloud Run). For local dev, use `gcloud auth print-access-token`.
- **Job name**: The worker Cloud Run Job name needs to be configurable (env var like `WORKER_JOB_NAME`).

---

## Verification

- [ ] Collection enumerator yields eligible collections
- [ ] `scheduleRemJobs()` creates Firestore job records
- [ ] Cloud Run Admin API called per job with correct overrides
- [ ] Failed triggers don't block remaining triggers
- [ ] Summary logged (jobs created, triggers sent, failures)
- [ ] Scheduler exits cleanly after fan-out
- [ ] `npm run build` succeeds
