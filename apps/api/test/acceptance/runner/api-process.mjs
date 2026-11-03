// A separate API process for the suite on port 4300; the dev API on 4200 is never touched.
import { execFileSync, spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ACCEPTANCE_PORT = 4300;
export const API_URL = `http://localhost:${ACCEPTANCE_PORT}`;
export const API_LOG = join(tmpdir(), 'oneohm-acceptance-api.log');

/** Test-safe settings over the repo .env: nothing real is sent, paid or texted. */
export function apiEnvironment(databaseUrl) {
  return {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    API_PORT: String(ACCEPTANCE_PORT),
    API_PUBLIC_URL: API_URL,
    WHATSAPP_DELIVERY: 'log',
    OTP_PROVIDER: 'local',
    OTP_DEVELOPMENT_CODE: '123456',
    OTP_REQUESTS_PER_10_MIN: '1000',
    RAZORPAY_MODE: 'sandbox',
    RAZORPAYX_MODE: 'sandbox',
    // Known secrets so the suite can sign gateway webhooks like Razorpay does.
    RAZORPAY_WEBHOOK_SECRET: 'oneohm-acceptance-webhook-secret',
    RAZORPAYX_WEBHOOK_SECRET: 'oneohm-acceptance-webhook-secret',
    WHATSAPP_APP_SECRET: 'oneohm-acceptance-whatsapp-secret',
    // Empty means "not set": no real gateway or messaging keys reach this process.
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    WHATSAPP_ACCESS_TOKEN: '',
    MSG91_AUTH_KEY: '',
    // The nudge job runs only when a scenario asks for it, at a clock the scenario sets.
    ONBOARDING_NUDGE_TIMER: 'false',
    // Uploaded test files go to their own bucket, created on start-up.
    STORAGE_BUCKET: 'oneohm-acceptance',
  };
}

export async function isUp() {
  try {
    const res = await fetch(`${API_URL}/v1/health/ready`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Starts `apps/api/dist/main.js` with the env file plus the overrides above. */
export async function startApi(repo, databaseUrl, { detached = false } = {}) {
  if (await isUp()) {
    throw new Error(
      `Something already answers on port ${ACCEPTANCE_PORT}. Stop it (pnpm test:acceptance --stop) or pass --reuse.`,
    );
  }
  const log = openSync(API_LOG, 'w');
  const child = spawn(process.execPath, ['--env-file=../../.env', 'dist/main.js'], {
    cwd: join(repo, 'apps/api'),
    env: apiEnvironment(databaseUrl),
    stdio: ['ignore', log, log],
    detached,
  });
  for (let second = 0; second < 60; second += 1) {
    if (await isUp()) return child;
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  child.kill();
  throw new Error(`The acceptance API did not start; see ${API_LOG}.`);
}

/** Stops whatever listens on 4300 (the suite's own API from an earlier --keep run). */
export function stopListener() {
  let pids = '';
  try {
    pids = execFileSync('lsof', ['-ti', `tcp:${ACCEPTANCE_PORT}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 0;
  }
  const list = pids.split('\n').filter(Boolean);
  for (const pid of list) process.kill(Number(pid));
  return list.length;
}
