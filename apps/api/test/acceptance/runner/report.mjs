// Prints one plain pass/fail line per PRD section-13 row from vitest's JSON results.
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { MANUAL, ROWS } from '../rows.mjs';

const pad = (text, width) => String(text).slice(0, width).padEnd(width);
const COLOURS = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function firstLine(messages) {
  const text = (messages ?? []).join('\n').replace(COLOURS, '');
  return text.split('\n').find((line) => line.trim()) ?? '';
}

function resultsByKey(jsonPath) {
  if (!existsSync(jsonPath)) return new Map();
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const map = new Map();
  for (const file of data.testResults ?? []) {
    const key = basename(file.name).replace(/\.acceptance\.ts$/, '');
    map.set(key, file);
  }
  return map;
}

function rowLine(row, file) {
  if (MANUAL[row.key]) return { status: 'MANUAL', tests: '-', note: MANUAL[row.key] };
  if (!file) return { status: 'NOT RUN', tests: '-', note: '' };
  const tests = file.assertionResults ?? [];
  const passed = tests.filter((test) => test.status === 'passed').length;
  const failed = tests.filter((test) => test.status === 'failed');
  const ok = failed.length === 0 && file.status !== 'failed';
  const note = failed[0]
    ? `${failed[0].title}: ${firstLine(failed[0].failureMessages)}`
    : ok
      ? ''
      : firstLine([file.message]);
  return { status: ok ? 'PASS' : 'FAIL', tests: `${passed}/${tests.length}`, note };
}

/** Returns true when every automated row passed. */
export function printTable(jsonPath, { partial = false } = {}) {
  const results = resultsByKey(jsonPath);
  const lines = ROWS.map((row) => ({ row, ...rowLine(row, results.get(row.key)) })).filter(
    (line) => !partial || line.status !== 'NOT RUN',
  );
  console.info('');
  console.info('PRD section 13 — acceptance results');
  console.info(`${pad('Area', 20)} ${pad('Result', 8)} ${pad('Tests', 6)} Notes`);
  console.info(`${'-'.repeat(20)} ${'-'.repeat(8)} ${'-'.repeat(6)} ${'-'.repeat(40)}`);
  for (const line of lines) {
    console.info(
      `${pad(line.row.area, 20)} ${pad(line.status, 8)} ${pad(line.tests, 6)} ${line.note.slice(0, 160)}`,
    );
  }
  const failed = lines.filter((line) => line.status === 'FAIL' || line.status === 'NOT RUN');
  console.info('');
  console.info(
    failed.length === 0
      ? 'All automated rows passed. Run the manual UX checklist before release.'
      : `${failed.length} row(s) did not pass.`,
  );
  return failed.length === 0;
}
