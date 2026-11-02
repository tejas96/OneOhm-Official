# Google Maps Part 1 — Pin the Roof — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Field workers get a precise GPS reading and pin the exact roof on a Google satellite map; office staff pin sites on a map on the web; field pins far from the worker are flagged for the office; Navigate uses the pin.

**Architecture:** Pure rules (pin trust, which source may replace which) live in `packages/domain` with unit tests. The API stores how each property location was set and applies the 100 m rule on the server against the check-in reading it already holds. The field app uses `react-native-maps` (Google provider, satellite) inside the existing site visit card; the web uses `@vis.gl/react-google-maps` inside the existing property form. Only map display uses client keys; part 1 makes no Google web-service calls.

**Tech Stack:** TypeScript, NestJS + ts-rest, Drizzle/PostgreSQL 17, Next.js 16 App Router + next-intl, Expo 58 + expo-location + react-native-maps, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-11-03-google-maps-design.md` (sections 6.1, 6.2, 6.7 Navigate, 7, 9). Read it first.

## Global Constraints

- **Maps never block work.** Every map step has the old flow as fallback (GPS reading, typed numbers).
- No Google key configured → every map UI is hidden and the old inputs show.
- Field pin trust limit: **100 m** from the worker's check-in reading, stored as policy `travel.pinTrustM` (default 100, owner can change in settings).
- Pin beyond limit, or no check-in reading: **saved anyway**, flagged; office sees "Site pin moved {n} m from where the worker stood".
- `map_pin` and `typed` are trusted; `gps` and `address` only fill an empty location and never silently replace a trusted one.
- Precise reading: `Accuracy.Highest`, stop at accuracy ≤ **10 m** or after **15 s**, keep the best. Only site check-in/out and pinning use it; attendance keeps `readLocation()`.
- Property locations are not cleared by the 90-day retention job. Worker readings still are.
- Consent and working-hours rules unchanged (`apps/api/src/modules/workforce/tracking.ts`).
- Files ≤ 250 lines (`pnpm check:file-size`). Touch targets ≥ 44 pt. Plain words. Field copy in `apps/field/src/copy`, web copy in `apps/web/messages/en-IN`.
- Env names: `GOOGLE_MAPS_API_KEY` (dev fallback for all), `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_ANDROID_KEY`, `GOOGLE_MAPS_IOS_KEY`. Part 1 needs no server key.
- Do not commit real keys. `.env.example` files get the names with empty values.

## Review Focus

1. **No signal on the roof.** Map tiles fail to load → sheet shows "Map not loading. Use my GPS reading" within 8 s and that button saves the GPS point. Test in Task 6.
2. **Location sharing off or outside working hours.** No check-in reading → a pin is still saved, flagged with `locationFlaggedM = null` and shown as "Site pin set without a location reading". Test in Task 3.
3. **Pin replaces another person's pin.** Previous point kept in `previous_latitude/longitude`; "Put back" restores it. Test in Task 3.
4. **No Google key at all.** `GET /maps/config` returns `browserKey: null`; web shows the old number inputs; field app shows the old "Save site location" button. Tests in Tasks 4 and 7.
5. **Double tap on "This is the roof".** Second identical request is harmless (same result, one audit entry per distinct point). Test in Task 3.

---

### Task 1: Domain rules — pin trust and source precedence

**Files:**
- Create: `packages/domain/src/workforce/site-pin.ts`
- Create: `packages/domain/src/workforce/site-pin.test.ts`
- Modify: `packages/domain/src/workforce/policy.ts` (`SiteTravelPolicy`, `DEFAULT_WORKFORCE_POLICY.travel`)
- Modify: `packages/domain/src/workforce/index.ts` (export)
- Modify: `packages/api-contracts/src/schemas/workforce.schema.ts:43` area (`travel` object)

**Interfaces:**
- Produces:
  - `type LocationSource = 'gps' | 'map_pin' | 'address' | 'typed'`
  - `judgeSitePin(pin: GeoPoint, reading: (GeoPoint & { accuracyM?: number | null }) | null, limitM: number): { distanceM: number | null; flagged: boolean }`
  - `locationChange(current: { point: GeoPoint | null; source: LocationSource | null }, incoming: LocationSource): 'fill' | 'replace' | 'ask'`
  - `SiteTravelPolicy.pinTrustM: number` (default 100); contract `pinTrustM: z.number().int().min(25).max(2000).default(100)`

- [ ] **Step 1: Write the failing tests** in `site-pin.test.ts`:

```ts
const reading = { latitude: 16.8524, longitude: 74.5815, accuracyM: 8 };
it('trusts a pin within the limit', () => {
  const pin = { latitude: 16.8530, longitude: 74.5815 }; // ~67 m north
  expect(judgeSitePin(pin, reading, 100)).toEqual({ distanceM: 67, flagged: false });
});
it('flags a pin beyond the limit but returns its distance', () => {
  const pin = { latitude: 16.8546, longitude: 74.5815 }; // ~245 m
  expect(judgeSitePin(pin, reading, 100)).toMatchObject({ flagged: true });
  expect(judgeSitePin(pin, reading, 100).distanceM).toBeGreaterThan(200);
});
it('flags a pin with no reading to compare', () => {
  expect(judgeSitePin(reading, null, 100)).toEqual({ distanceM: null, flagged: true });
});
it('does not use phone accuracy as slack', () => {
  const pin = { latitude: 16.8535, longitude: 74.5815 }; // ~122 m
  expect(judgeSitePin(pin, { ...reading, accuracyM: 60 }, 100).flagged).toBe(true);
});
it.each([
  [null, 'gps', 'fill'], [null, 'address', 'fill'], [null, 'map_pin', 'fill'],
  ['gps', 'map_pin', 'replace'], ['gps', 'typed', 'replace'], ['gps', 'gps', 'ask'],
  ['map_pin', 'map_pin', 'replace'], ['typed', 'map_pin', 'replace'], ['map_pin', 'typed', 'replace'],
  ['map_pin', 'gps', 'ask'], ['map_pin', 'address', 'ask'], ['typed', 'address', 'ask'],
  ['address', 'gps', 'ask'], ['gps', 'address', 'ask'], ['address', 'map_pin', 'replace'],
])('current %s + incoming %s → %s', (source, incoming, expected) => {
  const point = source ? { latitude: 1, longitude: 1 } : null;
  expect(locationChange({ point, source }, incoming)).toBe(expected);
});
it('treats a located property with unknown source (old data) as gps', () => {
  expect(locationChange({ point: { latitude: 1, longitude: 1 }, source: null }, 'address')).toBe('ask');
  expect(locationChange({ point: { latitude: 1, longitude: 1 }, source: null }, 'map_pin')).toBe('replace');
});
```

- [ ] **Step 2: Run** `pnpm --filter @oneohm/domain test site-pin` — expect FAIL (module not found).
- [ ] **Step 3: Implement** `site-pin.ts`. Distance is `Math.round(distanceMeters(...))` from `attendance.ts`; flagged when `reading === null || distanceM > limitM` (no accuracy slack: the pin is a deliberate choice). In `locationChange`: no point → `fill`; incoming `map_pin | typed` → `replace`; incoming `gps | address` on any located property → `ask` (they only fill an empty location). A null source with a point counts as `gps`.
- [ ] **Step 4: Add `pinTrustM`** to `SiteTravelPolicy` (doc comment: "A field pin farther than this from the worker's check-in reading is flagged for the office, in metres."), default `100`, and to the contract `travel` object with `.default(100)` so saved policies still parse.
- [ ] **Step 5: Run** `pnpm --filter @oneohm/domain test && pnpm --filter @oneohm/api-contracts typecheck` — expect PASS.
- [ ] **Step 6: Commit** `feat(domain): site pin trust rule and location source precedence`

---

### Task 2: Database — how each property location was set

**Files:**
- Modify: `packages/database/src/schema/crm.schema.ts:55-80` (`properties`)
- Create: `packages/database/migrations/0059_property_location_source.sql` (+ meta snapshot via `pnpm --filter @oneohm/database db:generate`)
- Modify: `packages/api-contracts/src/schemas/crm.schema.ts:108-111` (`propertySchema`)
- Modify: the CRM property reader that maps rows to `Property` (find with `grep -rn "subsidyClaimed:" apps/api/src/modules/crm`)

**Interfaces:**
- Produces columns on `properties`:
  - `location_source` — pg enum `location_source` (`gps`,`map_pin`,`address`,`typed`), nullable
  - `location_accuracy_m` int null · `located_at` timestamptz null · `located_by_user_id` uuid null → users, on delete set null
  - `location_flagged` boolean not null default false · `location_flag_distance_m` int null
  - `previous_latitude` / `previous_longitude` double precision null
- Produces on `propertySchema` (all `.optional()` so old clients parse): `locationSource: LocationSource | null`, `locatedAt: instant | null`, `locationFlagged: boolean`, `locationFlagDistanceM: number | null`, `hasPreviousLocation: boolean`.

- [ ] **Step 1: Add columns** to the Drizzle table and the enum next to the other CRM enums.
- [ ] **Step 2: Generate** `pnpm --filter @oneohm/database db:generate`; rename the output to `0059_property_location_source.sql`. Add a backfill line: `UPDATE properties SET location_source = 'gps' WHERE latitude IS NOT NULL;`.
- [ ] **Step 3: Check retention.** Read `packages/database/src/location-retention.ts` and confirm it never touches `properties`. Add a test there (or extend its existing test) asserting a property's `latitude`, `previous_latitude` survive a sweep.
- [ ] **Step 4: Map new fields** in the property reader and contract.
- [ ] **Step 5: Run** `pnpm infra:up`, then `DATABASE_URL=postgres://oneohm:oneohm-local-only@127.0.0.1:5460/oneohm node packages/database/dist/migrate.cli.js` after `pnpm --filter @oneohm/database build` — expect migration 0059 applied. Run `pnpm typecheck` — PASS.
- [ ] **Step 6: Commit** `feat(database): record how each property location was set`

---

### Task 3: API — field pin with the 100 m rule; office confirm and put back

**Files:**
- Modify: `packages/api-contracts/src/contracts/site-activity.contract.ts:41-47` (`saveSiteLocation` body)
- Modify: `packages/api-contracts/src/schemas/site-activity.schema.ts` (`taskSiteSchema`)
- Modify: `apps/api/src/modules/site-activity/site-visits.service.ts:120-140` (`saveSiteLocation`) and `present()`
- Create: `apps/api/src/modules/site-activity/site-pin.service.ts` (keeps `site-visits.service.ts` under 250 lines)
- Modify: `packages/api-contracts/src/contracts/crm.contract.ts` (two routes + `locationSource` on `propertyInputSchema`)
- Modify: `apps/api/src/modules/crm/site-edit.ts` (`editSite`, `addSite`, `insertLeadSite`)
- Create: `apps/api/src/modules/crm/site-location.ts` (confirm / put back)
- Create: `apps/api/test/acceptance/scenarios/30-site-pin.acceptance.ts`

**Interfaces:**
- Consumes: `judgeSitePin`, `locationChange`, `LocationSource`, `policy.travel.pinTrustM` (Task 1); columns (Task 2).
- Produces:
  - `saveSiteLocation` body: `z.object({ pin: z.object({ latitude, longitude }).optional() }).optional()`. No pin = today's behaviour, source `gps`, fill-only via `locationChange` (`ask` → 409 `site_located`).
  - `taskSiteSchema` adds `sitePoint: { latitude, longitude } | null`, `siteFlagged: boolean` (the property's `location_flagged`) and `canPinSite: boolean` (true when the actor has an open visit on this task). `canSetSite` keeps its meaning.
  - `confirmSiteLocation`: `POST /properties/:id/location/confirm` → `Property`. Clears the flag.
  - `restoreSiteLocation`: `POST /properties/:id/location/restore` → `Property`. Swaps current ↔ previous, clears flag. 409 `no_previous` when none.
  - `propertyInputSchema.locationSource: z.enum(['map_pin','typed']).optional()`.

- [ ] **Step 1: Write the failing acceptance scenario** `30-site-pin.acceptance.ts`, following the style of an existing scenario that checks in at a site (find with `grep -ln "siteCheckIn" apps/api/test/acceptance/scenarios`). Cases:
  - Crew checks in with consent at P; pins 67 m away → property at pin, `locationSource 'map_pin'`, `locationFlagged false`; open visit `checkInDistanceM` recalculated to 67.
  - Pins 245 m away → saved, `locationFlagged true`, `locationFlagDistanceM ≈ 245`; previous point kept.
  - Same pin sent twice → same property; audit log has one `property.located` for that point.
  - Crew without consent checks in, pins → saved, `locationFlagged true`, `locationFlagDistanceM null`.
  - Office `restoreSiteLocation` → previous point back, flag cleared; second restore swaps back.
  - Office `confirmSiteLocation` → flag cleared, point unchanged.
  - Pin with no open visit → 400, message "Check in at this site first."
  - Old client: no body on a located `map_pin` property → 409 `site_located`.
  - Web `updateProperty` with new lat/lng and `locationSource 'map_pin'` → source set, flag cleared, `previous_*` set.
- [ ] **Step 2: Run** `pnpm test:acceptance 30-site-pin` — expect FAIL.
- [ ] **Step 3: Implement `SitePinService.pin(actor, task, open, pin)`** in `site-pin.service.ts`. In one transaction:
  1. Load the property's current point and source.
  2. If the pin equals the current point (within 0.5 m), return without writing.
  3. `judgeSitePin(pin, checkInPoint(open) + open.checkInAccuracyM, policy.travel.pinTrustM)`.
  4. Update `properties`: point, `location_source 'map_pin'`, `located_at`, `located_by_user_id`, `location_flagged`, `location_flag_distance_m`, `previous_*` = old point.
  5. Recalculate the open visit's `checkInDistanceM` / `checkInFar` against the new pin with `siteDistance` and `farFromSiteM`.
  6. `recordAudit(... 'property.located' ...)` with `{ source: 'map_pin', fromVisit, distanceFromReadingM, flagged, previous }`.
  7. `noteSiteSaved(tx, task, actor.userId)`.
- [ ] **Step 4: Route `saveSiteLocation`** to `SitePinService` when `body.pin` exists; otherwise keep today's path but use `locationChange` and set `location_source 'gps'`. Error copy: no open visit → "Check in at this site first.".
- [ ] **Step 5: Implement confirm/restore** in `crm/site-location.ts` behind the same permission the CRM controller uses for `updateProperty`. Audit `property.location_confirmed` / `property.location_restored`.
- [ ] **Step 6: `editSite`/`addSite`/`insertLeadSite`:** when the patch changes latitude/longitude, set `location_source` from `locationSource ?? 'typed'`, `located_at/by`, move old point to `previous_*`, clear the flag, and audit `property.located`. Strip `locationSource` before spreading the input into `properties`.
- [ ] **Step 7: Run** `pnpm test:acceptance 30-site-pin` and `pnpm --filter @oneohm/api test` — expect PASS.
- [ ] **Step 8: Commit** `feat(api): field roof pin with 100 m trust rule; office confirm and put back`

---

### Task 4: Keys and map config

**Files:**
- Modify: `apps/api/src/config/environment.ts` (optional `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_BROWSER_KEY`)
- Create: `apps/api/src/modules/maps/maps.module.ts`, `maps.controller.ts`, `maps.controller.test.ts`
- Create: `packages/api-contracts/src/contracts/maps.contract.ts`; register it with the root contract
- Modify: `apps/api/src/modules/feature-modules.ts`
- Modify: `.env.example`, `infrastructure/docker/production.env.example` (names, empty values, one comment line each)
- Modify: `apps/field/app.config.ts`

**Interfaces:**
- Produces: `GET /maps/config` (signed-in staff) → `{ browserKey: string | null }`, where `browserKey = GOOGLE_MAPS_BROWSER_KEY ?? GOOGLE_MAPS_API_KEY ?? null`. Web reads the key here at run time (no `NEXT_PUBLIC_` variable, no Docker build change). This replaces the spec's "server component reads env" with an API read; same outcome, and the web process does not need the root `.env`.
- Produces: field native keys from `GOOGLE_MAPS_ANDROID_KEY ?? GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_IOS_KEY ?? GOOGLE_MAPS_API_KEY` into `android.config.googleMaps.apiKey` and `ios.config.googleMapsApiKey`; `extra.mapsEnabled: boolean` (true when a key exists).

- [ ] **Step 1: Write the failing test** `maps.controller.test.ts`: with no keys → `{ browserKey: null }`; with only `GOOGLE_MAPS_API_KEY='k'` → `'k'`; with both → the browser key.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/api test maps` — FAIL.
- [ ] **Step 3: Implement** env fields, contract, module, controller.
- [ ] **Step 4: Run** the test — PASS. Then `pnpm --filter @oneohm/field exec expo config --type public | grep -i googleMaps` with the root `.env` loaded — expect the key present on both platforms.
- [ ] **Step 5: Commit** `feat: Google Maps key config for API, web and field app`

---

### Task 5: Field — precise GPS reading

**Files:**
- Create: `apps/field/src/features/attendance/precise-location.ts`
- Create: `apps/field/src/features/attendance/best-reading.ts` + `best-reading.test.ts` (pure logic)
- Modify: `apps/field/src/features/site/use-task-site.ts` (`readIfAllowed` gains `precise: boolean`)
- Modify: `apps/field/src/copy/site.ts`

**Interfaces:**
- Produces:
  - `pickBest(readings: readonly { accuracyM: number | null }[]): index | null` and `shouldStop(best: number | null, elapsedMs: number): boolean` (stop when best ≤ 10 or elapsed ≥ 15 000).
  - `readPreciseLocation(onProgress?: (accuracyM: number | null) => void): Promise<Reading | 'denied' | null>`: same return shape as `readLocation()`. Uses `Location.watchPositionAsync({ accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 })` and always removes the subscription.
  - `readIfAllowed(tracking, { precise: true, onProgress })` for site check-in/out; attendance callers unchanged.

- [ ] **Step 1: Write failing tests** in `best-reading.test.ts`: `pickBest([{accuracyM:40},{accuracyM:12},{accuracyM:null}]) === 1`; `pickBest([]) === null`; `shouldStop(9, 2000) === true`; `shouldStop(11, 14999) === false`; `shouldStop(null, 15000) === true`.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/field test best-reading` — FAIL.
- [ ] **Step 3: Implement** both files. A reading with null accuracy ranks last.
- [ ] **Step 4: Show progress.** While a site check-in reads, the button label shows `SITE.finding(18)` = "Finding your location… 18 m" (and "Finding your location…" before the first fix).
- [ ] **Step 5: Run** field tests and `pnpm --filter @oneohm/field typecheck` — PASS.
- [ ] **Step 6: Commit** `feat(field): precise GPS reading for site visits`

---

### Task 6: Field — pin the roof sheet and Navigate

**Files:**
- Modify: `apps/field/package.json` (add `react-native-maps` at the version `npx expo install react-native-maps` picks)
- Create: `apps/field/src/features/site/pin-sheet.tsx` (map UI)
- Create: `apps/field/src/features/site/pin-sheet-state.ts` + `.test.ts` (pure state: loading → ready | failed after 8 s)
- Create: `apps/field/src/features/site/directions.ts` + `.test.ts`
- Create: `apps/field/src/features/site/use-pending-pin.ts`
- Modify: `apps/field/src/features/site/site-visit-card.tsx`, `use-task-site.ts`
- Modify: `apps/field/src/features/service/service-facts.tsx:84-96`
- Modify: `apps/field/src/copy/site.ts`

**Interfaces:**
- Consumes: `taskSite.sitePoint`, `taskSite.siteFlagged`, `taskSite.canPinSite`, `saveSiteLocation` with `pin` (Task 3); `readPreciseLocation` (Task 5); `extra.mapsEnabled` (Task 4).
- Produces:
  - `directionsUrl(point: GeoPoint | null, address: string | null): string | null` → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` when a point exists, else the existing `search/?api=1&query=` with the address, else null.
  - `PinSheet` props: `{ start: (GeoPoint & { accuracyM: number | null }) | null; saved: GeoPoint | null; onConfirm(pin: GeoPoint): void; onUseGps(): void; onClose(): void }`.
  - `useSiteAction(taskId, 'save')` mutation accepts `{ tracking, pin?: GeoPoint }`.

- [ ] **Step 1: Write failing tests.** `directions.test.ts`: point wins over address; address only → search URL, encoded; neither → null. `pin-sheet-state.test.ts`: `loading` + `mapReady` → `ready`; `loading` + 8000 ms elapsed → `failed`; `ready` never goes to `failed`.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/field test directions pin-sheet-state` — FAIL.
- [ ] **Step 3: Implement** `directions.ts` and `pin-sheet-state.ts`.
- [ ] **Step 4: Build `PinSheet`.** `MapView` with `provider={PROVIDER_GOOGLE}`, `mapType="satellite"`, `showsUserLocation`, initial region from `start`, else `saved`, at about 40 m span. An accuracy `Circle` around `start` when present. A pin fixed in the centre (an overlay `View`, not a marker); the confirmed point is the map centre from `onRegionChangeComplete`. A second `Marker` for `saved` when set. Bottom bar: primary "This is the roof", secondary "Use my GPS reading". In state `failed`, show "Map not loading. Use my GPS reading" as the only primary action. Buttons are 54 tall.
- [ ] **Step 5: Wire the card.** When `mapsEnabled && site.canPinSite`, show "Pin the roof" (or "Move the roof pin" when `sitePoint` exists) instead of "Save site location". It reads a precise location, then opens `PinSheet`. With no reading and no `sitePoint` the sheet cannot centre: show the toast "Share your location to pin the roof." instead. Confirm → `save.mutate({ tracking, pin })`; Use GPS → `save.mutate({ tracking })` (today's path). Toast copy: saved within limit → "Roof pinned"; flagged → "Roof pinned. The office will check it." (the returned `TaskSite.siteFlagged` tells which). When `mapsEnabled` is false, the old button shows exactly as today.
- [ ] **Step 6: Offline pin.** `usePendingPin(taskId)` keeps the last pin that failed with a network error (pattern: `apps/field/src/features/tasks/use-checklist-ticks.ts`) and re-sends it before task Complete and on app focus. The card shows "Roof pin waiting for signal".
- [ ] **Step 7: Navigate.** Add a "Navigate" secondary button to the site visit card using `directionsUrl(site.sitePoint, site.siteLabel)`. Change `service-facts.tsx` to `directionsUrl(<service visit site point>, address)`; if the service visit contract has no site point, add `sitePoint` to it in `packages/api-contracts/src/schemas/service-visit.schema.ts` and fill it in `service-visit-read.ts`.
- [ ] **Step 8: Verify.** Run `pnpm --filter @oneohm/field test && pnpm --filter @oneohm/field typecheck`. Then build a dev client (`npx expo run:ios` or `run:android`), start the local stack, and on the simulator: check in on a survey task, pin the roof, see the toast; turn network off and confirm the fallback appears within 8 s.
- [ ] **Step 9: Commit** `feat(field): pin the roof on a satellite map; navigate to the pin`

---

### Task 7: Web — map pin on property, company base and work locations; office flag

**Files:**
- Modify: `apps/web/package.json` (add `@vis.gl/react-google-maps`, exact current version)
- Create: `apps/web/src/features/maps/use-maps-config.ts` (React Query on `GET /maps/config`)
- Create: `apps/web/src/features/maps/pin-map.tsx`
- Create: `apps/web/src/features/maps/pin-map-value.ts` + `.test.ts` (pure helpers)
- Modify: `apps/web/src/features/customers/gps-fields.tsx` (`GpsFields`, `GpsLine`)
- Create: `apps/web/src/features/customers/location-flag.tsx`
- Modify: `apps/web/src/features/settings/rates/base-location.tsx`
- Modify: `apps/web/src/features/settings/workforce/place-dialog.tsx`
- Modify: `apps/web/src/features/settings/workforce/` site-travel settings form (add `pinTrustM` input, label "Field pin trust distance (m)")
- Modify: `apps/web/messages/en-IN/customers.json`, `settings.json`

**Interfaces:**
- Consumes: `GET /maps/config` (Task 4); `Property` location fields, `confirmSiteLocation`, `restoreSiteLocation`, `locationSource` input (Tasks 2–3); `pinTrustM` (Task 1).
- Produces:
  - `PinMap` props: `{ value: GeoPoint | null; onChange(point: GeoPoint): void; radiusM?: number; fallbackCenter: GeoPoint }`. Satellite (`mapTypeId="hybrid"` so road names show), draggable `AdvancedMarker`, click-to-place, optional `Circle` for `radiusM`. Map height 280 px; full width.
  - `pinMapValue.parse(lat: string, lng: string): GeoPoint | null` and `pinMapValue.format(p: GeoPoint): { latitude: string; longitude: string }` (6 decimals).

- [ ] **Step 1: Write failing tests** `pin-map-value.test.ts`: `parse('16.8524','74.5815')` → point; `parse('','74')` → null; `parse('91','0')` → null; `format` gives 6 decimals.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/web test pin-map-value` — FAIL.
- [ ] **Step 3: Implement** helpers and `PinMap`, wrapped in `APIProvider` with the fetched key. While config loads, render nothing extra; when `browserKey` is null, `PinMap` is not rendered.
- [ ] **Step 4: Property form.** `GpsFields` renders `PinMap` (fallback centre: the company base location, else Kolhapur 16.705, 74.2433). The latitude/longitude inputs keep their `name`s; they become hidden inputs fed by the map, plus a "Type coordinates" link that shows them as today. Add a hidden `locationSource` input: `map_pin` after a drag or click, `typed` after typing. No key → today's inputs only. Make `property-fields.tsx` send `locationSource` with the patch.
- [ ] **Step 5: Property card.** `GpsLine` keeps the text and link, and adds the source in plain words ("Pinned on map", "Typed", "From a phone GPS reading"). When `locationFlagged`, `location-flag.tsx` shows a warning row: "Site pin moved {n} m from where the worker stood" (or "Site pin set without a location reading" when the distance is null) with **Keep this pin** (`confirmSiteLocation`) and **Put back the earlier pin** (`restoreSiteLocation`, shown only when `hasPreviousLocation`).
- [ ] **Step 6: Settings.** `base-location.tsx` and `place-dialog.tsx` show `PinMap` above the existing number inputs and keep both in sync; `place-dialog` passes `radiusM`. Add the `pinTrustM` field next to `farFromSiteM`.
- [ ] **Step 7: Verify.** `pnpm --filter @oneohm/web test && pnpm --filter @oneohm/web typecheck`. Start API and web, sign in as `admin@oneohm.local`, open a customer, drag the pin, save, reload — point and "Pinned on map" persist. Remove both Google env vars, restart API → old inputs only.
- [ ] **Step 8: Commit** `feat(web): pin sites on a satellite map; office keeps or puts back flagged pins`

---

### Task 8: Whole-repo check

- [ ] **Step 1:** `pnpm check` — Biome, file size ≤ 250 lines, typecheck, unit tests: all PASS.
- [ ] **Step 2:** `pnpm test:acceptance` — all scenarios PASS (not only 30).
- [ ] **Step 3:** Update `README.md` "Run it locally": one line that maps need `GOOGLE_MAPS_API_KEY` in `.env` and a new field dev build.
- [ ] **Step 4: Commit** `docs: Google Maps setup note`
