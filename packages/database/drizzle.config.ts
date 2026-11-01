import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://oneohm:oneohm-local-only@127.0.0.1:5460/oneohm',
  },
  strict: true,
  verbose: true,
});
