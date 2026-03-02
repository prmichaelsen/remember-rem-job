import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROJECT = 'com-f5-parm';
const OUTFILE = process.argv[2] ?? '.env.e1.local';

const SECRETS: Record<string, string> = {
  WEAVIATE_REST_URL: 'remember-e1-weaviate-rest-url',
  WEAVIATE_GRPC_URL: 'remember-e1-weaviate-grpc-url',
  WEAVIATE_API_KEY: 'remember-e1-weaviate-api-key',
  FIREBASE_PROJECT_ID: 'remember-e1-firebase-project-id',
  FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: 'remember-e1-firebase-admin-service-account-key',
  EMBEDDINGS_PROVIDER: 'remember-e1-embeddings-provider',
  EMBEDDINGS_MODEL: 'remember-e1-embeddings-model',
  EMBEDDINGS_API_KEY: 'remember-e1-openai-embeddings-api-key',
  ANTHROPIC_API_KEY: 'remember-e1-anthropic-api-key',
};

const lines: string[] = [];

for (const [envName, secretName] of Object.entries(SECRETS)) {
  const value = execSync(
    `gcloud secrets versions access latest --secret="${secretName}" --project="${PROJECT}"`,
    { encoding: 'utf-8' },
  ).trim();
  lines.push(`${envName}=${value}`);
}

lines.push('NODE_ENV=production');
lines.push('LOG_LEVEL=debug');

writeFileSync(OUTFILE, lines.join('\n') + '\n');
console.log(`Written ${lines.length} lines to ${OUTFILE}`);
