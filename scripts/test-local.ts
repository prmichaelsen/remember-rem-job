/**
 * Local REM test script.
 *
 * Runs RemService.runCycle() locally with production secrets for debugging.
 * Much faster than deploying to Cloud Run for every test iteration.
 *
 * Prerequisites:
 * 1. Fetch secrets: npm run fetch-secrets:e1
 * 2. Run this script: npm run test:local
 *
 * Usage:
 *   npx tsx scripts/test-local.ts
 *   npx tsx scripts/test-local.ts --env=prod          # use .env.prod.local
 *   npx tsx scripts/test-local.ts --env-file=.env.prod.local  # custom path
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '../src/config/config.service.js';

// Parse flags
const args = process.argv.slice(2);
const envFileArg = args.find(arg => arg.startsWith('--env-file='));
const envArg = args.find(arg => arg.startsWith('--env='));

// Determine env file path
let envFile: string;
let envPath: string;

if (envFileArg) {
  // Custom file path
  envFile = envFileArg.split('=')[1];
  envPath = resolve(process.cwd(), envFile);
} else {
  // Default pattern: .env.{env}.local
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

console.log(`\n📂 Loading environment from: ${envFile}`);
const result = loadEnv({ path: envPath });
if (result.error) {
  console.error(`\n❌ Failed to load ${envFile}:`, result.error);
  process.exit(1);
}
console.log('   ✓ Environment loaded\n');
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
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 REM Local Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Load config (fail-fast on missing env vars)
  console.log('1. Loading configuration...');
  const config = new ConfigService();
  const logger = createLogger(config.appConfig.logLevel as LogLevel);

  console.log(`   NODE_ENV: ${config.appConfig.nodeEnv}`);
  console.log(`   LOG_LEVEL: ${config.appConfig.logLevel}`);
  console.log(`   WEAVIATE_REST_URL: ${config.weaviateConfig.restUrl}`);
  console.log(`   FIREBASE_PROJECT_ID: ${config.firebaseConfig.projectId}`);
  console.log('   ✓ Config loaded\n');

  // 2. Initialize Weaviate
  console.log('2. Initializing Weaviate...');
  await initWeaviateClient({
    url: config.weaviateConfig.restUrl,
    apiKey: config.weaviateConfig.apiKey,
  });
  const weaviateClient = getWeaviateClient();
  console.log('   ✓ Weaviate client initialized\n');

  // 3. Initialize Firestore
  console.log('3. Initializing Firestore...');

  // Check if we have a local service account file
  const serviceAccountPath = resolve(process.cwd(), './remember-prod-service.json');
  let serviceAccount: string;

  if (existsSync(serviceAccountPath)) {
    console.log(`   Using service account from: ./remember-prod-service.json`);
    const fs = await import('node:fs/promises');
    serviceAccount = await fs.readFile(serviceAccountPath, 'utf-8');
  } else {
    console.log(`   Using service account from env var`);
    serviceAccount = config.firebaseConfig.serviceAccountKey;
  }

  initFirestore({
    serviceAccount,
    projectId: config.firebaseConfig.projectId,
  });
  console.log('   ✓ Firestore initialized\n');

  // 4. Create RemService dependencies
  console.log('4. Creating RemService...');
  const stateStore = new RemStateStore();
  const haikuClient = createHaikuClient({
    apiKey: config.anthropicConfig.apiKey,
  });

  const relationshipServiceFactory = (collection: any, userId: string) =>
    new RelationshipService(collection, userId, logger);

  const remService = new RemService({
    weaviateClient,
    relationshipServiceFactory,
    stateStore,
    haikuClient,
    logger,
    config: {
      max_candidates_per_run: 5000, // Local testing: process large batch in one cycle
    },
  });
  console.log('   ✓ RemService created\n');

  // 5. Run cycle
  console.log('5. Running REM cycle...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();
  const result = await remService.runCycle();
  const duration = Date.now() - startTime;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 REM Cycle Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Collection:              ${result.collection_id ?? '(none)'}`);
  console.log(`Memories Scanned:        ${result.memories_scanned}`);
  console.log(`Clusters Found:          ${result.clusters_found}`);
  console.log(`Relationships Created:   ${result.relationships_created}`);
  console.log(`Relationships Merged:    ${result.relationships_merged}`);
  console.log(`Relationships Split:     ${result.relationships_split}`);
  console.log(`Skipped by Haiku:        ${result.skipped_by_haiku}`);
  console.log(`Duration (ms):           ${result.duration_ms}`);
  console.log(`Duration (seconds):      ${Math.round(result.duration_ms / 1000)}`);
  console.log(`Total Time:              ${duration}ms\n`);

  // 6. Summary
  if (!result.collection_id) {
    console.log('⚠️  No collections to process');
    console.log('   Run npm run diagnose to check collection registry\n');
  } else if (result.memories_scanned === 0) {
    console.log('⚠️  No memories scanned');
    console.log('   Collection may be empty or below minimum size\n');
  } else if (result.clusters_found === 0) {
    console.log('ℹ️  No clusters found');
    console.log('   No similar memories detected in this batch\n');
  } else if (result.relationships_created === 0 && result.relationships_merged === 0) {
    console.log('⚠️  Clusters found but no relationships created');
    console.log('   All clusters may have been rejected by Haiku\n');
  } else {
    console.log('✅ REM cycle completed successfully\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .then(() => {
    console.log('✓ Test complete\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test failed:', err);
    console.error('\nStack trace:');
    console.error(err.stack);
    process.exit(1);
  });
