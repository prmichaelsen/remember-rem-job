# Task 11: Testing & E2E Verification

**Milestone**: M2 - Fan-Out Job Architecture
**Status**: Not Started
**Estimated Hours**: 2-3
**Dependencies**: [Task 10](task-10-infra-deploy-updates.md)

---

## Objective

Test the fan-out architecture locally and on e1 environment. Verify end-to-end flow from scheduler to worker execution with job tracking.

---

## Steps

1. Update local test script (`scripts/test-local.ts`)
   - Add mode selection: `--mode=scheduler` or `--mode=worker --job-id=xxx`
   - Scheduler mode: runs scheduleRemJobs locally, logs created jobs (skip Admin API calls locally)
   - Worker mode: runs RemJobWorker.execute for a given job ID

2. Unit tests
   - Mode switching logic (scheduler vs worker based on env)
   - Config validation (REM_MODE required, JOB_ID required for worker)
   - Scheduler fan-out logic (mock Admin API calls, verify called per job)

3. E2E on e1
   - Deploy both scheduler and worker jobs to e1
   - Manually trigger scheduler: `gcloud run jobs execute remember-rem-scheduler --region=...`
   - Verify Firestore job records created
   - Verify worker executions triggered (check Cloud Run console)
   - Verify workers complete and job records updated with results
   - Query job status via REST API to confirm visibility
   - Check Cloud Logging for both scheduler and worker logs

4. Update verify script (`scripts/verify.ts`)
   - Check for recent job records in Firestore
   - Verify at least one completed worker execution
   - Report aggregate stats from completed jobs

---

## Verification

- [ ] Local test script works for both modes
- [ ] Unit tests pass for mode switching and config validation
- [ ] E2E: scheduler creates job records on e1
- [ ] E2E: worker executions triggered and complete
- [ ] E2E: job records show progress, steps, and results in Firestore
- [ ] E2E: jobs queryable via REST API
- [ ] Verify script updated and reports correctly
- [ ] Cloud Logging shows scheduler and worker logs
