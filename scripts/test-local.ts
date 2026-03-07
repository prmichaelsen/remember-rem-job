/**
 * Local REM test script.
 *
 * Supports both scheduler and worker modes for local testing.
 *
 * Prerequisites:
 * 1. Fetch secrets: npm run fetch-secrets:e1
 * 2. Run this script: npm run test:local
 *
 * Usage:
 *   npx tsx scripts/test-local.ts                           # legacy: run single REM cycle
 *   npx tsx scripts/test-local.ts --mode=scheduler          # test scheduler (create jobs, skip API triggers)
 *   npx tsx scripts/test-local.ts --mode=worker --job-id=X  # test worker for a specific job
 *   npx tsx scripts/test-local.ts --env=prod                # use .env.prod.local
 *   npx tsx scripts/test-local.ts --env-file=.env.prod.local
 *
 * REM Config Options (legacy/worker mode):
 *   --batch=30                # Max candidates per run (default: 30)
 *   --auto-approve=0.85       # Auto-approve similarity threshold (0.0-1.0, default: 0.9)
 *   --similarity=0.70         # Base similarity threshold (0.0-1.0, default: 0.75)
 *   --seed-count=3            # LLM-enhanced seed count (default: 2)
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Parse flags
const args = process.argv.slice(2);
const envFileArg = args.find(arg => arg.startsWith('--env-file='));
const envArg = args.find(arg => arg.startsWith('--env='));
const modeArg = args.find(arg => arg.startsWith('--mode='));
const jobIdArg = args.find(arg => arg.startsWith('--job-id='));
const batchArg = args.find(arg => arg.startsWith('--batch='));
const autoApproveArg = args.find(arg => arg.startsWith('--auto-approve='));
const similarityArg = args.find(arg => arg.startsWith('--similarity='));
const seedCountArg = args.find(arg => arg.startsWith('--seed-count='));

const mode = modeArg ? modeArg.split('=')[1] : 'legacy';

// Determine env file path
let envFile: string;
let envPath: string;
let batch: number = 30;
let autoApprove: number | undefined = undefined;
let similarity: number | undefined = undefined;
let seedCount: number | undefined = undefined;

if (envFileArg) {
  envFile = envFileArg.split('=')[1];
  envPath = resolve(process.cwd(), envFile);
} else {
  const env = envArg ? envArg.split('=')[1] : 'e1';
  envFile = `.env.${env}.local`;
  envPath = resolve(process.cwd(), envFile);
}

if (!existsSync(envPath)) {
  console.error(`\n❌ Environment file not found: ${envFile}`);
  if (!envFileArg) {
    console.error(`\nRun this first: npm run fetch-secrets:e1`);
  }
  console.error(`\nOr specify a custom file: --env-file=path/to/.env\n`);
  process.exit(1);
}

if (batchArg) {
  batch = parseInt(batchArg.split('=')[1], 10);
}
if (autoApproveArg) {
  autoApprove = parseFloat(autoApproveArg.split('=')[1]);
}
if (similarityArg) {
  similarity = parseFloat(similarityArg.split('=')[1]);
}
if (seedCountArg) {
  seedCount = parseInt(seedCountArg.split('=')[1], 10);
}

console.log(`\n📂 Loading environment from: ${envFile}`);
const result = loadEnv({ path: envPath });
if (result.error) {
  console.error(`\n❌ Failed to load ${envFile}:`, result.error);
  process.exit(1);
}

// Set REM_MODE for ConfigService based on test mode
if (mode === 'scheduler') {
  process.env.REM_MODE = 'scheduler';
  process.env.GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'com-f5-parm';
  process.env.GCP_REGION = process.env.GCP_REGION || 'us-central1';
  process.env.WORKER_JOB_NAME = process.env.WORKER_JOB_NAME || 'remember-rem-worker';
} else if (mode === 'worker') {
  process.env.REM_MODE = 'worker';
  if (jobIdArg) {
    process.env.JOB_ID = jobIdArg.split('=')[1];
  }
  if (!process.env.JOB_ID) {
    console.error('\n❌ --job-id=XXX required for worker mode');
    process.exit(1);
  }
} else {
  // Legacy mode: set REM_MODE=worker with a dummy JOB_ID to pass validation,
  // but we'll skip RemJobWorker and call RemService directly
  process.env.REM_MODE = 'worker';
  process.env.JOB_ID = 'local-test';
}

console.log('   ✓ Environment loaded\n');

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
import { runScheduler } from '../src/scheduler.js';
import { runWorker } from '../src/worker.js';

async function main(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🧪 REM Local Test (${mode} mode)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const config = new ConfigService();
  const logger = createLogger(config.appConfig.logLevel as LogLevel);

  console.log(`   NODE_ENV: ${config.appConfig.nodeEnv}`);
  console.log(`   LOG_LEVEL: ${config.appConfig.logLevel}`);
  console.log(`   REM_MODE: ${config.appConfig.remMode}`);
  console.log(`   WEAVIATE_REST_URL: ${config.weaviateConfig.restUrl}`);
  console.log(`   FIREBASE_PROJECT_ID: ${config.firebaseConfig.projectId}`);
  console.log('   ✓ Config loaded\n');

  // Initialize infrastructure
  await initWeaviateClient({
    url: config.weaviateConfig.restUrl,
    apiKey: config.weaviateConfig.apiKey,
    openaiApiKey: config.embeddingsConfig.apiKey,
  });
  const weaviateClient = getWeaviateClient();
  console.log('   ✓ Weaviate client initialized');

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
  console.log('   ✓ Firestore initialized\n');

  const jobService = new JobService({ logger });

  if (mode === 'scheduler') {
    console.log('Running scheduler mode (jobs created but workers NOT triggered locally)...\n');
    // Override runScheduler to skip Cloud Run API calls
    // We'll just enumerate and create jobs
    const { scheduleRemJobs } = await import('@prmichaelsen/remember-core/services');

    async function* enumerateCollections() {
      const allCollections = await weaviateClient.collections.listAll();
      for (const collection of allCollections) {
        if (!collection.name.startsWith('Memory_')) continue;
        const col = weaviateClient.collections.get(collection.name);
        const { totalCount } = await col.aggregate.overAll();
        if (totalCount < 50) {
          console.log(`   Skipping ${collection.name} (${totalCount} memories)`);
          continue;
        }
        console.log(`   Eligible: ${collection.name} (${totalCount} memories)`);
        yield collection.name;
      }
    }

    const { jobs_created } = await scheduleRemJobs(
      jobService,
      enumerateCollections,
      logger,
    );

    console.log(`\n✅ Created ${jobs_created} job records in Firestore`);
    console.log('   Workers NOT triggered (local mode — use --mode=worker --job-id=XXX to test a specific job)');
    return;
  }

  if (mode === 'worker') {
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

    await runWorker({ config, jobService, remService, logger });
    return;
  }

  // Legacy mode: direct RemService.runCycle()
  const stateStore = new RemStateStore();
  const haikuClient = createHaikuClient({ apiKey: config.anthropicConfig.apiKey });
  const relationshipServiceFactory = (collection: any, userId: string) =>
    new RelationshipService(collection, userId, logger);

  const remConfig = {
    max_candidates_per_run: batch,
    ...(autoApprove !== undefined && { auto_approve_similarity: autoApprove }),
    ...(similarity !== undefined && { similarity_threshold: similarity }),
    ...(seedCount !== undefined && { seed_count: seedCount }),
  };

  const remService = new RemService({
    weaviateClient,
    relationshipServiceFactory,
    stateStore,
    haikuClient,
    logger,
    config: remConfig,
  });

  console.log('   REM Config:');
  console.log(`     max_candidates_per_run: ${batch}`);
  console.log(`     similarity_threshold: ${similarity ?? '0.75 (default)'}`);
  console.log(`     auto_approve_similarity: ${autoApprove ?? '0.9 (default)'}`);
  console.log(`     seed_count: ${seedCount ?? '2 (default)'}`);
  console.log('');

  console.log('Running REM cycle...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();
  const cycleResult = await remService.runCycle();
  const duration = Date.now() - startTime;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 REM Cycle Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Collection:              ${cycleResult.collection_id ?? '(none)'}`);
  console.log(`Memories Scanned:        ${cycleResult.memories_scanned}`);
  console.log(`Clusters Found:          ${cycleResult.clusters_found}`);
  console.log(`Relationships Created:   ${cycleResult.relationships_created}`);
  console.log(`Relationships Merged:    ${cycleResult.relationships_merged}`);
  console.log(`Relationships Split:     ${cycleResult.relationships_split}`);
  console.log(`Skipped by Haiku:        ${cycleResult.skipped_by_haiku}`);
  console.log(`Duration (ms):           ${cycleResult.duration_ms}`);
  console.log(`Total Time:              ${duration}ms\n`);

  if (cycleResult.relationships_created > 0 || cycleResult.relationships_merged > 0) {
    console.log('✅ REM cycle completed successfully\n');
  } else if (cycleResult.clusters_found === 0) {
    console.log('ℹ️  No clusters found in this batch\n');
  } else {
    console.log('⚠️  Clusters found but no relationships created\n');
  }
}

main()
  .then(() => {
    console.log('✓ Test complete\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test failed:', err);
    console.error(err.stack);
    process.exit(1);
  });
