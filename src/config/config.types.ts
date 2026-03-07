export interface WeaviateConfig {
  restUrl: string;
  grpcUrl: string;
  apiKey: string;
}

export interface FirebaseConfig {
  projectId: string;
  serviceAccountKey: string;
}

export interface EmbeddingsConfig {
  provider: string;
  model: string;
  apiKey: string;
}

export interface AnthropicConfig {
  apiKey: string;
}

export type RemMode = 'scheduler' | 'worker';

export interface AppConfig {
  nodeEnv: string;
  logLevel: string;
  remMode: RemMode;
  jobId: string | null;
}

export interface GcpConfig {
  projectId: string;
  region: string;
  workerJobName: string;
}

export interface Config {
  app: AppConfig;
  weaviate: WeaviateConfig;
  firebase: FirebaseConfig;
  embeddings: EmbeddingsConfig;
  anthropic: AnthropicConfig;
  gcp: GcpConfig;
}
