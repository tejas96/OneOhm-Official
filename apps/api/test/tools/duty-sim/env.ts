// Imported FIRST by main.ts: the acceptance support modules read these variables when they
// load, so the checks and the variables must be settled before any of them is imported.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from './args';
import { acceptanceDbUrl, databaseUrlFromEnvFile, safeApiUrl } from './safety';

export const HERE = __dirname;
export const OUT_DIR = join(HERE, 'out');
const REPO = join(HERE, '../../../../..');

function refuse(error: unknown): never {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

export const args = (() => {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (error) {
    return refuse(error);
  }
})();
export const apiUrl = (() => {
  try {
    return safeApiUrl(args.api);
  } catch (error) {
    return refuse(error);
  }
})();

const envFile = join(REPO, '.env');
const fromFile = existsSync(envFile)
  ? databaseUrlFromEnvFile(readFileSync(envFile, 'utf8'))
  : undefined;
export const databaseUrl = (() => {
  try {
    return acceptanceDbUrl(
      process.env.ACCEPTANCE_DATABASE_URL,
      process.env.DATABASE_URL ?? fromFile,
    );
  } catch (error) {
    return refuse(error);
  }
})();

// pg warns about overlapping queries inside the acceptance helpers; not useful here.
process.noDeprecation = true;
process.env.ACCEPTANCE_API_URL = apiUrl;
process.env.ACCEPTANCE_DATABASE_URL = databaseUrl;
