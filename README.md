# OneOhm

The operating system for OneOhm's solar EPC business: leads, quotations with subsidy,
projects, DISCOM work, field crews, contractors, finance and the customer journey.

Monorepo: pnpm + Turborepo + Biome, TypeScript everywhere.

| Path | What |
|---|---|
| `apps/web` | Business web app (Next.js App Router, Tailwind 4, next-intl) |
| `packages/design-system` | Tokens (web + mobile), theme CSS generator, web components |
| `packages/shared` | Framework-free helpers (Indian money, solar capacity) |
| `tooling/typescript` | Shared strict TypeScript configs |
| `infrastructure/docker` | Local PostgreSQL 17, RustFS object storage, Temporal |

## Run it

```bash
pnpm install
pnpm build
pnpm --filter @oneohm/web dev        # http://localhost:3200
pnpm infra:up                        # PostgreSQL :5460, RustFS :9120/:9121, Temporal :7250 (UI :8250)
```

## Checks

```bash
pnpm check     # Biome lint, ≤ 250 lines per file, typecheck, unit tests
```

## Status

Design foundation only. `/sign-in` and `/command-center` are design previews; the
command centre shows clearly labelled sample figures (`features/command-center/preview-data.ts`)
until the API exists.
