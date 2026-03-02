# Task 6: E2E Verification

**Milestone**: [M1 - Cloud Run Job](../../milestones/milestone-1-cloud-run-job.md)
**Estimated Time**: 1-2 hours
**Dependencies**: [Task 5: Cloud Run Job & Scheduler](task-5-cloud-run-deploy.md)
**Status**: Not Started

---

## Objective

Verify the complete pipeline works end-to-end on the e1 environment: scheduler triggers job, job processes a collection, relationships are created in Weaviate.

---

## Context

This is the acceptance test for the milestone. By this point everything is deployed — this task confirms the full chain works: Cloud Scheduler → Cloud Run Job → RemService → Weaviate relationships created.

---

## Steps

### 1. Ensure Test Data Exists

Verify there's at least one collection in e1 with >= 50 memories (the minimum collection size from the design spec). If not, note which collections are available and adjust expectations.

### 2. Trigger a Full Cycle

Either wait for Cloud Scheduler or manually execute:

```bash
gcloud run jobs execute remember-rem-job-e1 --region=us-central1 --project=com-f5-parm
```

### 3. Verify Logs

Check Cloud Logging for the job execution:
- Job started log with timestamp
- Collection selected (or "no eligible collections")
- Cluster discovery results
- Haiku validation calls
- Relationships created/updated/skipped
- Job completed with duration

### 4. Verify Relationships Created

Query Weaviate to confirm new relationships were created with `source: 'rem'` (once the schema migration is in place in remember-core).

### 5. Verify Cursor State

Check Firestore `rem_state/cursor` document:
- `last_collection_id` updated
- `last_run_at` reflects the run timestamp

### 6. Verify Idempotency

Run the job again. Confirm:
- Moves to next collection (cursor advanced)
- Does not duplicate relationships from previous run
- Dedup logic works (60% overlap check)

---

## Verification

- [ ] Full REM cycle completes without errors
- [ ] Relationships visible in Weaviate with correct metadata
- [ ] Firestore cursor state updated
- [ ] Cloud Logging shows structured output
- [ ] Second run advances cursor, no duplicates
- [ ] Job exits 0

---

## Notes

- This task may reveal issues with the RemService in remember-core — log any bugs found and create issues in that project
- If no collections meet the 50-memory minimum, test with a smaller threshold or seed test data
- Document any manual steps needed for future debugging

---

**Next Task**: None (milestone complete)
**Related Design Docs**: [REM Background Relationships](../../design/local.rem-background-relationships.md)
