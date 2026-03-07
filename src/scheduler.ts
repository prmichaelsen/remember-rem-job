/**
 * Scheduler mode: enumerates collections, creates job records,
 * triggers worker Cloud Run Job executions via Admin API.
 */

import type { WeaviateClient } from 'weaviate-client';
import type { ConfigService } from './config/config.service.js';
import type { Logger } from '@prmichaelsen/remember-core';
import type { JobService } from '@prmichaelsen/remember-core/services';

export interface SchedulerDeps {
  config: ConfigService;
  jobService: JobService;
  weaviateClient: WeaviateClient;
  logger: Logger;
}

const MIN_COLLECTION_SIZE = 50;

/**
 * Enumerate Weaviate Memory collections eligible for REM processing.
 * Filters out collections below the minimum size threshold.
 */
async function getEligibleCollections(
  weaviateClient: WeaviateClient,
  logger: Logger,
): Promise<string[]> {
  const allCollections = await weaviateClient.collections.listAll();
  const eligible: string[] = [];

  for (const collection of allCollections) {
    const name = collection.name;
    if (!name.startsWith('Memory_')) continue;

    const col = weaviateClient.collections.get(name);
    const { totalCount } = await col.aggregate.overAll();

    if (totalCount < MIN_COLLECTION_SIZE) {
      logger.debug('Skipping small collection', { collection: name, count: totalCount });
      continue;
    }

    logger.info('Eligible collection', { collection: name, count: totalCount });
    eligible.push(name);
  }

  return eligible;
}

/**
 * Get an access token for calling GCP APIs.
 * In Cloud Run, uses the metadata server. Locally, falls back to gcloud CLI.
 */
async function getAccessToken(): Promise<string> {
  // Try metadata server first (Cloud Run environment)
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (res.ok) {
      const data = (await res.json()) as { access_token: string };
      return data.access_token;
    }
  } catch {
    // Not in Cloud Run, fall through to gcloud
  }

  // Fallback: gcloud CLI (local development)
  const { execSync } = await import('child_process');
  const token = execSync('gcloud auth print-access-token', { encoding: 'utf-8' }).trim();
  return token;
}

/**
 * Trigger a Cloud Run Job execution with JOB_ID and REM_MODE=worker overrides.
 */
async function triggerWorkerExecution(
  jobId: string,
  gcpProject: string,
  gcpRegion: string,
  workerJobName: string,
  accessToken: string,
  logger: Logger,
): Promise<boolean> {
  const url = `https://run.googleapis.com/v2/projects/${gcpProject}/locations/${gcpRegion}/jobs/${workerJobName}:run`;

  const body = {
    overrides: {
      containerOverrides: [
        {
          env: [
            { name: 'REM_MODE', value: 'worker' },
            { name: 'JOB_ID', value: jobId },
          ],
        },
      ],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error('Failed to trigger worker', { jobId, status: res.status, body: text });
    return false;
  }

  logger.info('Triggered worker execution', { jobId });
  return true;
}

export async function runScheduler(deps: SchedulerDeps): Promise<void> {
  const { config, jobService, weaviateClient, logger } = deps;
  const { projectId, region, workerJobName } = config.gcpConfig;

  // 1. Enumerate eligible collections
  logger.info('Enumerating collections...');
  const collections = await getEligibleCollections(weaviateClient, logger);

  if (collections.length === 0) {
    logger.info('No collections eligible for REM processing');
    return;
  }

  // 2. Create job records and collect IDs
  logger.info('Creating job records...', { count: collections.length });
  const jobs: Array<{ id: string; collectionId: string }> = [];

  for (const collectionId of collections) {
    const job = await jobService.create({
      type: 'rem_cycle' as any,
      user_id: null as any,
      params: { collection_id: collectionId },
      ttl_hours: 24,
    });
    jobs.push({ id: job.id, collectionId });
  }

  logger.info('Created job records', { jobs_created: jobs.length });

  // 3. Get access token and trigger workers
  const accessToken = await getAccessToken();

  let triggered = 0;
  let failed = 0;

  for (const { id, collectionId } of jobs) {
    const success = await triggerWorkerExecution(
      id,
      projectId,
      region,
      workerJobName,
      accessToken,
      logger,
    );

    if (success) {
      triggered++;
    } else {
      failed++;
      logger.error('Failed to trigger worker for collection', { jobId: id, collectionId });
    }
  }

  logger.info('Scheduler complete', {
    collections_found: collections.length,
    jobs_created: jobs.length,
    workers_triggered: triggered,
    trigger_failures: failed,
  });
}
