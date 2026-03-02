# Task 3: Entry Point & RemService Integration

**Milestone**: [M1 - Cloud Run Job](../../milestones/milestone-1-cloud-run-job.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 2: ConfigService & Secrets](task-2-config-service.md)
**Status**: Completed

---

## Objective

Implement the main entry point (`src/index.ts`) that initializes connections, calls remember-core's RemService, and exits with appropriate status codes.

---

## Context

This is the core of the job — but it's intentionally thin. All business logic (memory selection, clustering, dedup, Haiku validation, relationship CRUD) lives in remember-core's RemService. The entry point is pure orchestration:

1. Initialize ConfigService (validates secrets)
2. Initialize Weaviate client
3. Initialize Firestore
4. Create RemService instance
5. Call `remService.processNextCollection()` (or similar)
6. Exit 0 on success, 1 on failure

---

## Steps

### 1. Create Entry Point

`src/index.ts`:

```typescript
async function main(): Promise<void> {
  // 1. Load config (fail-fast)
  const config = new ConfigService();

  // 2. Initialize Weaviate
  await initWeaviateClient(config.weaviateConfig);

  // 3. Initialize Firestore
  initFirestore(config.firebaseConfig);

  // 4. Create RemService
  const remService = new RemService({
    anthropicApiKey: config.anthropicConfig.apiKey,
    logger: createLogger(config.appConfig.logLevel),
  });

  // 5. Run REM cycle
  await remService.processNextCollection();
}

main()
  .then(() => {
    console.log('REM cycle complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('REM cycle failed:', err);
    process.exit(1);
  });
```

### 2. Handle RemService API

Adapt to whatever API remember-core exposes. The entry point should:
- Pass initialized Weaviate client, Firestore, and Anthropic config
- Handle the case where no collections need processing (still exit 0)
- Log start/end timestamps and collection processed

### 3. Add Structured Logging

Log key events for Cloud Logging visibility:
- Job started (timestamp, config summary — no secrets)
- Collection selected (or "no collections to process")
- Cycle result (relationships created/updated/skipped)
- Job completed (duration)

---

## Verification

- [x] Entry point compiles and runs
- [x] Exits 0 on successful cycle
- [x] Exits 1 on error (with error logged)
- [x] Exits 0 when no collections to process (stub returns empty result)
- [x] Logs are structured and visible (uses remember-core createLogger)
- [x] No secrets logged

---

## Notes

- If RemService is not yet available in remember-core, implement against the expected interface and stub the import. The entry point structure won't change.
- The RemService API shape will be determined by the remember-core implementation. This task should adapt to whatever API is exposed.

---

**Next Task**: [Task 4: Dockerfile & Cloud Build](task-4-docker-cloud-build.md)
**Related Design Docs**: [REM Background Relationships](../../design/local.rem-background-relationships.md), [GCP Execution Environment](../../design/local.gcp-execution-environment.md)
