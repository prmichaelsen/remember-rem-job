/**
 * Worker mode: picks up a job by JOB_ID and runs RemJobWorker.
 */

import type { ConfigService } from './config/config.service.js';
import type { Logger } from '@prmichaelsen/remember-core';
import type { JobService } from '@prmichaelsen/remember-core/services';
import type { RemService } from '@prmichaelsen/remember-core/rem';

export interface WorkerDeps {
  config: ConfigService;
  jobService: JobService;
  remService: RemService;
  logger: Logger;
}

export async function runWorker(_deps: WorkerDeps): Promise<void> {
  // TODO: Implement in Task 9
  // 1. Read JOB_ID from config
  // 2. Fetch job record from Firestore
  // 3. Run RemJobWorker.execute(jobId, params)
  throw new Error('Worker mode not yet implemented (Task 9)');
}
