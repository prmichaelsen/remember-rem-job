# Task 4: Dockerfile & Cloud Build

**Milestone**: [M1 - Cloud Run Job](../../milestones/milestone-1-cloud-run-job.md)
**Estimated Time**: 2 hours
**Dependencies**: [Task 3: Entry Point & RemService Integration](task-3-entry-point.md)
**Status**: Not Started

---

## Objective

Create a multi-stage Dockerfile and Cloud Build configuration files for building and deploying the container image.

---

## Context

Follows the same pattern as remember-rest-service: multi-stage Docker build (builder → production), Cloud Build for CI/CD, separate configs for e1 and production.

Key difference: this is a job, not a service — no EXPOSE, no HEALTHCHECK, just `CMD ["node", "dist/index.js"]`.

---

## Steps

### 1. Create Dockerfile

Multi-stage build:

```dockerfile
# Stage 1: Builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
```

No secrets in image. No EXPOSE (not a service). No HEALTHCHECK (job runs to completion).

### 2. Create cloudbuild.e1.yaml

E1 (staging) Cloud Build config:
- Build Docker image
- Push to GCR/Artifact Registry
- Deploy as Cloud Run Job with `--update-secrets`
- Map each env var to `remember-e1-{name}:latest`

### 3. Create cloudbuild.yaml

Production Cloud Build config:
- Same structure as e1 but with production secret names (`remember-{name}`)
- Production Cloud Run Job name: `remember-rem-job`

### 4. Create .dockerignore

Exclude: node_modules, .git, agent/, .claude/, .env*, tests/, *.md

---

## Verification

- [ ] `docker build .` succeeds locally
- [ ] Container starts and exits cleanly with mock env vars
- [ ] cloudbuild.e1.yaml has correct secret mappings
- [ ] cloudbuild.yaml has correct secret mappings
- [ ] .dockerignore excludes unnecessary files
- [ ] Image size is reasonable (< 200MB)

---

**Next Task**: [Task 5: Cloud Run Job & Scheduler](task-5-cloud-run-deploy.md)
**Related Design Docs**: [GCP Execution Environment](../../design/local.gcp-execution-environment.md)
