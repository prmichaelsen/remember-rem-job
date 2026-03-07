/**
 * Deploy remember-rem-job (scheduler + worker) to GCP.
 *
 * Prerequisites:
 * - gcloud CLI authenticated with com-f5-parm project
 * - All secrets exist in Secret Manager (remember-* prefix)
 *
 * Usage:
 *   npx tsx scripts/deploy.ts
 *   npx tsx scripts/deploy.ts --skip-build    # skip Cloud Build, just create scheduler
 *   npx tsx scripts/deploy.ts --execute        # manually execute the scheduler after deploy
 */

import { execSync } from 'node:child_process';

const PROJECT = 'com-f5-parm';
const REGION = 'us-central1';
const SCHEDULER_JOB_NAME = 'remember-rem-scheduler';
const WORKER_JOB_NAME = 'remember-rem-worker';
const SCHEDULER_TRIGGER_NAME = 'remember-rem-scheduler-trigger';

const COMMIT_SHA = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const executeAfter = args.includes('--execute');

function run(cmd: string, label: string) {
  console.log(`\n=== ${label} ===`);
  console.log(`> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });
}

// 1. Submit Cloud Build (builds image, deploys both scheduler and worker jobs)
if (!skipBuild) {
  run(
    `gcloud builds submit --config=cloudbuild.yaml --substitutions=COMMIT_SHA=${COMMIT_SHA} --project=${PROJECT}`,
    'Submitting Cloud Build (scheduler + worker)',
  );
}

// 2. Create/update Cloud Scheduler (daily at midnight UTC)
const schedulerUri = `https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${SCHEDULER_JOB_NAME}:run`;

const serviceAccount = execSync(
  `gcloud iam service-accounts list --project=${PROJECT} --filter="displayName:Compute Engine default" --format="value(email)"`,
  { encoding: 'utf-8' },
).trim();

console.log(`\nUsing service account: ${serviceAccount}`);

try {
  run(
    `gcloud scheduler jobs create http ${SCHEDULER_TRIGGER_NAME} ` +
      `--schedule="0 0 * * *" ` +
      `--uri="${schedulerUri}" ` +
      `--http-method=POST ` +
      `--oauth-service-account-email=${serviceAccount} ` +
      `--location=${REGION} ` +
      `--project=${PROJECT}`,
    'Creating Cloud Scheduler trigger (daily)',
  );
} catch {
  console.log('Scheduler trigger may already exist, attempting update...');
  run(
    `gcloud scheduler jobs update http ${SCHEDULER_TRIGGER_NAME} ` +
      `--schedule="0 0 * * *" ` +
      `--uri="${schedulerUri}" ` +
      `--http-method=POST ` +
      `--oauth-service-account-email=${serviceAccount} ` +
      `--location=${REGION} ` +
      `--project=${PROJECT}`,
    'Updating Cloud Scheduler trigger (daily)',
  );
}

// 3. Ensure scheduler service account can invoke the worker job
console.log('\n=== Checking IAM permissions ===');
console.log(`Service account ${serviceAccount} needs roles/run.invoker on ${WORKER_JOB_NAME}`);
console.log('If workers fail to trigger, run:');
console.log(`  gcloud run jobs add-iam-policy-binding ${WORKER_JOB_NAME} \\`);
console.log(`    --member="serviceAccount:${serviceAccount}" \\`);
console.log(`    --role="roles/run.invoker" \\`);
console.log(`    --region=${REGION} --project=${PROJECT}`);

// 4. Optional: execute the scheduler
if (executeAfter) {
  run(
    `gcloud run jobs execute ${SCHEDULER_JOB_NAME} --region=${REGION} --project=${PROJECT}`,
    'Executing scheduler (manual trigger)',
  );
}

console.log('\n=== Deployment complete ===');
console.log(`Scheduler job: ${SCHEDULER_JOB_NAME}`);
console.log(`Worker job: ${WORKER_JOB_NAME}`);
console.log(`Scheduler trigger: ${SCHEDULER_TRIGGER_NAME} (daily at midnight UTC)`);
console.log(`\nTo manually execute scheduler: gcloud run jobs execute ${SCHEDULER_JOB_NAME} --region=${REGION} --project=${PROJECT}`);
console.log(`To view scheduler logs: gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${SCHEDULER_JOB_NAME}" --project=${PROJECT} --limit=50`);
console.log(`To view worker logs: gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${WORKER_JOB_NAME}" --project=${PROJECT} --limit=50`);
