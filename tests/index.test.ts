import { describe, it, expect } from 'vitest';

/**
 * Entry point contract tests.
 *
 * These tests validate that the remember-core/rem exports are accessible
 * and have the expected shape. Actual integration testing happens in E2E tests
 * (npm run verify) which run against real GCP infrastructure.
 */

import {
  RemService,
  RemStateStore,
  createHaikuClient,
  createMockHaikuClient,
  type RunCycleResult,
  type RemServiceDeps,
} from '@prmichaelsen/remember-core/rem';

describe('RemService contract', () => {
  it('exports RemService class', () => {
    expect(RemService).toBeDefined();
    expect(typeof RemService).toBe('function');
  });

  it('RemServiceDeps has required fields', () => {
    // Type check only - no runtime validation needed
    const deps: RemServiceDeps = {
      weaviateClient: {} as any,
      relationshipServiceFactory: () => ({}) as any,
      stateStore: new RemStateStore(),
      haikuClient: createMockHaikuClient(),
    };
    expect(deps).toBeDefined();
  });
});

describe('RunCycleResult contract', () => {
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
    expect(typeof result.clusters_found).toBe('number');
    expect(typeof result.relationships_created).toBe('number');
    expect(typeof result.relationships_merged).toBe('number');
    expect(typeof result.relationships_split).toBe('number');
    expect(typeof result.skipped_by_haiku).toBe('number');
    expect(typeof result.duration_ms).toBe('number');
  });

  it('allows null collection_id', () => {
    const result: RunCycleResult = {
      collection_id: null,
      memories_scanned: 0,
      clusters_found: 0,
      relationships_created: 0,
      relationships_merged: 0,
      relationships_split: 0,
      skipped_by_haiku: 0,
      duration_ms: 0,
    };
    expect(result.collection_id).toBeNull();
  });
});

describe('createHaikuClient contract', () => {
  it('returns client with validateCluster method', () => {
    const client = createHaikuClient({ apiKey: 'sk-test' });
    expect(typeof client.validateCluster).toBe('function');
  });

  it('mock client has same interface', async () => {
    const mockClient = createMockHaikuClient();
    expect(typeof mockClient.validateCluster).toBe('function');

    const result = await mockClient.validateCluster({
      memories: [
        { id: '1', content_summary: 'test', tags: [] },
        { id: '2', content_summary: 'test2', tags: [] },
      ],
    });

    expect(result.valid).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
  });
});

describe('RemStateStore contract', () => {
  it('has expected methods', () => {
    const store = new RemStateStore();
    expect(typeof store.getCursor).toBe('function');
    expect(typeof store.saveCursor).toBe('function');
    expect(typeof store.getCollectionState).toBe('function');
    expect(typeof store.saveCollectionState).toBe('function');
  });
});
