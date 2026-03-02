/**
 * Deploy remember-rem-job to GCP production.
 *
 * Prerequisites:
 * - gcloud CLI authenticated with com-f5-parm project
 * - All secrets exist in Secret Manager (remember-* prefix)
 *
 * Usage:
 *   npx tsx scripts/deploy.ts
 *   npx tsx scripts/deploy.ts --skip-build    # skip Cloud Build, just create scheduler
 *   npx tsx scripts/deploy.ts --execute        # manually execute the job after deploy
 */

import { execSync } from 'node:child_process';

const PROJECT = 'com-f5-parm';
const REGION = 'us-central1';
const JOB_NAME = 'remember-rem-job';
const SCHEDULER_NAME = 'remember-rem-job-trigger';

const COMMIT_SHA = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const executeAfter = args.includes('--execute');

function run(cmd: string, label: string) {
  console.log(`\n=== ${label} ===`);
  console.log(`> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });
}

// 1. Submit Cloud Build
if (!skipBuild) {
  run(
    `gcloud builds submit --config=cloudbuild.yaml --substitutions=COMMIT_SHA=${COMMIT_SHA} --project=${PROJECT}`,
    'Submitting Cloud Build',
  );
}

// 2. Create Cloud Scheduler (idempotent — update if exists)
const schedulerUri = `https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB_NAME}:run`;

const serviceAccount = execSync(
  `gcloud iam service-accounts list --project=${PROJECT} --filter="displayName:Compute Engine default" --format="value(email)"`,
  { encoding: 'utf-8' },
).trim();

console.log(`\nUsing service account: ${serviceAccount}`);

try {
  run(
    `gcloud scheduler jobs create http ${SCHEDULER_NAME} ` +
      `--schedule="0 * * * *" ` +
      `--uri="${schedulerUri}" ` +
      `--http-method=POST ` +
      `--oauth-service-account-email=${serviceAccount} ` +
      `--location=${REGION} ` +
      `--project=${PROJECT}`,
    'Creating Cloud Scheduler trigger',
  );
} catch {
  console.log('Scheduler job may already exist, attempting update...');
  run(
    `gcloud scheduler jobs update http ${SCHEDULER_NAME} ` +
      `--schedule="0 * * * *" ` +
      `--uri="${schedulerUri}" ` +
      `--http-method=POST ` +
      `--oauth-service-account-email=${serviceAccount} ` +
      `--location=${REGION} ` +
      `--project=${PROJECT}`,
    'Updating Cloud Scheduler trigger',
  );
}

// 3. Optional: execute the job
if (executeAfter) {
  run(
    `gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT}`,
    'Executing Cloud Run Job (manual trigger)',
  );
}

console.log('\n=== Deployment complete ===');
console.log(`Job: ${JOB_NAME}`);
console.log(`Scheduler: ${SCHEDULER_NAME} (hourly)`);
console.log(`\nTo manually execute: gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT}`);
console.log(`To view logs: gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}" --project=${PROJECT} --limit=50`);
