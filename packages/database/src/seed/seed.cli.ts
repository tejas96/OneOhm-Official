import { createDatabaseConnection } from '../client';
import { runSeed } from './seed';

const DEV_EMAIL = 'admin@oneohm.local';
const DEV_PASSWORD = 'OneOhm@2026';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required to seed.');
  process.exit(1);
}
const production = process.env.NODE_ENV === 'production';
const email = process.env.SEED_ADMIN_EMAIL ?? (production ? undefined : DEV_EMAIL);
const password = process.env.SEED_ADMIN_PASSWORD ?? (production ? undefined : DEV_PASSWORD);
if (!email || !password) {
  console.error(
    'In production set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD for the first Super Admin.',
  );
  process.exit(1);
}

const connection = createDatabaseConnection(url, { max: 1 });
runSeed(connection.db, { email, password, fullName: process.env.SEED_ADMIN_NAME ?? 'OneOhm Admin' })
  .then(({ adminCreated }) => {
    console.info('Seed complete.');
    if (adminCreated) console.info(`Super Admin: ${email}${production ? '' : ` / ${password}`}`);
  })
  .catch((error: unknown) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => connection.close());
