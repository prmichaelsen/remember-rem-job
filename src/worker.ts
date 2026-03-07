/**
 * Worker mode: picks up a job by JOB_ID and runs RemJobWorker.
 */

import type { ConfigService } from './config/config.service.js';
import type { Logger } from '@prmichaelsen/remember-core';
import type { JobService } from '@prmichaelsen/remember-core/services';
import type { RemService } from '@prmichaelsen/remember-core/rem';
import { RemJobWorker } from '@prmichaelsen/remember-core/services';
import type { RemJobParams } from '@prmichaelsen/remember-core/services';

export interface WorkerDeps {
  config: ConfigService;
  jobService: JobService;
  remService: RemService;
  logger: Logger;
}

export async function runWorker(deps: WorkerDeps): Promise<void> {
  const { config, jobService, remService, logger } = deps;
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

  logger.info('Starting worker for job', {
    jobId,
    collectionId: params.collection_id,
  });

  // 2. Execute via RemJobWorker (handles progress, steps, completion)
  const worker = new RemJobWorker(jobService, remService, logger);
  await worker.execute(jobId, params);

  logger.info('Worker complete', { jobId, collectionId: params.collection_id });
}
