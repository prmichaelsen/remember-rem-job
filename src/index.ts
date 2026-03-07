/**
 * remember-rem-job entry point.
 *
 * Dual-mode Cloud Run Job:
 * - REM_MODE=scheduler: Enumerates collections, creates job records, triggers worker executions
 * - REM_MODE=worker: Picks up a job by JOB_ID and runs RemJobWorker
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
import {
  JobService,
  createAnthropicSubLlm,
  EmotionalScoringService,
  ScoringContextService,
  ClassificationService,
  MoodService,
} from '@prmichaelsen/remember-core/services';
import { runScheduler } from './scheduler.js';
import { runWorker } from './worker.js';

export async function initInfrastructure(config: ConfigService) {
  const logger = createLogger(config.appConfig.logLevel as LogLevel);

  logger.info('remember-rem-job starting', {
    mode: config.appConfig.remMode,
    nodeEnv: config.appConfig.nodeEnv,
    logLevel: config.appConfig.logLevel,
  });

  // Initialize Weaviate
  await initWeaviateClient({
    url: config.weaviateConfig.restUrl,
    apiKey: config.weaviateConfig.apiKey,
  });
  const weaviateClient = getWeaviateClient();
  logger.info('Weaviate client initialized');

  // Initialize Firestore
  initFirestore({
    serviceAccount: config.firebaseConfig.serviceAccountKey,
    projectId: config.firebaseConfig.projectId,
  });
  logger.info('Firestore initialized');

  return { logger, weaviateClient };
}

async function main(): Promise<void> {
  const config = new ConfigService();
  const { logger, weaviateClient } = await initInfrastructure(config);

  const haikuClient = createHaikuClient({
    apiKey: config.anthropicConfig.apiKey,
  });

  const jobService = new JobService({ logger });
  const stateStore = new RemStateStore();

  const relationshipServiceFactory = (collection: any, userId: string) =>
    new RelationshipService(collection, userId, logger);

  // Sub-LLM for phases 4, 5, 6, 7, 9, 10
  const subLlm = createAnthropicSubLlm({ apiKey: config.anthropicConfig.apiKey });

  // Phase 0: Emotional scoring
  const emotionalScoringService = new EmotionalScoringService({ subLlm, logger });
  const scoringContextService = new ScoringContextService({ logger });

  // Phase 7: Classification
  const classificationService = new ClassificationService();

  // Phases 8-10: Mood (shared across ghost cycles, stateless)
  const moodService = new MoodService();

  const remService = new RemService({
    weaviateClient,
    relationshipServiceFactory,
    stateStore,
    haikuClient,
    logger,
    config: {
      max_candidates_per_run: 5000,
    },
    subLlm,
    emotionalScoringService,
    scoringContextService,
    classificationService,
  });

  switch (config.appConfig.remMode) {
    case 'scheduler':
      await runScheduler({ config, jobService, weaviateClient, logger });
      break;
    case 'worker':
      await runWorker({
        config,
        jobService,
        remService,
        remServiceFactory: (ghostCompositeId: string) =>
          new RemService({
            weaviateClient,
            relationshipServiceFactory,
            stateStore,
            haikuClient,
            logger,
            config: {
              max_candidates_per_run: 5000,
            },
            subLlm,
            emotionalScoringService,
            scoringContextService,
            classificationService,
            moodService,
            ghostCompositeId,
          }),
        weaviateClient,
        logger,
      });
      break;
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('remember-rem-job failed:', err);
    process.exit(1);
  });
