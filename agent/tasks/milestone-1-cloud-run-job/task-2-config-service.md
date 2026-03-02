# Task 2: ConfigService & Secrets

**Milestone**: [M1 - Cloud Run Job](../../milestones/milestone-1-cloud-run-job.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 1: Project Scaffold](task-1-project-scaffold.md)
**Status**: Not Started

---

## Objective

Implement a ConfigService that loads and validates environment variables at startup, create .env.example, and write a fetch-secrets script for local development.

---

## Context

Follows the proven pattern from remember-rest-service: fail-fast validation, typed config accessors, GCP Secret Manager in production, .env files in development. REM shares most secrets with the rest service (Weaviate, Firestore, embeddings) plus one new secret (ANTHROPIC_API_KEY).

---

## Steps

### 1. Create Config Types

`src/config/config.types.ts` — interfaces for each config group:
- WeaviateConfig (restUrl, grpcUrl, apiKey)
- FirebaseConfig (projectId, serviceAccountKey)
- EmbeddingsConfig (provider, model, apiKey)
- AnthropicConfig (apiKey)
- AppConfig (nodeEnv, logLevel)

### 2. Create ConfigService

`src/config/config.service.ts`:
- Load from `process.env`
- `getRequired(key)` — throws if missing
- `get(key, default)` — returns default if missing
- Typed accessors: `weaviateConfig`, `firebaseConfig`, `embeddingsConfig`, `anthropicConfig`
- Validate all required secrets on construction

### 3. Create .env.example

Document all required and optional environment variables with placeholder values.

### 4. Create fetch-e1-secrets.sh

`scripts/fetch-e1-secrets.sh`:
- Uses `gcloud secrets versions access` to fetch from Secret Manager
- Naming convention: `remember-e1-{secret-name}`
- Outputs to `.env.e1.local`
- Reuse existing secrets where possible (Weaviate, Firestore, embeddings)
- New secret: `remember-e1-anthropic-api-key`

### 5. Write Unit Tests

Test ConfigService:
- Required secrets validated on construction
- Missing required secrets throw
- Defaults applied for optional config

---

## Verification

- [ ] ConfigService loads all env vars correctly
- [ ] Missing required secrets throw descriptive errors at startup
- [ ] .env.example documents all variables
- [ ] fetch-e1-secrets.sh runs and produces valid .env file
- [ ] Unit tests pass

---

**Next Task**: [Task 3: Entry Point & RemService Integration](task-3-entry-point.md)
**Related Design Docs**: [GCP Execution Environment](../../design/local.gcp-execution-environment.md)
