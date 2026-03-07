import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigService } from './config.service.js';

describe('ConfigService', () => {
  const baseEnv: Record<string, string> = {
    WEAVIATE_REST_URL: 'http://localhost:8080',
    WEAVIATE_GRPC_URL: 'http://localhost:50051',
    WEAVIATE_API_KEY: 'test-key',
    FIREBASE_PROJECT_ID: 'test-project',
    FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: '{}',
    EMBEDDINGS_PROVIDER: 'openai',
    EMBEDDINGS_MODEL: 'text-embedding-3-small',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
  };

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all env vars we care about
    for (const key of Object.keys(baseEnv)) {
      delete process.env[key];
    }
    delete process.env.REM_MODE;
    delete process.env.JOB_ID;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_REGION;
    delete process.env.WORKER_JOB_NAME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function setEnv(overrides: Record<string, string> = {}) {
    Object.assign(process.env, baseEnv, overrides);
  }

  it('throws when REM_MODE is missing', () => {
    setEnv();
    expect(() => new ConfigService()).toThrow('Missing required environment variable: REM_MODE');
  });

  it('throws when REM_MODE is invalid', () => {
    setEnv({ REM_MODE: 'invalid' });
    expect(() => new ConfigService()).toThrow('Invalid REM_MODE: "invalid"');
  });

  it('throws when JOB_ID missing in worker mode', () => {
    setEnv({ REM_MODE: 'worker' });
    expect(() => new ConfigService()).toThrow('JOB_ID is required when REM_MODE=worker');
  });

  it('accepts worker mode with JOB_ID', () => {
    setEnv({ REM_MODE: 'worker', JOB_ID: 'test-job-123' });
    const config = new ConfigService();
    expect(config.appConfig.remMode).toBe('worker');
    expect(config.appConfig.jobId).toBe('test-job-123');
  });

  it('throws when GCP_PROJECT_ID missing in scheduler mode', () => {
    setEnv({ REM_MODE: 'scheduler' });
    expect(() => new ConfigService()).toThrow('GCP_PROJECT_ID is required when REM_MODE=scheduler');
  });

  it('throws when GCP_REGION missing in scheduler mode', () => {
    setEnv({ REM_MODE: 'scheduler', GCP_PROJECT_ID: 'test' });
    expect(() => new ConfigService()).toThrow('GCP_REGION is required when REM_MODE=scheduler');
  });

  it('throws when WORKER_JOB_NAME missing in scheduler mode', () => {
    setEnv({ REM_MODE: 'scheduler', GCP_PROJECT_ID: 'test', GCP_REGION: 'us-central1' });
    expect(() => new ConfigService()).toThrow('WORKER_JOB_NAME is required when REM_MODE=scheduler');
  });

  it('accepts scheduler mode with all GCP config', () => {
    setEnv({
      REM_MODE: 'scheduler',
      GCP_PROJECT_ID: 'my-project',
      GCP_REGION: 'us-central1',
      WORKER_JOB_NAME: 'rem-worker',
    });
    const config = new ConfigService();
    expect(config.appConfig.remMode).toBe('scheduler');
    expect(config.gcpConfig.projectId).toBe('my-project');
    expect(config.gcpConfig.region).toBe('us-central1');
    expect(config.gcpConfig.workerJobName).toBe('rem-worker');
  });

  it('jobId is null in scheduler mode', () => {
    setEnv({
      REM_MODE: 'scheduler',
      GCP_PROJECT_ID: 'test',
      GCP_REGION: 'us-central1',
      WORKER_JOB_NAME: 'worker',
    });
    const config = new ConfigService();
    expect(config.appConfig.jobId).toBeNull();
  });
});
