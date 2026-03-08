/**
 * Snapshot a Weaviate collection's state for REM cycle benchmarking.
 *
 * Captures counts, scoring coverage, relationship stats, and optionally
 * all objects for full diff comparison.
 *
 * Usage:
 *   npx tsx scripts/snapshot.ts --collection=Memory_users_e1_test_user
 *   npx tsx scripts/snapshot.ts --collection=Memory_users_e1_test_user --out=before.json
 *   npx tsx scripts/snapshot.ts --collection=Memory_users_e1_test_user --full
 *   npx tsx scripts/snapshot.ts --compare before.json after.json
 *   npx tsx scripts/snapshot.ts --collection=... --env-file=.env.custom
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// --- Parse flags ---
const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : undefined;
}

const isCompare = args.includes('--compare');
const isFull = args.includes('--full');

if (isCompare) {
  // Compare mode — no env needed
  const files = args.filter(a => !a.startsWith('--'));
  if (files.length !== 2) {
    console.error('\n  Usage: npx tsx scripts/snapshot.ts --compare before.json after.json\n');
    process.exit(1);
  }
  compareSnapshots(files[0], files[1]).catch(err => {
    console.error('\n  Fatal error:', err.message);
    process.exit(1);
  });
} else {
  // Snapshot mode — needs env
  const collectionName = flag('collection');
  if (!collectionName) {
    console.error('\n  Usage: npx tsx scripts/snapshot.ts --collection=Memory_users_e1_test_user [--full]\n');
    process.exit(1);
  }

  const envFileArg = flag('env-file');
  const envArg = flag('env') ?? 'e1';
  const envFile = envFileArg ?? `.env.${envArg}.local`;
  const envPath = resolve(process.cwd(), envFile);

  if (!existsSync(envPath)) {
    console.error(`\n  Environment file not found: ${envFile}\n`);
    process.exit(1);
  }

  loadEnv({ path: envPath });

  // ConfigService needs these
  process.env.REM_MODE = 'worker';
  process.env.JOB_ID = 'snapshot';

  const outFile = flag('out') ?? `snapshot-${collectionName}-${Date.now()}.json`;

  takeSnapshot(collectionName, outFile).catch(err => {
    console.error('\n  Fatal error:', err.message);
    process.exit(1);
  });
}

// --- Types ---

interface ObjectRecord {
  uuid: string;
  doc_type: string;
  title: string | null;
  type: string | null;
  content: string | null;
  tags: string[];
  source: string | null;
  rem_touched_at: string | null;
  rem_visits: number | null;
  relationship_ids: string[];
  feel_happiness: number | null;
  feel_significance: number | null;
  functional_salience: number | null;
  functional_significance: number | null;
  total_significance: number | null;
  weight: number | null;
  created_at: string | null;
}

interface CollectionSnapshot {
  collection_id: string;
  timestamp: string;
  full: boolean;
  counts: {
    total_objects: number;
    memories: number;
    relationships: number;
    ghost_memories: number;
  };
  scoring: {
    rem_touched: number;
    rem_untouched: number;
    has_feel_scores: number;
    has_functional_scores: number;
    has_total_significance: number;
    avg_total_significance: number | null;
    avg_rem_visits: number | null;
  };
  relationships_detail: {
    total: number;
    by_source: Record<string, number>;
  };
  tags: {
    unique_tags: string[];
    ghost_owner_tags: string[];
    topic_tags: string[];
    content_type_tags: string[];
  };
  objects?: ObjectRecord[];
}

// --- Snapshot ---

const RETURN_PROPS = [
  'doc_type', 'content', 'title', 'type', 'tags', 'source',
  'rem_touched_at', 'rem_visits', 'relationship_ids',
  'feel_happiness', 'feel_significance',
  'functional_salience', 'functional_significance',
  'total_significance', 'weight', 'created_at',
];

async function takeSnapshot(collectionName: string, outFile: string): Promise<void> {
  const { ConfigService } = await import('../src/config/config.service.js');
  const { initWeaviateClient, getWeaviateClient } = await import(
    '@prmichaelsen/remember-core/database/weaviate'
  );

  const config = new ConfigService();
  const mode = isFull ? 'FULL' : 'STATS';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Collection Snapshot [${mode}]: ${collectionName}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await initWeaviateClient({
    url: config.weaviateConfig.restUrl,
    apiKey: config.weaviateConfig.apiKey,
    openaiApiKey: config.embeddingsConfig.apiKey,
  });
  const client = getWeaviateClient();
  const collection = client.collections.get(collectionName);

  const { totalCount } = await collection.aggregate.overAll();
  console.log(`  Total objects: ${totalCount}`);

  // Iterate all objects
  let memories = 0;
  let relationships = 0;
  let ghostMemories = 0;
  let remTouched = 0;
  let remUntouched = 0;
  let hasFeelScores = 0;
  let hasFunctionalScores = 0;
  let hasTotalSig = 0;
  let totalSigSum = 0;
  let remVisitsSum = 0;
  let remVisitsCount = 0;
  const sourceCount: Record<string, number> = {};
  const allTags = new Set<string>();
  const ghostOwnerTags = new Set<string>();
  const topicTags = new Set<string>();
  const contentTypeTags = new Set<string>();
  const objects: ObjectRecord[] = [];

  let objectCount = 0;
  for await (const item of collection.iterator({ returnProperties: RETURN_PROPS as any })) {
    objectCount++;
    const props = item.properties as any;
    const docType = props.doc_type;
    const tags: string[] = props.tags ?? [];

    // Build object record for full mode
    if (isFull) {
      objects.push({
        uuid: item.uuid,
        doc_type: docType,
        title: props.title ?? null,
        type: props.type ?? null,
        content: props.content ?? null,
        tags,
        source: props.source ?? null,
        rem_touched_at: props.rem_touched_at ?? null,
        rem_visits: props.rem_visits ?? null,
        relationship_ids: props.relationship_ids ?? [],
        feel_happiness: props.feel_happiness ?? null,
        feel_significance: props.feel_significance ?? null,
        functional_salience: props.functional_salience ?? null,
        functional_significance: props.functional_significance ?? null,
        total_significance: props.total_significance ?? null,
        weight: props.weight ?? null,
        created_at: props.created_at ?? null,
      });
    }

    if (docType === 'relationship') {
      relationships++;
      const src = props.source ?? 'unknown';
      sourceCount[src] = (sourceCount[src] ?? 0) + 1;
      continue;
    }

    memories++;

    for (const tag of tags) {
      allTags.add(tag);
      if (tag.startsWith('ghost_owner:')) ghostOwnerTags.add(tag);
      if (tag.startsWith('topic:')) topicTags.add(tag);
      if (tag.startsWith('content_type:')) contentTypeTags.add(tag);
    }

    const isGhost = props.type === 'ghost' || tags.some((t: string) => t.startsWith('ghost_owner:'));
    if (isGhost) ghostMemories++;

    if (props.rem_touched_at) {
      remTouched++;
    } else {
      remUntouched++;
    }

    if (props.rem_visits != null) {
      remVisitsSum += props.rem_visits;
      remVisitsCount++;
    }

    if (props.feel_happiness != null) hasFeelScores++;
    if (props.functional_salience != null) hasFunctionalScores++;
    if (props.total_significance != null) {
      hasTotalSig++;
      totalSigSum += props.total_significance;
    }

    if (objectCount % 100 === 0) {
      process.stdout.write(`  Scanned ${objectCount} objects...\r`);
    }
  }

  const snapshot: CollectionSnapshot = {
    collection_id: collectionName,
    timestamp: new Date().toISOString(),
    full: isFull,
    counts: {
      total_objects: objectCount,
      memories,
      relationships,
      ghost_memories: ghostMemories,
    },
    scoring: {
      rem_touched: remTouched,
      rem_untouched: remUntouched,
      has_feel_scores: hasFeelScores,
      has_functional_scores: hasFunctionalScores,
      has_total_significance: hasTotalSig,
      avg_total_significance: hasTotalSig > 0 ? totalSigSum / hasTotalSig : null,
      avg_rem_visits: remVisitsCount > 0 ? remVisitsSum / remVisitsCount : null,
    },
    relationships_detail: {
      total: relationships,
      by_source: sourceCount,
    },
    tags: {
      unique_tags: [...allTags].sort(),
      ghost_owner_tags: [...ghostOwnerTags].sort(),
      topic_tags: [...topicTags].sort(),
      content_type_tags: [...contentTypeTags].sort(),
    },
    ...(isFull && { objects }),
  };

  console.log(`  Scanned ${objectCount} objects      `);
  console.log('');
  printSnapshot(snapshot);

  await writeFile(outFile, JSON.stringify(snapshot, null, 2));
  const fileSizeKb = Math.round(JSON.stringify(snapshot).length / 1024);
  console.log(`\n  Snapshot saved to: ${outFile} (${fileSizeKb} KB)\n`);
}

// --- Print ---

function printSnapshot(s: CollectionSnapshot): void {
  console.log('  Counts');
  console.log(`    Memories:       ${s.counts.memories} (${s.counts.ghost_memories} ghost)`);
  console.log(`    Relationships:  ${s.counts.relationships}`);
  console.log('');
  console.log('  Scoring Coverage');
  console.log(`    REM touched:    ${s.scoring.rem_touched} / ${s.counts.memories} (${pct(s.scoring.rem_touched, s.counts.memories)})`);
  console.log(`    Feel scores:    ${s.scoring.has_feel_scores} / ${s.counts.memories} (${pct(s.scoring.has_feel_scores, s.counts.memories)})`);
  console.log(`    Func scores:    ${s.scoring.has_functional_scores} / ${s.counts.memories} (${pct(s.scoring.has_functional_scores, s.counts.memories)})`);
  console.log(`    Total sig:      ${s.scoring.has_total_significance} / ${s.counts.memories} (${pct(s.scoring.has_total_significance, s.counts.memories)})`);
  if (s.scoring.avg_total_significance != null) {
    console.log(`    Avg total sig:  ${s.scoring.avg_total_significance.toFixed(3)}`);
  }
  if (s.scoring.avg_rem_visits != null) {
    console.log(`    Avg REM visits: ${s.scoring.avg_rem_visits.toFixed(1)}`);
  }
  console.log('');
  console.log('  Relationships');
  if (Object.keys(s.relationships_detail.by_source).length > 0) {
    for (const [src, count] of Object.entries(s.relationships_detail.by_source)) {
      console.log(`    ${src}: ${count}`);
    }
  } else {
    console.log('    (none)');
  }
  console.log('');
  console.log('  Tags');
  console.log(`    Unique tags:     ${s.tags.unique_tags.length}`);
  console.log(`    Ghost owners:    ${s.tags.ghost_owner_tags.join(', ') || '(none)'}`);
  console.log(`    Topics:          ${s.tags.topic_tags.join(', ') || '(none)'}`);
  console.log(`    Content types:   ${s.tags.content_type_tags.join(', ') || '(none)'}`);
}

// --- Compare ---

async function compareSnapshots(beforePath: string, afterPath: string): Promise<void> {
  const before: CollectionSnapshot = JSON.parse(await readFile(beforePath, 'utf-8'));
  const after: CollectionSnapshot = JSON.parse(await readFile(afterPath, 'utf-8'));

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Snapshot Comparison: ${after.collection_id}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`  Before: ${before.timestamp}`);
  console.log(`  After:  ${after.timestamp}\n`);

  console.log('  Counts');
  diffLine('Memories', before.counts.memories, after.counts.memories);
  diffLine('Ghost memories', before.counts.ghost_memories, after.counts.ghost_memories);
  diffLine('Relationships', before.counts.relationships, after.counts.relationships);
  console.log('');

  console.log('  Scoring Coverage');
  diffLine('REM touched', before.scoring.rem_touched, after.scoring.rem_touched);
  diffLine('Feel scores', before.scoring.has_feel_scores, after.scoring.has_feel_scores);
  diffLine('Func scores', before.scoring.has_functional_scores, after.scoring.has_functional_scores);
  diffLine('Total sig', before.scoring.has_total_significance, after.scoring.has_total_significance);
  diffFloat('Avg total sig', before.scoring.avg_total_significance, after.scoring.avg_total_significance);
  diffFloat('Avg REM visits', before.scoring.avg_rem_visits, after.scoring.avg_rem_visits);
  console.log('');

  console.log('  Relationships by Source');
  const allSources = new Set([
    ...Object.keys(before.relationships_detail.by_source),
    ...Object.keys(after.relationships_detail.by_source),
  ]);
  for (const src of [...allSources].sort()) {
    diffLine(
      src,
      before.relationships_detail.by_source[src] ?? 0,
      after.relationships_detail.by_source[src] ?? 0,
    );
  }
  if (allSources.size === 0) console.log('    (none)');
  console.log('');

  // Tag diffs
  const newTags = after.tags.unique_tags.filter(t => !before.tags.unique_tags.includes(t));
  const removedTags = before.tags.unique_tags.filter(t => !after.tags.unique_tags.includes(t));
  if (newTags.length > 0 || removedTags.length > 0) {
    console.log('  Tags');
    if (newTags.length > 0) console.log(`    + ${newTags.join(', ')}`);
    if (removedTags.length > 0) console.log(`    - ${removedTags.join(', ')}`);
    console.log('');
  }

  // Full object-level diff (if both snapshots have objects)
  if (before.full && after.full && before.objects && after.objects) {
    compareObjects(before.objects, after.objects);
  } else if (before.full !== after.full) {
    console.log('  Note: One snapshot is --full and the other is not. Skipping object-level diff.\n');
  }
}

function compareObjects(before: ObjectRecord[], after: ObjectRecord[]): void {
  const beforeMap = new Map(before.map(o => [o.uuid, o]));
  const afterMap = new Map(after.map(o => [o.uuid, o]));

  // New objects
  const newObjects = after.filter(o => !beforeMap.has(o.uuid));
  const removedObjects = before.filter(o => !afterMap.has(o.uuid));

  // Changed objects (scoring changes, tag changes, relationship changes)
  const changed: Array<{ uuid: string; title: string; changes: string[] }> = [];
  for (const obj of after) {
    const prev = beforeMap.get(obj.uuid);
    if (!prev) continue;
    const changes: string[] = [];

    if (!prev.rem_touched_at && obj.rem_touched_at) changes.push('scored by REM');
    if (prev.rem_visits !== obj.rem_visits) changes.push(`rem_visits: ${prev.rem_visits ?? 0} -> ${obj.rem_visits ?? 0}`);
    if (prev.total_significance !== obj.total_significance) {
      changes.push(`total_sig: ${prev.total_significance?.toFixed(3) ?? 'null'} -> ${obj.total_significance?.toFixed(3) ?? 'null'}`);
    }
    if (prev.weight !== obj.weight) {
      changes.push(`weight: ${prev.weight?.toFixed(3) ?? 'null'} -> ${obj.weight?.toFixed(3) ?? 'null'}`);
    }

    const prevRelCount = prev.relationship_ids?.length ?? 0;
    const afterRelCount = obj.relationship_ids?.length ?? 0;
    if (prevRelCount !== afterRelCount) {
      changes.push(`relationships: ${prevRelCount} -> ${afterRelCount}`);
    }

    const newTags = obj.tags.filter(t => !prev.tags.includes(t));
    const droppedTags = prev.tags.filter(t => !obj.tags.includes(t));
    if (newTags.length > 0) changes.push(`+tags: ${newTags.join(', ')}`);
    if (droppedTags.length > 0) changes.push(`-tags: ${droppedTags.join(', ')}`);

    if (changes.length > 0) {
      changed.push({ uuid: obj.uuid, title: obj.title ?? '(untitled)', changes });
    }
  }

  // New relationships with member titles
  const newRelationships = newObjects.filter(o => o.doc_type === 'relationship');
  const newMemories = newObjects.filter(o => o.doc_type !== 'relationship');
  const removedRelationships = removedObjects.filter(o => o.doc_type === 'relationship');
  const removedMemories = removedObjects.filter(o => o.doc_type !== 'relationship');

  console.log('  Object-Level Changes');
  console.log(`    New memories:       ${newMemories.length}`);
  console.log(`    Removed memories:   ${removedMemories.length}`);
  console.log(`    New relationships:  ${newRelationships.length}`);
  console.log(`    Removed rels:       ${removedRelationships.length}`);
  console.log(`    Modified objects:   ${changed.length}`);
  console.log('');

  if (newRelationships.length > 0) {
    console.log('  New Relationships');
    for (const rel of newRelationships.slice(0, 20)) {
      const title = rel.title ?? rel.content?.slice(0, 60) ?? '(untitled)';
      const src = rel.source ?? '?';
      console.log(`    [${src}] ${title}`);
      if (rel.tags.length > 0) {
        console.log(`           tags: ${rel.tags.join(', ')}`);
      }
    }
    if (newRelationships.length > 20) {
      console.log(`    ... and ${newRelationships.length - 20} more`);
    }
    console.log('');
  }

  if (newMemories.length > 0) {
    console.log('  New Memories (abstractions, mood snapshots, etc.)');
    for (const mem of newMemories.slice(0, 10)) {
      console.log(`    [${mem.type ?? '?'}] ${mem.title ?? mem.content?.slice(0, 60) ?? '(untitled)'}`);
    }
    if (newMemories.length > 10) {
      console.log(`    ... and ${newMemories.length - 10} more`);
    }
    console.log('');
  }

  if (changed.length > 0) {
    console.log('  Modified Memories');
    for (const c of changed.slice(0, 30)) {
      console.log(`    ${c.title}`);
      for (const change of c.changes) {
        console.log(`      ${change}`);
      }
    }
    if (changed.length > 30) {
      console.log(`    ... and ${changed.length - 30} more`);
    }
    console.log('');
  }
}

// --- Helpers ---

function diffLine(label: string, before: number, after: number): void {
  const delta = after - before;
  const sign = delta > 0 ? '+' : delta < 0 ? '' : ' ';
  const indicator = delta !== 0 ? ` (${sign}${delta})` : '';
  console.log(`    ${label.padEnd(18)} ${before} -> ${after}${indicator}`);
}

function diffFloat(label: string, before: number | null, after: number | null): void {
  const b = before != null ? before.toFixed(3) : 'n/a';
  const a = after != null ? after.toFixed(3) : 'n/a';
  let indicator = '';
  if (before != null && after != null) {
    const delta = after - before;
    const sign = delta > 0 ? '+' : '';
    indicator = ` (${sign}${delta.toFixed(3)})`;
  }
  console.log(`    ${label.padEnd(18)} ${b} -> ${a}${indicator}`);
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}
