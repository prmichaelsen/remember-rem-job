/**
 * Backfill `relationship_count` on all memories.
 *
 * Memories already store `relationship_ids: string[]` — this script adds a
 * `relationship_count` int property to each collection's schema and sets it
 * to `relationship_ids.length` for every existing memory.
 *
 * Prerequisites:
 * 1. Fetch secrets: npm run fetch-secrets:e1
 * 2. Run this script: npm run backfill:relationship-count
 *
 * Usage:
 *   npx tsx scripts/backfill-relationship-count.ts
 *   npx tsx scripts/backfill-relationship-count.ts --env=prod
 *   npx tsx scripts/backfill-relationship-count.ts --env-file=.env.prod.local
 *   npx tsx scripts/backfill-relationship-count.ts --dry-run
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '../src/config/config.service.js';

// Parse flags
const args = process.argv.slice(2);
const envFileArg = args.find(arg => arg.startsWith('--env-file='));
const envArg = args.find(arg => arg.startsWith('--env='));
const dryRun = args.includes('--dry-run');

// Determine env file path
let envFile: string;
let envPath: string;

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
import { getNextMemoryCollection } from '@prmichaelsen/remember-core/rem';

async function main(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 Backfill relationship_count');
  if (dryRun) console.log('   (DRY RUN — no changes will be written)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Load config
  console.log('1. Loading configuration...');
  const config = new ConfigService();
  console.log(`   WEAVIATE_REST_URL: ${config.weaviateConfig.restUrl}`);
  console.log(`   FIREBASE_PROJECT_ID: ${config.firebaseConfig.projectId}`);
  console.log('   ✓ Config loaded\n');

  // 2. Initialize Weaviate
  console.log('2. Initializing Weaviate...');
  await initWeaviateClient({
    url: config.weaviateConfig.restUrl,
    apiKey: config.weaviateConfig.apiKey,
    openaiApiKey: config.embeddingsConfig.apiKey,
  });
  const weaviateClient = getWeaviateClient();
  console.log('   ✓ Weaviate client initialized\n');

  // 3. Initialize Firestore
  console.log('3. Initializing Firestore...');
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

  // 4. Iterate all registered collections
  console.log('4. Iterating collections...\n');

  const seen = new Set<string>();
  let cursor: string | null = null;
  let totalMemories = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalCollections = 0;

  while (true) {
    const collectionName = await getNextMemoryCollection(cursor);
    if (!collectionName || seen.has(collectionName)) break;

    seen.add(collectionName);
    cursor = collectionName;
    totalCollections++;

    console.log(`━━ Collection: ${collectionName} ━━`);

    const collection = weaviateClient.collections.get(collectionName);

    // 4a. Add relationship_count property if missing
    const schemaConfig = await collection.config.get();
    const existingProps = new Set(schemaConfig.properties.map((p: any) => p.name));

    const hasRelationshipCount = existingProps.has('relationship_count');

    if (!hasRelationshipCount) {
      if (dryRun) {
        console.log('   [DRY RUN] Would add relationship_count property to schema');
      } else {
        await collection.config.addProperty({
          name: 'relationship_count',
          dataType: 'int',
        } as any);
        console.log('   ✓ Added relationship_count property to schema');
      }
    } else {
      console.log('   ✓ relationship_count property already exists');
    }

    // 4b. Fetch and update all memories
    // Only request relationship_count if it exists in schema (avoids gRPC error)
    const returnProps = hasRelationshipCount
      ? ['relationship_ids', 'relationship_count']
      : ['relationship_ids'];

    let collectionUpdated = 0;
    let collectionSkipped = 0;
    let collectionNonMemory = 0;

    // Use the built-in iterator — handles cursor-based pagination internally
    const iter = collection.iterator({
      returnProperties: ['doc_type', ...returnProps] as any,
    });

    for await (const obj of iter) {
      // Filter client-side — iterator doesn't support filters
      if ((obj.properties as any).doc_type !== 'memory') {
        collectionNonMemory++;
        continue;
      }

      const relationshipIds = (obj.properties as any).relationship_ids as string[] | undefined;
      const currentCount = (obj.properties as any).relationship_count as number | undefined;
      const expectedCount = relationshipIds?.length ?? 0;

      if (currentCount === expectedCount) {
        collectionSkipped++;
        continue;
      }

      if (dryRun) {
        console.log(`   [DRY RUN] ${obj.uuid}: ${currentCount ?? 'null'} → ${expectedCount}`);
      } else {
        await collection.data.update({
          id: obj.uuid,
          properties: {
            relationship_count: expectedCount,
          },
        });
      }
      collectionUpdated++;
    }

    const collectionTotal = collectionUpdated + collectionSkipped;
    totalMemories += collectionTotal;
    totalUpdated += collectionUpdated;
    totalSkipped += collectionSkipped;

    console.log(`   Memories: ${collectionTotal} total, ${collectionUpdated} updated, ${collectionSkipped} already correct\n`);
  }

  // 5. Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Backfill Results');
  if (dryRun) console.log('   (DRY RUN — no changes were written)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Collections processed: ${totalCollections}`);
  console.log(`Total memories:        ${totalMemories}`);
  console.log(`Updated:               ${totalUpdated}`);
  console.log(`Already correct:       ${totalSkipped}\n`);
}

main()
  .then(() => {
    console.log('✓ Backfill complete\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Backfill failed:', err);
    console.error('\nStack trace:');
    console.error(err.stack);
    process.exit(1);
  });
