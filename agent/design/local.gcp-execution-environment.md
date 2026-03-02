# GCP Execution Environment

**Concept**: Cloud Run Jobs as the execution environment for REM, triggered hourly by Cloud Scheduler
**Created**: 2026-03-02
**Status**: Design Specification

---

## Overview

This document specifies the GCP execution environment for REM. The core decision is to use **Cloud Run Jobs** (not Cloud Run Services or Cloud Functions) triggered by **Cloud Scheduler** on an hourly cron. This choice is driven by REM's run-to-completion nature and potential for long execution times (up to 50 minutes per cycle).

---

## Problem Statement

- **Long execution times**: A single REM cycle processes an entire collection — selecting candidates, running vector similarity searches, clustering, deduplicating, validating with Haiku, and performing relationship CRUD. For large collections (thousands of memories), this can take up to 50 minutes.
- **No HTTP response needed**: REM is a background batch process with no caller waiting for a response. An HTTP service model (request → response) is a poor fit.
- **Cost sensitivity**: REM runs hourly but should only be billed for actual compute time, not idle capacity.

---

## Solution

**Cloud Run Jobs** triggered by **Cloud Scheduler**.

| Component | Service | Role |
|-----------|---------|------|
| Scheduler | GCP Cloud Scheduler | Hourly cron trigger (`0 * * * *`) |
| Executor | GCP Cloud Run Jobs | Run-to-completion container execution |

**Alternatives considered:**

| Service | Max Duration | Why Rejected |
|---------|-------------|--------------|
| Cloud Functions (event-driven) | 9 min | Far too short for 50-min cycles |
| Cloud Functions (HTTP) | 60 min | Requires holding HTTP connection open; awkward for batch work |
| Cloud Run Services (HTTP) | 60 min | Designed for request/response; requires exposing an endpoint; timeout is per-request |
| **Cloud Run Jobs** | **168 hours** (configurable) | Purpose-built for run-to-completion tasks |

---

## Implementation

### Cloud Run Job Configuration

```yaml
# Deployment configuration
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: remember-rem
spec:
  template:
    spec:
      taskCount: 1
      template:
        spec:
          containers:
            - image: gcr.io/{PROJECT_ID}/remember-rem:latest
              resources:
                limits:
                  memory: "1Gi"
                  cpu: "1"
          timeoutSeconds: 3000  # 50 minutes
          maxRetries: 1
```

### Key Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Task timeout | 3000s (50 min) | Cap per the design spec; prevents runaway jobs |
| Task count | 1 | Single task per execution (one collection per run) |
| Max retries | 1 | Retry once on failure; avoids duplicate relationship creation on repeated retries |
| Memory | 1Gi | Sufficient for loading candidate memories and clustering in-memory |
| CPU | 1 | CPU-bound during clustering; 1 vCPU is adequate |

### Cloud Scheduler Configuration

```
Schedule: 0 * * * * (every hour)
Target: Cloud Run Job (remember-rem)
Timezone: UTC
Retry config: 0 retries (if the trigger fails, wait for next hour)
```

### Entry Point

The container runs a single TypeScript entry point that:

1. Loads `rem_cursor` state from Firestore
2. Picks the next collection via `startAfter`
3. Executes the REM cycle (select → cluster → dedup → validate → CRUD)
4. Saves updated cursor state
5. Exits with code 0 (success) or 1 (failure)

```typescript
// src/index.ts
async function main(): Promise<void> {
  const cursor = await loadRemCursor();
  const collection = await pickNextCollection(cursor);

  if (!collection) {
    console.log('No collections to process');
    return;
  }

  await processCollection(collection);
  await saveRemCursor(cursor);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('REM cycle failed:', err);
    process.exit(1);
  });
```

### Container Image

- **Base**: Node.js 22 Alpine
- **Build**: TypeScript compiled to ESM (`tsc` → `dist/`)
- **Registry**: GCR or Artifact Registry
- **Deployment**: `gcloud run jobs deploy` or Terraform

---

## Benefits

- **No HTTP gymnastics**: Jobs run to completion and exit — no need to hold open an HTTP connection or return a response before timeout
- **Built-in retries**: Configurable retry policy per task if a run fails
- **Clean billing**: Only billed while the job is running, no idle instances
- **First-class Cloud Scheduler integration**: Direct trigger support without exposing an HTTP endpoint
- **Generous timeout**: Up to 168 hours (we need 50 min); no risk of hitting platform limits
- **Simple mental model**: Start → process → exit. No request handling, no routing, no middleware

---

## Trade-offs

- **Cold start**: Each run starts a fresh container (~2-5s for Node.js Alpine). Acceptable for an hourly job.
- **No persistent connections**: Weaviate and Firestore clients must be initialized each run. Acceptable — connection setup is fast.
- **Logging**: Must use Cloud Logging (stdout/stderr) rather than a persistent log store. Acceptable — standard GCP practice.
- **No concurrent runs**: If a job overruns into the next hour, Cloud Scheduler may trigger a second instance. Mitigation: use Firestore cursor locking or Cloud Scheduler's `attemptDeadline` to prevent overlap.

---

## Dependencies

- **GCP Cloud Run Jobs**: Execution environment
- **GCP Cloud Scheduler**: Hourly cron trigger
- **GCP Artifact Registry / GCR**: Container image storage
- **GCP IAM**: Service account with permissions for Firestore, Weaviate, Anthropic API
- **Docker**: Container build

---

## Testing Strategy

- **Local**: Run the container locally with `docker run` against dev Weaviate/Firestore
- **Staging**: Deploy to a staging Cloud Run Job with manual trigger (`gcloud run jobs execute`)
- **Integration**: Verify Cloud Scheduler → Cloud Run Job trigger chain works end-to-end
- **Timeout**: Test with a large collection to verify the 50-min timeout is sufficient
- **Overlap prevention**: Verify that concurrent triggers don't cause duplicate processing

---

## Migration Path

N/A — greenfield deployment. No existing infrastructure to migrate from.

1. Build Docker image with REM service
2. Push to Artifact Registry
3. Deploy Cloud Run Job
4. Configure Cloud Scheduler trigger
5. Monitor first week of runs

---

## Future Considerations

- **Concurrency**: If collection count grows significantly, could increase `taskCount` to process multiple collections per run (requires cursor partitioning)
- **GPU**: If clustering algorithm becomes more compute-intensive, Cloud Run Jobs supports GPU (with 1-hour max timeout for GPU tasks)
- **Alerting**: Cloud Monitoring alerts on job failure, timeout, or high Haiku API costs
- **Manual trigger**: Admin endpoint or CLI command to trigger REM for a specific collection on-demand

---

**Status**: Design Specification
**Recommendation**: Use this as the infrastructure blueprint when implementing the deployment milestone.
**Related Documents**: [local.rem-background-relationships.md](local.rem-background-relationships.md)
