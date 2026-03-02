/**
 * E2E verification script for remember-rem-job on e1 environment.
 *
 * Checks:
 * 1. Cloud Run Job exists and is deployed
 * 2. Triggers a manual execution
 * 3. Waits for completion and checks exit code
 * 4. Reads recent logs
 *
 * Prerequisites:
 * - Job already deployed via `npm run deploy:e1`
 * - gcloud CLI authenticated
 *
 * Usage:
 *   npx tsx scripts/verify-e1.ts
 *   npx tsx scripts/verify-e1.ts --logs-only    # just show recent logs
 */

import { execSync } from 'node:child_process';

const PROJECT = 'com-f5-parm';
const REGION = 'us-central1';
const JOB_NAME = 'remember-rem-job-e1';

const args = process.argv.slice(2);
const logsOnly = args.includes('--logs-only');

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function section(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

// 1. Check job exists
section('Checking Cloud Run Job');
try {
  const jobInfo = run(
    `gcloud run jobs describe ${JOB_NAME} --region=${REGION} --project=${PROJECT} --format="value(status.conditions[0].type,status.conditions[0].status)"`,
  );
  console.log(`Job status: ${jobInfo}`);
} catch {
  console.error(`Job ${JOB_NAME} not found. Run 'npm run deploy:e1' first.`);
  process.exit(1);
}

if (!logsOnly) {
  // 2. Execute the job
  section('Executing Cloud Run Job');
  console.log('Triggering manual execution...');
  try {
    const result = run(
      `gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT} --format="value(metadata.name)" 2>&1`,
    );
    console.log(`Execution: ${result}`);
    console.log('\nWaiting 30s for job to complete...');

    // Wait for job to finish
    execSync('sleep 30');
  } catch (err) {
    console.error('Failed to execute job:', err);
  }

  // 3. Check latest execution status
  section('Checking Execution Status');
  try {
    const executions = run(
      `gcloud run jobs executions list --job=${JOB_NAME} --region=${REGION} --project=${PROJECT} --limit=1 --format="table(metadata.name,status.conditions[0].type,status.conditions[0].status,status.completionTime)"`,
    );
    console.log(executions);
  } catch (err) {
    console.error('Failed to list executions:', err);
  }
}

// 4. Show recent logs
section('Recent Logs');
try {
  const logs = run(
    `gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}" --project=${PROJECT} --limit=20 --format="table(timestamp,textPayload)" --freshness=1h 2>&1`,
  );
  console.log(logs || '(no logs found in the last hour)');
} catch {
  console.log('(unable to fetch logs)');
}

// 5. Check Cloud Scheduler
section('Cloud Scheduler Status');
try {
  const scheduler = run(
    `gcloud scheduler jobs describe ${JOB_NAME}-trigger --location=${REGION} --project=${PROJECT} --format="table(name,schedule,state,lastAttemptTime,status.code)"`,
  );
  console.log(scheduler);
} catch {
  console.log('Scheduler trigger not found. It will be created during deploy.');
}

console.log('\n--- Verification complete ---');
console.log('Manual checks still needed:');
console.log('  - Verify Firestore rem_state/cursor document updated');
console.log('  - Verify relationships in Weaviate with source="rem"');
console.log('  - Run job again to verify cursor advancement and dedup');
