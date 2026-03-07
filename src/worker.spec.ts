import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWorker, type WorkerDeps } from './worker.js';

function createMockDeps(overrides: Partial<WorkerDeps> = {}): WorkerDeps {
  return {
    config: {
      appConfig: { jobId: 'job-123' },
    } as any,
    jobService: {
      getStatus: vi.fn().mockResolvedValue({
        id: 'job-123',
        status: 'pending',
        params: { collection_id: 'Memory_user1' },
      }),
    } as any,
    remService: {} as any,
    remServiceFactory: vi.fn().mockReturnValue({
      runCycle: vi.fn().mockResolvedValue({}),
    }),
    weaviateClient: {
      collections: {
        get: vi.fn().mockReturnValue({
          aggregate: {
            overAll: vi.fn().mockResolvedValue({
              properties: {
                tags: {
                  topOccurrences: [
                    { value: 'ghost_owner:user1' },
                    { value: 'ghost_owner:space:space1' },
                    { value: 'some_other_tag' },
                  ],
                },
              },
            }),
          },
          metrics: {
            aggregate: vi.fn().mockReturnValue({
              text: vi.fn().mockReturnValue({}),
            }),
          },
        }),
      },
    } as any,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any,
    ...overrides,
  };
}

// Mock RemJobWorker
vi.mock('@prmichaelsen/remember-core/services', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    RemJobWorker: class {
      constructor() {}
      execute = vi.fn().mockResolvedValue(undefined);
    },
  };
});

describe('runWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if job not found', async () => {
    const deps = createMockDeps({
      jobService: { getStatus: vi.fn().mockResolvedValue(null) } as any,
    });
    await expect(runWorker(deps)).rejects.toThrow('Job not found: job-123');
  });

  it('skips if job is not pending', async () => {
    const deps = createMockDeps({
      jobService: {
        getStatus: vi.fn().mockResolvedValue({
          id: 'job-123',
          status: 'completed',
          params: { collection_id: 'Memory_user1' },
        }),
      } as any,
    });
    await runWorker(deps);
    expect(deps.logger.warn).toHaveBeenCalledWith(
      'Job is not in pending status, skipping',
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('throws if job missing collection_id', async () => {
    const deps = createMockDeps({
      jobService: {
        getStatus: vi.fn().mockResolvedValue({
          id: 'job-123',
          status: 'pending',
          params: {},
        }),
      } as any,
    });
    await expect(runWorker(deps)).rejects.toThrow('missing collection_id');
  });

  it('runs ghost cycles for user collections', async () => {
    const deps = createMockDeps();
    await runWorker(deps);

    // Should have called remServiceFactory for each ghost_owner tag
    expect(deps.remServiceFactory).toHaveBeenCalledTimes(2);
    expect(deps.remServiceFactory).toHaveBeenCalledWith('ghost_owner:user1');
    expect(deps.remServiceFactory).toHaveBeenCalledWith('ghost_owner:space:space1');
  });

  it('skips ghost cycles for non-user collections', async () => {
    const deps = createMockDeps({
      jobService: {
        getStatus: vi.fn().mockResolvedValue({
          id: 'job-123',
          status: 'pending',
          params: { collection_id: 'Memory_space_myspace' },
        }),
      } as any,
    });
    await runWorker(deps);
    expect(deps.remServiceFactory).not.toHaveBeenCalled();
  });

  it('continues if a ghost cycle fails', async () => {
    const failingService = {
      runCycle: vi.fn().mockRejectedValue(new Error('ghost fail')),
    };
    const successService = {
      runCycle: vi.fn().mockResolvedValue({}),
    };
    let callCount = 0;
    const deps = createMockDeps({
      remServiceFactory: vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? failingService : successService;
      }),
    });

    await runWorker(deps);

    // Both ghosts attempted despite first failure
    expect(deps.remServiceFactory).toHaveBeenCalledTimes(2);
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Ghost REM cycle failed',
      expect.objectContaining({ error: 'ghost fail' }),
    );
    expect(successService.runCycle).toHaveBeenCalled();
  });

  it('skips ghost cycles when no ghost tags found', async () => {
    const deps = createMockDeps({
      weaviateClient: {
        collections: {
          get: vi.fn().mockReturnValue({
            aggregate: {
              overAll: vi.fn().mockResolvedValue({
                properties: {
                  tags: {
                    topOccurrences: [
                      { value: 'regular_tag' },
                    ],
                  },
                },
              }),
            },
            metrics: {
              aggregate: vi.fn().mockReturnValue({
                text: vi.fn().mockReturnValue({}),
              }),
            },
          }),
        },
      } as any,
    });

    await runWorker(deps);
    expect(deps.remServiceFactory).not.toHaveBeenCalled();
  });
});
