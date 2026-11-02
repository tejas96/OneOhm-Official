# Google Maps across OneOhm — design

Date: 2026-11-03
Status: ready for owner approval

## 1. Why

Today OneOhm has no maps at all.

- Office staff type latitude and longitude by hand (`apps/web/src/features/customers/gps-fields.tsx`, `settings/rates/base-location.tsx`, `settings/workforce/place-dialog.tsx`).
- The field app takes one GPS reading at site check-in with `Accuracy.Balanced` and an 8 s timeout (`apps/field/src/features/attendance/location.ts`). That reading can be 50–100 m off. The first check-in becomes the property location (`site-visits.service.ts` `saveSiteLocation`).
- Roof length, width and shadow-free area are typed numbers from a tape. Shadow analysis is one tick box (`shadow_check`).
- Addresses are free text. Nothing fills city, district or pincode.
- Every distance is a straight line. Quotes use straight line × road factor (`packages/domain/src/pricing/site-distance.ts`). Travel claims use a pure straight line (`packages/domain/src/workforce/travel.ts`).

The owner wants Google Maps Platform used wherever places and maps appear, so that work is **faster, easier and more accurate**, mostly for the field worker on a site survey. The owner handed the design calls to the designer ("go ahead with what you think best").

## 2. Goals

1. The property location is right to the roof, not "somewhere on the street".
2. A site survey takes less time, because the roof is measured from the satellite photo before or during the visit and the tape only confirms it.
3. Addresses are entered by picking a result, not by typing five fields.
4. Distances used for money (quote travel cost) are road distances.
5. The office can see the site and its roof on a map, on screen and in the survey PDF.
6. Shadow and sun data from Google's Solar API is shown as help where Google has data.

## 3. Non-goals

- Live tracking of workers, or a live "where is my crew" map. This would break the privacy rule (PRD 4.3: readings only at check-in/out and capture).
- Maps in the customer app. This can come later.
- Offline map tiles.
- Replacing the measuring tape. Map numbers are an estimate. The worker confirms them.
- Route planning or optimising the order of a worker's day.
- A full shadow simulation tool.

## 4. Anti-goals (a failure even if it works)

- A worker cannot finish a survey, check in, or save a measurement because there is no signal or Google is down. **Maps never block work.** Every map step has a plain fallback that works today.
- A new screen the worker has to learn. Map steps sit inside the existing task screen and site visit card.
- A surprise Google bill. Every server call is cached and capped.
- Raw worker coordinates shown to managers. Today's rule stays.
- Google numbers silently overwrite what the worker measured.

## 5. Constraints from the product

- Never block, only flag (existing site-visit and attendance rules).
- Location consent, working-hours-only readings and 90-day clearing of worker coordinates stay as they are (`workforce/tracking.ts`, `packages/database/src/location-retention.ts`).
- Plain words in the UI ("6 m accuracy", "Roof about 42 m²").
- Touch targets at least 44 pt. Portrait phones only.
- Code files at most 250 lines (`pnpm check`).
- Every change to a property location is audited (`property.located` already exists).
- One source of truth: prices still come only from the pricing engine.

## 6. The features

### 6.1 Better GPS reading (field app, no Google cost)

The Google key cannot make GPS more accurate. The fix is in how the app asks.

- New `readPreciseLocation()` next to `readLocation()` in `apps/field/src/features/attendance/`.
- It uses `Location.watchPositionAsync` with `Accuracy.Highest`. It keeps the best reading. It stops when accuracy is 10 m or better, or after 15 s.
- While it runs, the card shows "Finding your location… 18 m" and the number falls.
- Site check-in, site check-out and "Save site location" use it. Attendance (office check-in) keeps the current quick reading.
- Consent and working-hours rules are unchanged.

### 6.2 Pin the roof (field app and web)

**Field app.** After a site check-in, or from "Save site location", the site visit card opens a map sheet:

- A Google satellite map, centred on the best GPS reading, with the blue dot and its accuracy circle.
- A fixed pin in the centre. The worker moves the map so the pin sits on the roof. Button: "This is the roof".
- If the property already has a saved location, it shows as a second marker. The worker can keep it or move it.
- If the map does not load (no signal), the sheet shows "Map not loading. Use my GPS reading" and saves the GPS reading. This is today's behaviour.

**Web.** On the customer property form, the two number inputs in `gps-fields.tsx` become a small satellite map with a draggable pin. The number inputs stay under a "Type coordinates" link for people who have them. Same on the company base location and on work locations (offices, yards). Work locations also draw their radius circle.

**Saving.** A pinned location may overwrite a saved one. This changes today's "only if empty" rule. Each save records how the point was set and is audited:

- `properties.location_source`: `gps` | `map_pin` | `address` | `typed`
- `properties.location_accuracy_m` (for `gps`)
- `properties.located_at`, `properties.located_by`

**Pin trust rule for the field app (owner's decision: within 100 m).**

- The phone sends the pin point. The server compares it with the worker's check-in reading that it already stores for the open site visit. The server never trusts a reading sent with the pin.
- Pin within 100 m of that reading: saved. No approval needed.
- Pin more than 100 m away, or no check-in reading to compare with: still saved, so work is never blocked. It is marked `location_flagged` with the distance, and the office sees "Site pin moved 240 m from where the worker stood". The office can confirm the pin or put back the earlier one. Both actions are audited.
- After a pin is saved, the open visit's "far from site" distance is calculated again against the new pin. History keeps the old value.
- The 100 m limit is a setting next to the existing `farFromSiteM` site-travel setting, so the owner can change it without a developer.
- Web pins by office staff do not use this rule. They are audited as today.

Which source may replace which (designer's call):

- `map_pin` and `typed` are the trusted sources. A pin from one person may replace a pin from another, with an audit entry.
- `gps` and `address` only fill an empty location. They never replace a `map_pin` or `typed` point without asking. If one would, the user sees "Replace the roof pin?" and must confirm.
- An address pick sets the location only as a starting point. The map then asks the user to move the pin onto the roof.

A property location is a fact about the house, not about the worker. It is **not** cleared after 90 days. The worker's own check-in reading still is.

### 6.3 Measure the roof on the map (web and field app)

- On the satellite map the user taps the roof corners. The app draws the shape and shows "Roof about 42 m² · 7.5 m × 5.6 m". Undo and clear buttons. More than one shape is allowed ("Main roof", "Staircase roof").
- The length and width are the long and short sides of the smallest box around the shape. Area is the real shape area.
- The shapes are saved in a new table `property_roof_outlines`: `id`, `property_id`, `label`, `points` (jsonb list of lat/lng), `area_sqm`, `length_m`, `width_m`, `created_by`, `created_at`. The maths lives in `packages/domain` with unit tests.
- **Office first, worker confirms.** The office can measure from the web app before the visit. On the survey task, `roof_length_m` and `roof_width_m` are pre-filled from the **largest** outline and labelled "From map — check with tape". The worker edits or keeps them. What is saved in `project_facts` is what the worker leaves there, exactly as today.
- **`shadow_free_area_sqm` is never pre-filled** (designer's call). This number drives quote re-pricing (`apps/api/src/modules/quotations/survey-repricing.ts`), and an outline shows the whole roof, not the part free of shade. Next to the input the worker sees hints only: "Roof outlines total about 48 m²" and, when Solar data exists, "Google estimate: about 38 m² free of shade". The worker types the number.
- The worker can also draw the outline on site in the field app, on the same map sheet.
- Ground-mount surveys use the same tool for `land_length_m` and `land_width_m`.

### 6.4 Shadow and sun help — Google Solar API (web, shown in field app)

Google says its Solar API covers more than 300 million Indian buildings at BASE quality, mostly residential (Sept 2026). Coverage still varies by place.

- When a property has a pinned location, the office can press "Get sun data". The API calls Solar `buildingInsights:findClosest` once and stores the few numbers we show in `property_solar_insights`, with `fetched_at` (see section 8 for caching).
- Shown as help, never as the answer: roof area Google sees, maximum panel count, yearly sun hours, and a simple shade note per roof part.
- On the survey task the worker sees "Google estimate: about 38 m² free of shade" next to the `shadow_free_area_sqm` input. The `shadow_check` tick stays the worker's.
- When Google has no data, the button says "No sun data for this address" and nothing else changes.

### 6.5 Address autocomplete (web and field app)

- One shared address picker. The user types; results come from Places Autocomplete (New), limited to India. Picking a result fills address line, city, district, state, pincode and the location (`location_source = address`).
- Every field stays editable. Typing an address by hand still works.
- Used on: the web customer/property form, the field app lead site sheet (`lead-site-sheet.tsx`), and the company address in settings.
- Places session tokens are used, so one search plus one pick is billed as one session.

### 6.6 Road distance for quotes (API)

- When base and site locations are known, the API asks the Routes API for the driving distance once and stores it per property (`property_road_distances`: property, base point, km, fetched_at). It refreshes when either point moves.
- `site-distance.ts` returns the road km. If Google fails, it falls back to today's straight line × road factor and says so ("estimated").
- The quote builder's distance hint and the field quote input keep working as today. Users can still type over the hint.
- **Travel claims stay straight-line in this design.** Road distance for every leg costs one call per leg, and claims are already approved by people. Can be added later.

### 6.7 Navigate and the survey PDF

- Field app "Directions" (`service-facts.tsx`) and a new "Navigate" button on the site visit card open Google Maps with the **coordinates** when they exist, and the address text only when they do not.
- The survey report PDF gets one Static Maps satellite image of the site with the pin and the roof outlines, fetched by the API when the PDF is built.

## 7. Keys and configuration

The owner gave one key. It is in the root `.env` as `GOOGLE_MAPS_API_KEY` (git-ignored). For production the owner makes three restricted keys in Google Cloud Console:

| Variable | Used by | Restriction |
|---|---|---|
| `GOOGLE_MAPS_SERVER_KEY` | `apps/api`: Places, Geocoding, Routes, Solar, Static Maps | server IP; only those APIs |
| `GOOGLE_MAPS_BROWSER_KEY` | `apps/web`: Maps JavaScript map display | HTTP referrer = the OneOhm domain |
| `GOOGLE_MAPS_ANDROID_KEY`, `GOOGLE_MAPS_IOS_KEY` | `apps/field` map display | app package / bundle id |

- In development all of them may fall back to `GOOGLE_MAPS_API_KEY`.
- The API validates its key in `apps/api/src/config/environment.ts` as optional. With no key, every Google feature is hidden and the old inputs show.
- Web reads the browser key at **run time** in a server component and passes it to the map component. No `NEXT_PUBLIC_` variable, so the Docker build does not change.
- The field app gets its keys through `apps/field/app.config.ts` (react-native-maps config plugin). This needs a new development build.
- **All Google web-service calls go through `apps/api`**, never straight from the browser or phone. This keeps the server key private, lets us cache, and gives one place for quotas. Only map display uses client keys.

## 8. Cost control

- Cache Google results per property, **within Google Maps Platform terms** (designer's call). The builder checks the current terms for each API before its phase. The working rule:
  - Points the user pins or types are OneOhm's own data and are kept.
  - Place IDs may be kept. Coordinates from an address pick are a starting point only (see 6.2).
  - Solar insights and road distances keep only the numbers OneOhm shows, with `fetched_at`. They are fetched again on next use when older than the terms allow (30 days unless the terms say otherwise). Raw responses are not kept for good.
- Solar and Static Maps are called only on a user action or PDF build, never in a loop.
- The owner sets daily quota caps per API in Google Cloud Console and a billing alert.
- The API logs each Google call with its SKU so the owner can see use in one place.

## 9. Offline and failure

- The map sheet needs signal. With no signal the old flow shows (GPS reading, typed numbers).
- A pinned location or a roof outline drawn without signal is kept on the phone and sent again on Complete, like checklist ticks (`use-checklist-ticks.ts`).
- Google errors never surface as red errors to the worker. They show the fallback in plain words.

## 10. Order of work

Each phase ships on its own.

1. **Foundation + better GPS + pin the roof + navigate.** Keys and config, `readPreciseLocation`, map sheet in the field app, map pin on web forms, new property location columns, navigate by coordinates.
2. **Measure the roof.** Outline tool on web and field, `property_roof_outlines`, pre-fill survey measurements, map image in the survey PDF.
3. **Address autocomplete.** API proxy for Places, shared picker on web and field.
4. **Road distance for quotes.**
5. **Solar API sun data.**

## 11. My calls (owner, please check)

- Map library in the field app: `react-native-maps` with the Google provider on both Android and iOS, so iOS also gets Google satellite. Not `expo-maps`, which uses Apple Maps on iOS.
- Web map library: `@vis.gl/react-google-maps` (Google's own React wrapper).
- A pinned location may overwrite an earlier saved one, with an audit entry.
- A field pin more than 100 m from the worker's check-in reading is saved but flagged for the office (owner's decision on the limit).
- Address search and GPS never silently replace a roof pin.
- Shadow-free area is never pre-filled from the map.
- Map numbers pre-fill the measurements; the worker's number is the one saved.
- Office measures first when it can; the worker confirms on site.
- Travel claims stay straight-line for now.
- No customer app work, no crew map.
- Attendance keeps the quick GPS reading; only site visits use the precise one.

## 12. Left to the builder

- Exact screen layout inside the existing site visit card and task screen, following the design-system tokens.
- Field and API names beyond those listed here, migration numbering, and contract shapes in `packages/api-contracts`.
- The exact stop rules for the precise reading, within "≤ 10 m or 15 s".
- How the API caches and logs Google calls.
- Checking current Google prices and free monthly limits per SKU before each phase.
