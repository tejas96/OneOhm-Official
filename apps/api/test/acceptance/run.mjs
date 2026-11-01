#!/usr/bin/env node
// `pnpm test:acceptance`: the PRD section-13 scenarios end to end against a throw-away
// database (`oneohm_acceptance`) and a separate API on port 4300.
//
// Flags:
//   --skip-build   use the current dist folders instead of building the API and its packages
//   --keep         leave the API on 4300 running afterwards (for writing scenarios)
//   --reuse        use the API already on 4300 and its database as they are (no reset)
//   --stop         stop the API on 4300 and exit
//   any other argument filters scenario files, e.g. `pnpm test:acceptance 05-discom`
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_LOG, API_URL, isUp, startApi, stopListener } from './runner/api-process.mjs';
import {
  acceptanceUrl,
  devDatabaseUrl,
  migrateAndSeed,
  recreateDatabase,
} from './runner/database.mjs';
import { printTable } from './runner/report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../../..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const filters = args.filter((arg) => !arg.startsWith('--'));

if (flag('--stop')) {
  console.info(`Stopped ${stopListener()} process(es) on port 4300.`);
  process.exit(0);
}

const databaseUrl = acceptanceUrl(devDatabaseUrl(repo));
const reuse = flag('--reuse');

if (!reuse && !flag('--skip-build')) {
  console.info('Building the API and the packages it uses…');
  try {
    execFileSync(
      'pnpm',
      ['turbo', 'run', 'build', '--filter=@oneohm/api...', '--output-logs=errors-only'],
      { cwd: repo, stdio: 'inherit' },
    );
  } catch {
    console.error(
      'The build failed (see above). Fix it, or pass --skip-build to use the current dist.',
    );
    process.exit(1);
  }
}

let api = null;
if (reuse) {
  if (!(await isUp())) throw new Error(`--reuse needs the acceptance API on ${API_URL}.`);
  console.info(`Reusing the acceptance API on ${API_URL}.`);
} else {
  console.info('Recreating the oneohm_acceptance database…');
  await recreateDatabase(repo, databaseUrl);
  migrateAndSeed(repo, databaseUrl);
  console.info(`Starting the acceptance API on ${API_URL} (log: ${API_LOG})…`);
  api = await startApi(repo, databaseUrl, { detached: flag('--keep') });
}

const resultsPath = join(tmpdir(), `oneohm-acceptance-results-${process.pid}.json`);
const vitest = spawnSync(
  join(repo, 'apps/api/node_modules/.bin/vitest'),
  [
    'run',
    '--config',
    join(here, 'vitest.config.mts'),
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${resultsPath}`,
    ...filters,
  ],
  {
    cwd: here,
    stdio: 'inherit',
    env: {
      ...process.env,
      ACCEPTANCE_API_URL: `${API_URL}/v1`,
      ACCEPTANCE_DATABASE_URL: databaseUrl,
    },
  },
);

if (api && !flag('--keep')) api.kill();
if (api && flag('--keep')) {
  api.unref();
  console.info(`The acceptance API stays up on ${API_URL}; stop it with --stop.`);
}

const passed = printTable(resultsPath, { partial: filters.length > 0 });
if (vitest.status !== 0) console.info('Vitest reported failures; see its output above.');
process.exit(passed && vitest.status === 0 ? 0 : 1);
