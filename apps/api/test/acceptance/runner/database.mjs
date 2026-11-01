// The acceptance database: always `oneohm_acceptance`, never the dev database.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export const ACCEPTANCE_DB = 'oneohm_acceptance';

/** The dev DATABASE_URL from the repo's .env (or the environment), for its host and user. */
export function devDatabaseUrl(repo) {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync(join(repo, '.env'), 'utf8')
    .split('\n')
    .find((row) => row.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is missing from .env.');
  return line.slice('DATABASE_URL='.length).trim();
}

/** Same server and user, database name replaced by `oneohm_acceptance`. */
export function acceptanceUrl(devUrl) {
  const url = new URL(devUrl);
  url.pathname = `/${ACCEPTANCE_DB}`;
  return url.toString();
}

function assertAcceptance(url) {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name !== ACCEPTANCE_DB) throw new Error(`Refusing to touch database "${name}".`);
}

/** Drops and recreates ONLY `oneohm_acceptance`, through the server's maintenance database. */
export async function recreateDatabase(repo, url) {
  assertAcceptance(url);
  const require = createRequire(join(repo, 'packages/database/package.json'));
  const { Client } = require('pg');
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${ACCEPTANCE_DB} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${ACCEPTANCE_DB}`);
  } finally {
    await client.end();
  }
}

/** The same migrations and day-one seed the dev database gets. */
export function migrateAndSeed(repo, url) {
  assertAcceptance(url);
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'development' };
  const run = (script) =>
    execFileSync(process.execPath, [join(repo, 'packages/database/dist', script)], {
      cwd: join(repo, 'packages/database'),
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8',
    }).trim();
  console.info(`  ${run('migrate.cli.js')}`);
  console.info(`  ${run('seed/seed.cli.js').split('\n')[0]}`);
}
