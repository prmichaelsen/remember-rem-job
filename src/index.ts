/**
 * remember-rem-job entry point.
 *
 * Thin Cloud Run Job wrapper: initializes infrastructure,
 * creates RemService, runs one cycle, exits.
 */

import { ConfigService } from './config/config.service.js';
import {
  initWeaviateClient,
  getWeaviateClient,
} from '@prmichaelsen/remember-core/database/weaviate';
import { initFirestore } from '@prmichaelsen/remember-core/database/firestore';
import { createLogger, RelationshipService } from '@prmichaelsen/remember-core';
import type { LogLevel } from '@prmichaelsen/remember-core';

// TODO: Replace with @prmichaelsen/remember-core/rem once 0.17.0+ is published
import {
  RemService,
  RemStateStore,
  createHaikuClient,
} from './stubs/rem.js';

async function main(): Promise<void> {
  // 1. Load config (fail-fast on missing env vars)
  const config = new ConfigService();
  const logger = createLogger(config.appConfig.logLevel as LogLevel);

  logger.info('remember-rem-job starting', {
    nodeEnv: config.appConfig.nodeEnv,
    logLevel: config.appConfig.logLevel,
  });

  // 2. Initialize Weaviate
  await initWeaviateClient({
    url: config.weaviateConfig.restUrl,
    apiKey: config.weaviateConfig.apiKey,
  });
  const weaviateClient = getWeaviateClient();
  logger.info('Weaviate client initialized');

  // 3. Initialize Firestore
  initFirestore({
    serviceAccount: config.firebaseConfig.serviceAccountKey,
    projectId: config.firebaseConfig.projectId,
  });
  logger.info('Firestore initialized');

  // 4. Create RemService dependencies
  const stateStore = new RemStateStore();
  const haikuClient = createHaikuClient({
    apiKey: config.anthropicConfig.apiKey,
  });

  const relationshipServiceFactory = (collection: any, userId: string) =>
    new RelationshipService(collection, userId, logger);

  // 5. Create RemService and run cycle
  const remService = new RemService({
    weaviateClient,
    relationshipServiceFactory,
    stateStore,
    haikuClient,
    logger,
  });

  const result = await remService.runCycle();

  // 6. Log results
  logger.info('REM cycle complete', {
    collection: result.collection_id ?? 'none',
    memoriesScanned: result.memories_scanned,
    clustersFound: result.clusters_found,
    relationshipsCreated: result.relationships_created,
    relationshipsMerged: result.relationships_merged,
    relationshipsSplit: result.relationships_split,
    skippedByHaiku: result.skipped_by_haiku,
    durationMs: result.duration_ms,
  });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('remember-rem-job failed:', err);
    process.exit(1);
  });
