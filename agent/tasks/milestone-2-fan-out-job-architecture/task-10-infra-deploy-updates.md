# Task 10: Infrastructure & Deploy Updates

**Milestone**: M2 - Fan-Out Job Architecture
**Status**: Not Started
**Estimated Hours**: 2-3
**Dependencies**: [Task 8](task-8-scheduler-mode.md), [Task 9](task-9-worker-mode.md)

---

## Objective

Update Cloud Scheduler, deploy scripts, IAM permissions, and environment configuration to support the dual-mode fan-out architecture.

---

## Steps

1. Update Cloud Scheduler
   - Change cron from `0 * * * *` (hourly) to `0 0 * * *` (daily)
   - Update trigger to pass `REM_MODE=scheduler` as container override

2. Update deploy script (`scripts/deploy.ts`)
   - Deploy the same image for both scheduler and worker roles
   - Scheduler job: `remember-rem-scheduler` with `REM_MODE=scheduler`
   - Worker job: `remember-rem-worker` (no default JOB_ID — set per execution via API override)
   - Both jobs share secrets (Weaviate, Firestore, Anthropic, Embeddings)
   - Configure worker job timeout (50 min per design spec)

3. IAM permissions
   - Scheduler service account needs `roles/run.invoker` on the worker job
   - Or use `roles/run.admin` if invoker is insufficient for `jobs.run()`
   - Document required permissions in .env.example or README

4. Update `.env.example`
   - Add `REM_MODE` (scheduler|worker)
   - Add `JOB_ID` (worker mode only)
   - Add `GCP_PROJECT_ID` and `GCP_REGION` (for Admin API calls)
   - Add `WORKER_JOB_NAME` (Cloud Run Job name for worker)

5. Update `ConfigService`
   - Add GCP config section for project ID, region, worker job name
   - These are required in scheduler mode, optional in worker mode

6. Update Dockerfile if needed
   - No changes expected — same image, mode driven by env vars

---

## Verification

- [ ] Cloud Scheduler configured for daily cron
- [ ] Scheduler job deployed with `REM_MODE=scheduler`
- [ ] Worker job deployed and triggerable via Admin API
- [ ] IAM permissions allow scheduler to invoke worker job
- [ ] Secrets wired to both scheduler and worker jobs
- [ ] `.env.example` updated with new vars
- [ ] `npm run deploy -- --env=e1` deploys both jobs
