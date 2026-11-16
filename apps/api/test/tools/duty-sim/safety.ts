/** The simulator only ever talks to the acceptance API and its database. Pure checks. */
export const ACCEPTANCE_DB = 'oneohm_acceptance';
export const ACCEPTANCE_PORT = '4300';
export const DEFAULT_API = 'http://localhost:4300';
export const START_COMMAND = 'pnpm test:acceptance 87-duty-day-auto-site-visits --keep';

/** The `/v1` base URL for `--api` (or the default); only localhost or 127.0.0.1, only port 4300. */
export function safeApiUrl(text: string | undefined): string {
  const url = new URL(text ?? DEFAULT_API);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(
      `Refusing host "${url.hostname}": the simulator talks to a local acceptance API only.`,
    );
  }
  if (url.protocol !== 'http:' || url.port !== ACCEPTANCE_PORT) {
    throw new Error(
      `Refusing ${url.origin}: the simulator talks to the acceptance API on port ${ACCEPTANCE_PORT} only (never the dev API).`,
    );
  }
  return `${url.origin}/v1`;
}

/** The connection text for `oneohm_acceptance` (same server and user as the dev URL). */
export function acceptanceDbUrl(explicit: string | undefined, devUrl: string | undefined): string {
  const base = explicit ?? devUrl;
  if (!base)
    throw new Error('No DATABASE_URL in the environment or the repo .env to take the server from.');
  const url = new URL(base);
  if (explicit) {
    const name = url.pathname.replace(/^\//, '');
    if (name !== ACCEPTANCE_DB)
      throw new Error(`Refusing database "${name}": only ${ACCEPTANCE_DB}.`);
    return url.toString();
  }
  url.pathname = `/${ACCEPTANCE_DB}`;
  return url.toString();
}

/** The `DATABASE_URL=` line of a .env file's text, or undefined. */
export function databaseUrlFromEnvFile(text: string): string | undefined {
  const line = text.split('\n').find((row) => row.startsWith('DATABASE_URL='));
  return line
    ?.slice('DATABASE_URL='.length)
    .trim()
    .replace(/^["']|["']$/g, '');
}
