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
import {
  RemService,
  RemStateStore,
  createHaikuClient,
} from '@prmichaelsen/remember-core/rem';

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

  // 5. Create RemService
  const remService = new RemService({
    weaviateClient,
    relationshipServiceFactory,
    stateStore,
    haikuClient,
    logger,
    config: {
      max_candidates_per_run: 5000, // Large batch size increases odds of finding related memories
    },
  });

  // 6. Run 30 cycles per Cloud Run execution
  const cycles = 30;
  const aggregateStats = {
    collections_processed: new Set<string>(),
    memories_scanned: 0,
    clusters_found: 0,
    relationships_created: 0,
    relationships_merged: 0,
    relationships_split: 0,
    skipped_by_haiku: 0,
    total_duration_ms: 0,
  };

  logger.info('Starting REM batch', { cycles });

  for (let i = 0; i < cycles; i++) {
    const result = await remService.runCycle();

    if (result.collection_id) {
      aggregateStats.collections_processed.add(result.collection_id);
    }
    aggregateStats.memories_scanned += result.memories_scanned;
    aggregateStats.clusters_found += result.clusters_found;
    aggregateStats.relationships_created += result.relationships_created;
    aggregateStats.relationships_merged += result.relationships_merged;
    aggregateStats.relationships_split += result.relationships_split;
    aggregateStats.skipped_by_haiku += result.skipped_by_haiku;
    aggregateStats.total_duration_ms += result.duration_ms;

    logger.debug('REM cycle completed', {
      cycle: i + 1,
      collection: result.collection_id ?? 'none',
      memoriesScanned: result.memories_scanned,
      clustersFound: result.clusters_found,
    });

    // Early exit if no collection to process
    if (!result.collection_id) {
      logger.info('No more collections to process, stopping early', { cycle: i + 1 });
      break;
    }
  }

  // 7. Log aggregate results
  logger.info('REM batch complete', {
    cycles_executed: cycles,
    collections_processed: Array.from(aggregateStats.collections_processed),
    memoriesScanned: aggregateStats.memories_scanned,
    clustersFound: aggregateStats.clusters_found,
    relationshipsCreated: aggregateStats.relationships_created,
    relationshipsMerged: aggregateStats.relationships_merged,
    relationshipsSplit: aggregateStats.relationships_split,
    skippedByHaiku: aggregateStats.skipped_by_haiku,
    totalDurationMs: aggregateStats.total_duration_ms,
    avgDurationPerCycleMs: Math.round(aggregateStats.total_duration_ms / cycles),
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
