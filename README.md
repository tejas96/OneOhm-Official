# OneOhm

The operating system for OneOhm's solar EPC business. It covers:

- leads and customers;
- quotations with the PM Surya Ghar subsidy;
- projects and their tasks;
- DISCOM work;
- field crews;
- finance;
- statutory reports;
- the customer journey.

Monorepo: pnpm + Turborepo + Biome, TypeScript everywhere. One ts-rest contract is shared by the API, the web app and both mobile apps.

| Path | What |
|---|---|
| `apps/web` | Business web app for owners and the office (Next.js App Router, Tailwind 4, next-intl) |
| `apps/api` | HTTP API (NestJS + ts-rest), sessions, PDFs (Chromium), object storage (RustFS) |
| `apps/worker` | Temporal worker: WhatsApp delivery with retries, daily reminders |
| `apps/field` | Field mobile app for staff, I&C crews and resellers (Expo) |
| `apps/customer` | Customer mobile app (Expo) |
| `packages/api-contracts` | The ts-rest contract and zod schemas every app shares |
| `packages/domain` | Business rules: roles and permissions, EPC stages, subsidy, pricing, payment milestones, task generation |
| `packages/database` | PostgreSQL 17 schema, migrations and seed (Drizzle) |
| `packages/design-system` | Tokens (web + mobile), theme CSS, web components |
| `packages/mobile-ui` | Shared React Native kit for both mobile apps |
| `packages/shared` | Indian money, solar capacity and calendar helpers |
| `infrastructure/docker` | Local services, production Dockerfile, compose stack, Caddy |

## Run it locally

```bash
cp .env.example .env              # then fill in what you need
pnpm install
pnpm infra:up                     # PostgreSQL :5460, RustFS :9120, Temporal :7250 (UI :8250)
pnpm build
DATABASE_URL=postgres://oneohm:oneohm-local-only@127.0.0.1:5460/oneohm node packages/database/dist/migrate.cli.js
pnpm --filter @oneohm/database db:seed
```

Maps: the API and web read `GOOGLE_MAPS_API_KEY` from the root `.env`. The field app's pin map is `expo-maps`: Apple Maps on iOS (iOS 17+, no key needed) and Google Maps on Android. The field app does not load the root `.env`: Expo reads only `apps/field/.env` (git-ignored) and the shell, so set the Android key there when building, e.g. `GOOGLE_MAPS_API_KEY=<key> npx expo run:android` (or `GOOGLE_MAPS_ANDROID_KEY`, which wins); without one the Android build shows no map. It needs a new dev build (`npx expo run:ios` / `run:android`) because `expo-maps` is native. EAS builds need the key as an EAS environment variable.

Then start each part in its own terminal:

```bash
cd apps/api && node --env-file=../../.env --enable-source-maps dist/main.js       # http://localhost:4200
cd apps/worker && node --env-file=../../.env --enable-source-maps dist/main.js    # Temporal worker
pnpm --filter @oneohm/web dev                                                       # http://localhost:3200
EXPO_PUBLIC_API_URL=http://<laptop-ip>:4200 pnpm --filter @oneohm/field start      # field app
EXPO_PUBLIC_API_URL=http://<laptop-ip>:4200 pnpm --filter @oneohm/customer start   # customer app
```

Sign in to the web app as `admin@oneohm.local` / `OneOhm@2026`, the development Super Admin.

The mobile apps use a one-time code. With `OTP_PROVIDER=local` the code is `OTP_DEVELOPMENT_CODE` and no SMS is sent.

WhatsApp messages stay in log mode until `WHATSAPP_DELIVERY=live`.

## Checks

```bash
pnpm check     # Biome lint, ≤ 250 lines per file, typecheck, unit tests
```

## Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). It covers a single Oracle Cloud Ampere VM running Docker Compose: Caddy TLS, PostgreSQL, RustFS, Temporal, API, worker and web.
