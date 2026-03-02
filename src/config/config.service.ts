import type { Config } from './config.types.js';

export class ConfigService {
  private readonly config: Config;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    return {
      app: {
        nodeEnv: this.get('NODE_ENV', 'development'),
        logLevel: this.get('LOG_LEVEL', 'info'),
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
    };
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
}
