# Task 5: Cloud Run Job & Scheduler

**Milestone**: [M1 - Cloud Run Job](../../milestones/milestone-1-cloud-run-job.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 4: Dockerfile & Cloud Build](task-4-docker-cloud-build.md)
**Status**: Completed

---

## Objective

Deploy the Cloud Run Job to GCP, create the ANTHROPIC_API_KEY secret in Secret Manager, and configure Cloud Scheduler for hourly execution.

---

## Context

Most secrets already exist in Secret Manager from remember-rest-service (Weaviate, Firestore, embeddings). Only ANTHROPIC_API_KEY needs to be created. The job deploys via Cloud Build, and Cloud Scheduler triggers it hourly.

---

## Steps

### 1. Create New Secret in Secret Manager

```bash
# E1
echo -n "sk-ant-..." | gcloud secrets create remember-e1-anthropic-api-key \
  --data-file=- --project=com-f5-parm

# Production
echo -n "sk-ant-..." | gcloud secrets create remember-anthropic-api-key \
  --data-file=- --project=com-f5-parm
```

### 2. Submit Cloud Build (E1)

```bash
gcloud builds submit --config=cloudbuild.e1.yaml --project=com-f5-parm
```

Verify:
- Image pushed to registry
- Cloud Run Job created: `remember-rem-job-e1`
- Secrets mapped correctly

### 3. Test Manual Execution

```bash
gcloud run jobs execute remember-rem-job-e1 --region=us-central1 --project=com-f5-parm
```

Verify job starts, runs, and exits 0.

### 4. Configure Cloud Scheduler (E1)

```bash
gcloud scheduler jobs create http remember-rem-job-e1-trigger \
  --schedule="0 * * * *" \
  --uri="https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/com-f5-parm/jobs/remember-rem-job-e1:run" \
  --http-method=POST \
  --oauth-service-account-email=<SERVICE_ACCOUNT>@com-f5-parm.iam.gserviceaccount.com \
  --location=us-central1 \
  --project=com-f5-parm
```

### 5. Verify Scheduled Trigger

Wait for next scheduled execution or trigger manually via Cloud Scheduler UI. Confirm:
- Scheduler fires
- Job starts
- Job completes successfully
- Logs visible in Cloud Logging

---

## Verification

- [ ] ANTHROPIC_API_KEY secret created in Secret Manager (e1) — manual step
- [ ] Cloud Build succeeds for e1 — run `npm run deploy:e1`
- [ ] Cloud Run Job visible in GCP console
- [ ] Manual `gcloud run jobs execute` succeeds — run `npm run deploy:e1 -- --execute`
- [ ] Cloud Scheduler trigger created — automated by deploy script
- [ ] Scheduled execution completes successfully
- [ ] All secrets injected correctly (no "missing env var" errors)

> **Note**: Deploy script created at `scripts/deploy-e1.ts`. Run `npm run deploy:e1` to execute.
> Manual prerequisite: create the ANTHROPIC_API_KEY secret first.

---

## Notes

- Service account needs roles: `roles/run.invoker` (for Scheduler), `roles/secretmanager.secretAccessor` (for secrets)
- Reuse existing secrets from remember-rest-service where possible — same Weaviate, Firestore, embeddings entries
- Cloud Scheduler job name should match convention: `remember-rem-job-{env}-trigger`

---

**Next Task**: [Task 6: E2E Verification](task-6-e2e-verification.md)
**Related Design Docs**: [GCP Execution Environment](../../design/local.gcp-execution-environment.md)
