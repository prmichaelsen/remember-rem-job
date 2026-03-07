/**
 * Scheduler mode: enumerates collections, creates job records,
 * triggers worker Cloud Run Job executions via Admin API.
 */

import type { ConfigService } from './config/config.service.js';
import type { Logger } from '@prmichaelsen/remember-core';
import type { JobService } from '@prmichaelsen/remember-core/services';

export interface SchedulerDeps {
  config: ConfigService;
  jobService: JobService;
  weaviateClient: any;
  logger: Logger;
}

export async function runScheduler(_deps: SchedulerDeps): Promise<void> {
  // TODO: Implement in Task 8
  // 1. Enumerate collections via async generator
  // 2. Call scheduleRemJobs() to create Firestore job records
  // 3. Fan out: call Cloud Run Admin API per job with JOB_ID override
  throw new Error('Scheduler mode not yet implemented (Task 8)');
}
