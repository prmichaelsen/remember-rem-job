/**
 * Worker mode: picks up a job by JOB_ID and runs RemJobWorker.
 *
 * For user collections, also discovers ghost composite IDs and runs
 * additional per-ghost REM cycles with tag filters.
 */

import type { WeaviateClient } from 'weaviate-client';
import type { ConfigService } from './config/config.service.js';
import type { Logger } from '@prmichaelsen/remember-core';
import type { JobService } from '@prmichaelsen/remember-core/services';
import type { RemService } from '@prmichaelsen/remember-core/rem';
import { RemJobWorker } from '@prmichaelsen/remember-core/services';
import type { RemJobParams } from '@prmichaelsen/remember-core/services';
import {
  extractUserIdFromCollection,
  discoverGhostCompositeIds,
} from './ghost-discovery.js';

export interface WorkerDeps {
  config: ConfigService;
  jobService: JobService;
  remService: RemService;
  remServiceFactory: (ghostCompositeId: string) => RemService;
  weaviateClient: WeaviateClient;
  logger: Logger;
}

export async function runWorker(deps: WorkerDeps): Promise<void> {
  const { config, jobService, remService, remServiceFactory, weaviateClient, logger } = deps;
  const jobId = config.appConfig.jobId!;

  // 1. Fetch job record
  const job = await jobService.getStatus(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (job.status !== 'pending') {
    logger.warn('Job is not in pending status, skipping', {
      jobId,
      status: job.status,
    });
    return;
  }

  const params = job.params as unknown as RemJobParams;
  if (!params.collection_id) {
    throw new Error(`Job ${jobId} missing collection_id in params`);
  }

  const collectionId = params.collection_id;

  logger.info('Starting worker for job', { jobId, collectionId });

  // 2. Execute primary REM cycle via RemJobWorker (handles job status tracking)
  const worker = new RemJobWorker(jobService, remService, logger);
  await worker.execute(jobId, params);

  logger.info('Primary REM cycle complete', { jobId, collectionId });

  // 3. Run per-ghost REM cycles for user collections
  const userId = extractUserIdFromCollection(collectionId);
  if (userId) {
    const ghostIds = await discoverGhostCompositeIds(weaviateClient, collectionId, logger);

    if (ghostIds.length > 0) {
      logger.info('Running ghost-scoped REM cycles', {
        jobId,
        collectionId,
        ghostCount: ghostIds.length,
        ghostIds,
      });

      for (const ghostCompositeId of ghostIds) {
        logger.info('Starting ghost REM cycle', {
          jobId,
          collectionId,
          ghostCompositeId,
        });

        try {
          const ghostRemService = remServiceFactory(ghostCompositeId);
          // runCycle() will accept tagFilter once remember-core adds support
          await (ghostRemService as any).runCycle({ collectionId, tagFilter: [ghostCompositeId] });

          logger.info('Ghost REM cycle complete', {
            jobId,
            collectionId,
            ghostCompositeId,
          });
        } catch (err: any) {
          logger.error('Ghost REM cycle failed', {
            jobId,
            collectionId,
            ghostCompositeId,
            error: err.message,
          });
          // Continue with remaining ghosts — don't fail the entire job
        }
      }
    }
  }

  logger.info('Worker complete', { jobId, collectionId });
}
