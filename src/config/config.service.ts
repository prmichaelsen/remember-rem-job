import type { Config, RemMode } from './config.types.js';

export class ConfigService {
  private readonly config: Config;

  constructor() {
    this.config = this.loadConfig();
    this.validate();
  }

  private loadConfig(): Config {
    const remMode = this.getRequired('REM_MODE') as RemMode;
    if (remMode !== 'scheduler' && remMode !== 'worker') {
      throw new Error(`Invalid REM_MODE: "${remMode}". Must be "scheduler" or "worker".`);
    }

    return {
      app: {
        nodeEnv: this.get('NODE_ENV', 'development'),
        logLevel: this.get('LOG_LEVEL', 'info'),
        remMode,
        jobId: this.get('JOB_ID', '') || null,
      },
      weaviate: {
        restUrl: this.getRequired('WEAVIATE_REST_URL'),
        grpcUrl: this.getRequired('WEAVIATE_GRPC_URL'),
        apiKey: this.getRequired('WEAVIATE_API_KEY'),
      },
      firebase: {
        projectId: this.getRequired('FIREBASE_PROJECT_ID'),
        serviceAccountKey: this.getRequired('FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY'),
      },
      embeddings: {
        provider: this.getRequired('EMBEDDINGS_PROVIDER'),
        model: this.getRequired('EMBEDDINGS_MODEL'),
        apiKey: this.get('EMBEDDINGS_API_KEY', ''),
      },
      anthropic: {
        apiKey: this.getRequired('ANTHROPIC_API_KEY'),
      },
      gcp: {
        projectId: this.get('GCP_PROJECT_ID', ''),
        region: this.get('GCP_REGION', ''),
        workerJobName: this.get('WORKER_JOB_NAME', ''),
      },
    };
  }

  private validate(): void {
    const { remMode, jobId } = this.config.app;

    if (remMode === 'worker' && !jobId) {
      throw new Error('JOB_ID is required when REM_MODE=worker');
    }

    if (remMode === 'scheduler') {
      if (!this.config.gcp.projectId) {
        throw new Error('GCP_PROJECT_ID is required when REM_MODE=scheduler');
      }
      if (!this.config.gcp.region) {
        throw new Error('GCP_REGION is required when REM_MODE=scheduler');
      }
      if (!this.config.gcp.workerJobName) {
        throw new Error('WORKER_JOB_NAME is required when REM_MODE=scheduler');
      }
    }
  }

  private get(key: string, defaultValue: string): string {
    return process.env[key] ?? defaultValue;
  }

  private getRequired(key: string): string {
    const value = process.env[key];
    if (value === undefined || value === '') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  get appConfig() {
    return this.config.app;
  }

  get weaviateConfig() {
    return this.config.weaviate;
  }

  get firebaseConfig() {
    return this.config.firebase;
  }

  get embeddingsConfig() {
    return this.config.embeddings;
  }

  get anthropicConfig() {
    return this.config.anthropic;
  }

  get gcpConfig() {
    return this.config.gcp;
  }
}
