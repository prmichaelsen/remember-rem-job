import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Entry point tests.
 *
 * Since src/index.ts is a top-level script (calls main() immediately),
 * we test the wiring indirectly by validating:
 * 1. ConfigService integration (already tested in config.service.test.ts)
 * 2. Stub RemService returns expected shape
 * 3. createHaikuClient produces a valid client
 * 4. RemStateStore has expected methods
 */

import {
  RemService,
  RemStateStore,
  createHaikuClient,
  type RunCycleResult,
} from '../src/stubs/rem.js';

describe('RemService stub', () => {
  it('runCycle returns empty result', async () => {
    const service = new RemService({
      weaviateClient: {} as any,
      relationshipServiceFactory: () => ({}) as any,
      stateStore: new RemStateStore(),
      haikuClient: createHaikuClient({ apiKey: 'test' }),
    });

    const result = await service.runCycle();

    expect(result.collection_id).toBeNull();
    expect(result.memories_scanned).toBe(0);
    expect(result.clusters_found).toBe(0);
    expect(result.relationships_created).toBe(0);
    expect(result.relationships_merged).toBe(0);
    expect(result.relationships_split).toBe(0);
    expect(result.skipped_by_haiku).toBe(0);
    expect(result.duration_ms).toBe(0);
  });

  it('accepts optional config and logger', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const service = new RemService({
      weaviateClient: {} as any,
      relationshipServiceFactory: () => ({}) as any,
      stateStore: new RemStateStore(),
      haikuClient: createHaikuClient({ apiKey: 'test' }),
      config: { max_candidates_per_run: 100 },
      logger,
    });

    await service.runCycle();
    expect(logger.info).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('RunCycleResult shape', () => {
  it('has all expected fields', () => {
    const result: RunCycleResult = {
      collection_id: 'Memory_users_abc',
      memories_scanned: 10,
      clusters_found: 2,
      relationships_created: 1,
      relationships_merged: 0,
      relationships_split: 0,
      skipped_by_haiku: 1,
      duration_ms: 500,
    };

    expect(result).toBeDefined();
    expect(typeof result.collection_id).toBe('string');
    expect(typeof result.memories_scanned).toBe('number');
  });
});

describe('createHaikuClient', () => {
  it('returns client with validateCluster method', () => {
    const client = createHaikuClient({ apiKey: 'sk-test' });
    expect(typeof client.validateCluster).toBe('function');
  });
});

describe('RemStateStore', () => {
  it('has expected methods', () => {
    const store = new RemStateStore();
    expect(typeof store.getCursor).toBe('function');
    expect(typeof store.saveCursor).toBe('function');
    expect(typeof store.getCollectionState).toBe('function');
    expect(typeof store.saveCollectionState).toBe('function');
  });
});
