# Milestone 1: Cloud Run Job

**Goal**: Ship a working Cloud Run Job that calls remember-core's RemService on an hourly schedule
**Duration**: 1-2 weeks
**Dependencies**: remember-core RemService (in progress in sibling project)
**Status**: Not Started

---

## Overview

This is the sole milestone for remember-rem-job. The project is a thin deployment wrapper around remember-core's `RemService`, which encapsulates all business logic (memory selection, clustering, deduplication, Haiku validation, relationship CRUD). This milestone covers everything from project scaffolding to a deployed, scheduled Cloud Run Job.

---

## Deliverables

### 1. TypeScript Project
- package.json with remember-core dependency
- tsconfig.json, build config
- src/ with entry point and config service

### 2. Configuration & Secrets
- ConfigService with fail-fast validation (pattern from remember-rest-service)
- .env.example with all required variables
- fetch-secrets.sh script for local development
- GCP Secret Manager entries created

### 3. Docker Container
- Multi-stage Dockerfile (build → production)
- Cloud Build config (cloudbuild.yaml, cloudbuild.e1.yaml)

### 4. Cloud Run Job Deployment
- Cloud Run Job deployed to GCP
- Cloud Scheduler trigger (hourly)
- Secret Manager integration via --update-secrets

### 5. Operational Readiness
- Successful end-to-end run on e1 environment
- Logging via Cloud Logging (stdout/stderr)
- Exit codes: 0 = success, 1 = failure

---

## Success Criteria

- [ ] `npm run build` compiles without errors
- [ ] Docker image builds successfully
- [ ] ConfigService validates all required secrets at startup
- [ ] Entry point calls RemService.processNextCollection() and exits cleanly
- [ ] Cloud Run Job deploys to e1 environment
- [ ] Cloud Scheduler triggers job successfully
- [ ] Job completes a full REM cycle on a test collection
- [ ] Logs visible in Cloud Logging

---

## Key Files to Create

```
remember-rem-job/
├── package.json
├── tsconfig.json
├── Dockerfile
├── cloudbuild.yaml
├── cloudbuild.e1.yaml
├── .env.example
├── scripts/
│   └── fetch-e1-secrets.sh
└── src/
    ├── index.ts              # Entry point: load cursor → RemService → save cursor → exit
    └── config/
        ├── config.service.ts  # Env var loading + validation
        └── config.types.ts    # Config interfaces
```

---

## Tasks

1. [Task 1: Project Scaffold](../tasks/milestone-1-cloud-run-job/task-1-project-scaffold.md) - TypeScript project, dependencies, build config
2. [Task 2: ConfigService & Secrets](../tasks/milestone-1-cloud-run-job/task-2-config-service.md) - Environment config, secret management, fetch script
3. [Task 3: Entry Point & RemService Integration](../tasks/milestone-1-cloud-run-job/task-3-entry-point.md) - Main entry point calling remember-core RemService
4. [Task 4: Dockerfile & Cloud Build](../tasks/milestone-1-cloud-run-job/task-4-docker-cloud-build.md) - Container image, Cloud Build pipelines
5. [Task 5: Cloud Run Job & Scheduler](../tasks/milestone-1-cloud-run-job/task-5-cloud-run-deploy.md) - Deploy job, configure scheduler, wire secrets
6. [Task 6: E2E Verification](../tasks/milestone-1-cloud-run-job/task-6-e2e-verification.md) - End-to-end test on e1, logging, monitoring

---

## Environment Variables

```env
# Weaviate (shared with remember-rest-service)
WEAVIATE_REST_URL=
WEAVIATE_GRPC_URL=
WEAVIATE_API_KEY=

# Firebase/Firestore (shared)
FIREBASE_PROJECT_ID=
FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY=

# Embeddings (shared)
EMBEDDINGS_PROVIDER=
EMBEDDINGS_MODEL=
EMBEDDINGS_API_KEY=

# Anthropic (new — for Haiku cluster validation)
ANTHROPIC_API_KEY=

# Optional
LOG_LEVEL=info
NODE_ENV=production
```

---

## Testing Requirements

- [ ] ConfigService unit tests (required secrets validated, missing throws)
- [ ] Entry point integration test (mock RemService, verify orchestration)
- [ ] Docker image builds and starts successfully

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| RemService not ready in remember-core | High | Medium | Can stub/mock RemService interface; implement entry point against interface |
| Secret Manager permissions | Medium | Low | Follow remember-rest-service's proven IAM setup |
| Cloud Scheduler overlap with running job | Medium | Low | Document in design; Firestore cursor locking in RemService |

---

**Next Milestone**: None (single milestone project)
**Blockers**: remember-core RemService implementation (can work in parallel with stub)
**Notes**: Most secrets are shared with remember-rest-service — reuse existing Secret Manager entries where possible. Only ANTHROPIC_API_KEY is new.
