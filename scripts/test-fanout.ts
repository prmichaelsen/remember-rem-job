/**
 * Test the fan-out REM architecture locally.
 *
 * Runs the scheduler (enumerate collections, create jobs) then optionally
 * executes workers for each created job — all in one process.
 *
 * Prerequisites:
 *   npm run fetch-secrets:e1
 *
 * Usage:
 *   npx tsx scripts/test-fanout.ts                        # dry-run: enumerate + create jobs, skip workers
 *   npx tsx scripts/test-fanout.ts --live                 # live: enumerate + create jobs + run workers
 *   npx tsx scripts/test-fanout.ts --live --batch=5       # live with small batch size
 *   npx tsx scripts/test-fanout.ts --env=prod             # use .env.prod.local
 *   npx tsx scripts/test-fanout.ts --env-file=.env.custom
 *
 * Options:
 *   --live                  Run workers after creating jobs (default: dry-run, skip workers)
 *   --batch=N               Max candidates per REM cycle (default: 10)
 *   --auto-approve=F        Auto-approve similarity threshold (default: 0.9)
 *   --similarity=F          Base similarity threshold (default: 0.75)
 *   --seed-count=N          LLM-enhanced seed count (default: 2)
 *   --env=ENV               Load .env.{ENV}.local (default: e1)
 *   --env-file=PATH         Load a specific env file
 *   --collection=NAME       Only process a specific collection (e.g. Memory_abc123)
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Parse flags ---
const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : undefined;
}
const isLive = args.includes('--live');
const batch = parseInt(flag('batch') ?? '10', 10);
const autoApprove = flag('auto-approve') ? parseFloat(flag('auto-approve')!) : undefined;
const similarity = flag('similarity') ? parseFloat(flag('similarity')!) : undefined;
const seedCount = flag('seed-count') ? parseInt(flag('seed-count')!, 10) : undefined;
const collectionFilter = flag('collection');

// --- Load env ---
const envFileArg = flag('env-file');
const envArg = flag('env') ?? 'e1';
const envFile = envFileArg ?? `.env.${envArg}.local`;
const envPath = resolve(process.cwd(), envFile);

if (!existsSync(envPath)) {
  console.error(`\n  Environment file not found: ${envFile}`);
  console.error(`  Run: npm run fetch-secrets:e1\n`);
  process.exit(1);
}

console.log(`\n  Loading environment from: ${envFile}`);
const result = loadEnv({ path: envPath });
if (result.error) {
  console.error(`  Failed to load ${envFile}:`, result.error);
  process.exit(1);
}

// ConfigService needs these
process.env.REM_MODE = 'worker';
process.env.JOB_ID = 'fanout-test';
console.log('  Environment loaded\n');

// --- Imports (after env is loaded) ---
import { ConfigService } from '../src/config/config.service.js';
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
import { JobService } from '@prmichaelsen/remember-core/services';
import { RemJobWorker } from '@prmichaelsen/remember-core/services';
import type { RemJobParams } from '@prmichaelsen/remember-core/services';

async function main(): Promise<void> {
  const mode = isLive ? 'LIVE' : 'DRY-RUN';
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Fan-Out REM Test [${mode}]`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const config = new ConfigService();
  const logger = createLogger((isLive ? config.appConfig.logLevel : 'debug') as LogLevel);

  console.log(`  WEAVIATE_REST_URL:  ${config.weaviateConfig.restUrl}`);
  console.log(`  FIREBASE_PROJECT:   ${config.firebaseConfig.projectId}`);
  console.log(`  batch:              ${batch}`);
  console.log(`  similarity:         ${similarity ?? '0.75 (default)'}`);
  console.log(`  auto_approve:       ${autoApprove ?? '0.9 (default)'}`);
  console.log(`  seed_count:         ${seedCount ?? '2 (default)'}`);
  if (collectionFilter) {
    console.log(`  collection filter:  ${collectionFilter}`);
  }
  console.log('');

  // --- Initialize infrastructure ---
  await initWeaviateClient({
    url: config.weaviateConfig.restUrl,
    apiKey: config.weaviateConfig.apiKey,
    openaiApiKey: config.embeddingsConfig.apiKey,
  });
  const weaviateClient = getWeaviateClient();
  console.log('  Weaviate initialized');

  const serviceAccountPath = resolve(process.cwd(), './remember-prod-service.json');
  let serviceAccount: string;
  if (existsSync(serviceAccountPath)) {
    const fs = await import('node:fs/promises');
    serviceAccount = await fs.readFile(serviceAccountPath, 'utf-8');
  } else {
    serviceAccount = config.firebaseConfig.serviceAccountKey;
  }

  initFirestore({
    serviceAccount,
    projectId: config.firebaseConfig.projectId,
  });
  console.log('  Firestore initialized\n');

  const jobService = new JobService({ logger });

  // ============================================================
  // STEP 1: Enumerate collections (scheduler logic)
  // ============================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Step 1: Enumerate Collections');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const allCollections = await weaviateClient.collections.listAll();
  const eligible: Array<{ name: string; count: number }> = [];

  for (const collection of allCollections) {
    if (!collection.name.startsWith('Memory_')) continue;
    if (collectionFilter && collection.name !== collectionFilter) continue;

    const col = weaviateClient.collections.get(collection.name);
    const { totalCount } = await col.aggregate.overAll();

    const status = totalCount < 50 ? 'SKIP (< 50)' : 'ELIGIBLE';
    console.log(`  ${status.padEnd(16)} ${collection.name.padEnd(40)} ${totalCount} memories`);

    if (totalCount >= 50) {
      eligible.push({ name: collection.name, count: totalCount });
    }
  }

  console.log(`\n  ${eligible.length} eligible collection(s) found\n`);

  if (eligible.length === 0) {
    console.log('  Nothing to process.\n');
    return;
  }

  // ============================================================
  // STEP 2: Create job records
  // ============================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Step 2: Create Job Records');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const jobs: Array<{ id: string; collectionId: string; count: number }> = [];

  for (const { name, count } of eligible) {
    const job = await jobService.create({
      type: 'rem_cycle' as any,
      user_id: null as any,
      params: { collection_id: name },
      ttl_hours: 24,
    });
    jobs.push({ id: job.id, collectionId: name, count });
    console.log(`  Created job ${job.id} -> ${name} (${count} memories)`);
  }

  console.log(`\n  ${jobs.length} job(s) created in Firestore\n`);

  if (!isLive) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Step 3: Workers [SKIPPED - DRY-RUN]');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('  In production, the scheduler would trigger Cloud Run workers for each job.');
    console.log('  To run workers locally, re-run with --live\n');
    console.log('  Job IDs for manual testing:');
    for (const { id, collectionId } of jobs) {
      console.log(`    npx tsx scripts/test-local.ts --mode=worker --job-id=${id}`);
    }
    console.log('');
    return;
  }

  // ============================================================
  // STEP 3: Execute workers sequentially (live mode)
  // ============================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Step 3: Execute Workers [LIVE]');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const stateStore = new RemStateStore();
  const haikuClient = createHaikuClient({ apiKey: config.anthropicConfig.apiKey });
  const relationshipServiceFactory = (collection: any, userId: string) =>
    new RelationshipService(collection, userId, logger);

  const remService = new RemService({
    weaviateClient,
    relationshipServiceFactory,
    stateStore,
    haikuClient,
    logger,
    config: {
      max_candidates_per_run: batch,
      ...(autoApprove !== undefined && { auto_approve_similarity: autoApprove }),
      ...(similarity !== undefined && { similarity_threshold: similarity }),
      ...(seedCount !== undefined && { seed_count: seedCount }),
    },
  });

  const results: Array<{
    jobId: string;
    collectionId: string;
    status: string;
    durationMs: number;
    error?: string;
  }> = [];

  for (const { id, collectionId, count } of jobs) {
    console.log(`\n  --- Worker: ${collectionId} (job ${id}, ${count} memories) ---\n`);
    const start = Date.now();

    try {
      const job = await jobService.getStatus(id);
      if (!job || job.status !== 'pending') {
        console.log(`  Skipping job ${id}: status=${job?.status ?? 'not found'}`);
        results.push({ jobId: id, collectionId, status: 'skipped', durationMs: 0 });
        continue;
      }

      const params = job.params as unknown as RemJobParams;
      const worker = new RemJobWorker(jobService, remService, logger);
      await worker.execute(id, params);

      const duration = Date.now() - start;
      results.push({ jobId: id, collectionId, status: 'completed', durationMs: duration });
      console.log(`\n  Completed ${collectionId} in ${duration}ms`);
    } catch (err: any) {
      const duration = Date.now() - start;
      results.push({ jobId: id, collectionId, status: 'failed', durationMs: duration, error: err.message });
      console.error(`\n  FAILED ${collectionId}: ${err.message}`);
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Results Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const r of results) {
    const dur = r.durationMs > 0 ? ` (${r.durationMs}ms)` : '';
    const err = r.error ? ` - ${r.error}` : '';
    console.log(`  ${r.status.toUpperCase().padEnd(10)} ${r.collectionId}${dur}${err}`);
  }

  const completed = results.filter(r => r.status === 'completed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  console.log(`\n  ${completed} completed, ${failed} failed, ${totalMs}ms total\n`);
}

main()
  .then(() => {
    console.log('  Done.\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n  Fatal error:', err);
    console.error(err.stack);
    process.exit(1);
  });
