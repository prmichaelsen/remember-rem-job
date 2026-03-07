import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '../src/config/config.service.js';

const REQUIRED_ENV = {
  REM_MODE: 'worker',
  JOB_ID: 'test-job-id',
  WEAVIATE_REST_URL: 'http://localhost:8080',
  WEAVIATE_GRPC_URL: 'http://localhost:50051',
  WEAVIATE_API_KEY: 'test-weaviate-key',
  FIREBASE_PROJECT_ID: 'test-project',
  FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: '{"type":"service_account"}',
  EMBEDDINGS_PROVIDER: 'openai',
  EMBEDDINGS_MODEL: 'text-embedding-3-small',
  ANTHROPIC_API_KEY: 'sk-ant-test',
};

describe('ConfigService', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Set all required env vars
    Object.assign(process.env, REQUIRED_ENV);
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('loads all required config when env vars are set', () => {
    const config = new ConfigService();

    expect(config.weaviateConfig.restUrl).toBe('http://localhost:8080');
    expect(config.weaviateConfig.grpcUrl).toBe('http://localhost:50051');
    expect(config.weaviateConfig.apiKey).toBe('test-weaviate-key');
    expect(config.firebaseConfig.projectId).toBe('test-project');
    expect(config.firebaseConfig.serviceAccountKey).toBe('{"type":"service_account"}');
    expect(config.embeddingsConfig.provider).toBe('openai');
    expect(config.embeddingsConfig.model).toBe('text-embedding-3-small');
    expect(config.anthropicConfig.apiKey).toBe('sk-ant-test');
  });

  it('throws when a required env var is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => new ConfigService()).toThrow(
      'Missing required environment variable: ANTHROPIC_API_KEY',
    );
  });

  it('throws when a required env var is empty string', () => {
    process.env.WEAVIATE_REST_URL = '';

    expect(() => new ConfigService()).toThrow(
      'Missing required environment variable: WEAVIATE_REST_URL',
    );
  });

  it('uses defaults for optional config', () => {
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;

    const config = new ConfigService();

    expect(config.appConfig.nodeEnv).toBe('development');
    expect(config.appConfig.logLevel).toBe('info');
  });

  it('overrides defaults when optional env vars are set', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';

    const config = new ConfigService();

    expect(config.appConfig.nodeEnv).toBe('production');
    expect(config.appConfig.logLevel).toBe('debug');
  });

  it('defaults EMBEDDINGS_API_KEY to empty string', () => {
    delete process.env.EMBEDDINGS_API_KEY;

    const config = new ConfigService();

    expect(config.embeddingsConfig.apiKey).toBe('');
  });
});
