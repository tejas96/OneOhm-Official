# WhatsApp Onboarding Bot and Instant Estimate (Part 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new number from an ad or campaign is onboarded by a short guided WhatsApp chat (mostly taps) in the customer's language. Each answer updates the lead at once. The bill photo is filed on the lead. At the end the customer gets an instant **estimate PDF** from the existing pricing engine, with clear next steps.

**Architecture:**
- The flow is a small set of pure step definitions in domain: question, options, parse, and next step.
- One API service runs those steps on top of the existing chat state machine (`wa_conversations.state` / `context`).
- Every step calls a domain-level helper that writes the lead, the history and the document in one transaction.
- The estimate is priced by `QuotationPricingService.price()`, which needs no customer and no property. It is stored in a new `lead_estimates` table and rendered with the existing PDF renderer.

**Tech Stack:** NestJS API, Drizzle/Postgres, Temporal worker, React web, Vitest, the acceptance suite.

**Spec:** `docs/superpowers/specs/2026-11-03-whatsapp-sales-cycle-design.md`. The relevant parts are the customer journey Steps 0–3, "Not now", the team's-side table, Messages, Configuration, and the loop table rows "First answer", "Bill photo" and "Estimate".

**Branch:** work on `main` in this folder, as the owner asked (no separate branch or worktree). Commit locally; push only when the owner asks.

## Global Constraints

- **Nothing stays only in chat.** The lead is created at the city answer. From then on every answer updates it in the same transaction as a history note. Before the lead exists, only the language and the name are held in the chat.
- **A person is always one tap away.** Every question has "Talk to a person". Tapping it hands the chat to the lead owner (or to sales if there is no lead yet) with a summary of the answers so far.
- **Never loop.** One unclear free-text answer → ask again more simply. A second miss → hand over.
- **"back" / "change"** go back one step. **"menu" / "hi"** restart the onboarding from the current step, never from the start once a lead exists.
- **Never ask again for what we know.** A step is skipped when the lead already has its value.
- **Never send a wrong number.** If the engine cannot price the site, the bot sends no estimate. That means a farm, a society, an "Other" roof, the top bill band, missing products, or a pricing error. It says "Our expert will prepare your price", hands over, and sets the lead's next action for today.
- **The estimate is clearly an estimate.** The PDF and the message say "Estimate — final price in your quotation after a free call or visit". It is never a quotation and never a customer record.
- **Languages.** Customer words are plain and short in English, Marathi and Hindi, in `words.ts` / `words-mr.ts` / `words-hi.ts`. They obey the WhatsApp limits that `words.test.ts` checks: 20-character button titles, 24-character list row titles, at most 3 buttons, at most 10 list rows.
- **Settings.** All of it is configurable in one new Settings section, "WhatsApp onboarding", under the Selling group, with sensible defaults. Onboarding is **on by default**. When it is off, strangers keep today's call-back buttons.
- **No new pages.** Staff see the result on the lead page and on Today.
- **Shared folder.** Another session may also commit here. Implementers `git add` only their own files.
- `pnpm check` stays green (with the 250-line file limit), and the full `pnpm test:acceptance` passes.

## Review Focus

1. **A customer (or a family number) writes "hi" while onboarding is on.** Expect the existing customer menu. Customers are never onboarded. (Task 4 test.)
2. **Two messages arrive quickly**, for example a tap and then a typed word before the reply. Expect each message to be applied to the step the chat is on at that moment, with no skipped or double-applied step. Wrap the step update in a row lock on the conversation. (Task 4 test: two inbound messages back to back.)
3. **The customer types the answer instead of tapping** ("3000", "pune", "rcc", "2"). Expect the parse to accept the obvious typed forms in all three languages and the option numbers ("1", "2"…). (Task 1 tests.)
4. **The customer sends the bill photo at a different step**, or sends a PDF. Expect the file to be kept on the lead with category `electricity_bill`, without breaking the current step. (Task 6 test.)
5. **A number with an open lead made by staff writes for the first time.** Expect no onboarding: the existing hand-to-owner behaviour. (Task 4 test.)

## No silent paths (binding — every row needs a test in the task named)

Every customer message gets a reply. Every chat a person must answer has an owner, an alert and a reminder. Every lead has an owner and a next action.

| Moment | What the customer gets | Who on our side is told / what is set | Task |
|---|---|---|---|
| Stranger says "hi" | The language question | — (no lead yet) | 4 |
| Stranger ignores the buttons and types something unclear twice | "Asha will reply here" | Hand-over to sales (`handOver`, which alerts; never `toPerson` alone); the chat reminders at 30 min / 2 h | 4 |
| Stranger stops **before** the city (no lead yet) | One nudge (if on) | At nudge time, a lead is made with city "Not given" and the next action "Call — stopped at <step> question" for today, so sales follows up | 7 |
| Stranger stops **after** the lead is made | One nudge (if on) | The lead's next action is today ("Finish onboarding", then "Call — stopped at <step>") → Today page and follow-up reminders | 4, 7 |
| Nudge is off | — | The same lead rule: the next action is already today from creation; pre-city chats get a lead at the next 5-minute tick after `nudgeAfterHours` (at least 3 h) | 7 |
| "Talk to a person" anywhere | "Asha will reply here" | `handOver` to the lead owner (or sales without a lead) with the answers summary; chat reminders | 4 |
| Night time | The bot keeps answering; after a hand-over, the existing night auto-reply | Unchanged | 4 |
| A photo or PDF before the lead exists | "Thanks — let's first get a few details" and the current question again; the file is kept in the chat context and filed on the lead when it is made | Filed on the lead | 6 |
| Audio or video | The existing "please send a photo or type" reply, then the current question again | — | 6 |
| Estimate sent, customer taps nothing | — | The lead's next action is set to today, "Call — estimate sent (3 kW, ₹…)" → owner's Today | 5 |
| Estimate sent, customer types anything (e.g. "too costly") | "Thanks, Asha will reply here" | `passToOwner` (alert + reminders); never "not understood" | 5 |
| Expert path (cannot price) | "Our expert will prepare your price and call you" | `handOver` to the owner; next action today with the reason | 5 |
| "Not now" | Thank-you | The next action is the chosen date, "Check back (customer chose)" → follow-up reminders on that date | 5 |
| "Call me back" | "Asha will call you today" | The next action is today; owner alert | 5 |
| Staff release the chat back to the bot | The bot continues from the first missing step | `release` keeps the `ob` context as it keeps `entry`; routing uses `context.ob` (not only the state) to know it is an onboarding chat | 4 |
| The owner turns onboarding off mid-chat | Chats already in onboarding finish; new strangers get the old buttons | — | 4 |
| The lead owner is on leave | — | The Part 2 rule: skipped; desk alert if everyone is away | (Part 2) |
| Later the lead becomes a customer | The customer menu | Unchanged | 4 |

Also connected:
- Every onboarding step and the estimate write a lead history note.
- The **By campaign** sales table gains an **Estimates** column (leads that got an estimate), so the funnel reads leads → estimates → quoted → won → collected (Task 8).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/onboarding/settings.ts` (+test) | create | `OnboardingSettings`, defaults, validator |
| `packages/domain/src/onboarding/steps.ts` (+test) | create | Step ids, options, `parseAnswer`, `nextStep` |
| `packages/domain/src/onboarding/estimate-math.ts` (+test) | create | Bill band → target Wp; site and roof → pricing inputs; saving and payback |
| `packages/domain/src/pricing/default-products.ts` (+test) | create | `suggestPanel` moved from web; reused by web and API |
| `packages/database/src/schema/whatsapp.schema.ts`, new `lead-estimates.schema.ts`, migration | modify / create | `wa_conversations.language`; the `lead_estimates` table |
| `packages/database/src/business-settings.ts` | modify | The `onboarding` key |
| `packages/database/src/lead-from-chat.ts` | create | System writes to a lead (fields and history) without an Actor |
| business-settings API, contract and web `settings/onboarding/onboarding-section.tsx` | modify / create | Settings → Selling → WhatsApp onboarding |
| `apps/api/src/modules/whatsapp/onboarding/onboarding-flow.ts` (+ `onboarding-replies.ts`) | create | Runs the steps on the chat; hand-over; back; retries |
| `apps/api/src/modules/whatsapp/onboarding/estimate.service.ts` | create | Prices, stores, renders and sends the estimate |
| `apps/api/assets/estimate/estimate.hbs`, `estimate.css`; `reports/estimate-pdf.service.ts` | create | The estimate PDF |
| `apps/api/src/modules/whatsapp/file-links.ts`, `shared-files.controller.ts` | modify | Shared file kind `estimate` (lead-scoped) |
| `whatsapp/assistant/assistant.service.ts`, `stranger-flow.ts`, `language.ts`, `media-intake.ts`, `words*.ts` | modify | Route strangers into onboarding; chat language; lead files |
| `apps/worker/src/activities/onboarding-nudges.ts` (+ hook in `timed-reminders.ts`) | create | One nudge after silence |
| Lead read model + web lead page | modify | Shows the latest estimate and the bill photo |
| `apps/api/test/acceptance/scenarios/33-whatsapp-onboarding.acceptance.ts`, `34-onboarding-estimate.acceptance.ts` | create | End-to-end proof |

---

### Task 1: Pure onboarding rules (domain)

**Files:**
- Create: `packages/domain/src/onboarding/{settings,steps,estimate-math,index}.ts` and their tests; `packages/domain/src/pricing/default-products.ts` and its test
- Modify: `apps/web/src/features/quotations/builder/builder-state.ts:171`, which now imports `suggestPanel` from domain (behaviour unchanged)

**Interfaces:**
- Produces:
  ```ts
  // settings.ts
  export interface BillBand { readonly id: string; readonly label: string; readonly targetWp: number | null } // null = expert
  export interface OnboardingSettings {
    readonly enabled: boolean;
    readonly serviceCities: readonly string[];         // list rows; "Other" is always added
    readonly billBands: readonly BillBand[];           // 2..9 bands
    readonly tariffPaisePerUnit: number;               // default 800 (₹8)
    readonly unitsPerKwMonth: number;                  // default 120
    readonly nudgeAfterHours: number;                  // default 3; 0 = off
    readonly panelProductIds: Partial<Record<'individual'|'commercial', string>>; // optional overrides
  }
  export const DEFAULT_ONBOARDING: OnboardingSettings;
  //   enabled true, serviceCities [], tariff 800, units 120, nudge 3, panels {}
  //   billBands: up_to_1000 "Up to ₹1,000" → 1000 Wp; 1000_2000 "₹1,000–2,000" → 2000;
  //              2000_3000 "₹2,000–3,000" → 3000; 3000_5000 "₹3,000–5,000" → 5000; over_5000 "Over ₹5,000" → null
  export function isOnboardingSettings(value: unknown): value is OnboardingSettings;

  // steps.ts
  export type OnboardStep = 'language' | 'name' | 'city' | 'site' | 'bill' | 'roof' | 'floors' | 'photo' | 'done';
  export type SiteChoice = 'home' | 'society' | 'business' | 'farm';
  export type RoofChoice = 'rcc' | 'tin' | 'other';
  export interface OnboardAnswers { language?: 'en'|'mr'|'hi'; name?: string; city?: string; site?: SiteChoice;
    bill?: string /* band id */; roof?: RoofChoice; floors?: 1|2|3; photo?: 'sent'|'later' }
  export const STEP_ORDER: readonly OnboardStep[];   // language,name,city,site,bill,roof,floors,photo,done
  export type Parsed<T> = { ok: true; value: T } | { ok: false };
  export function parseAnswer(step: OnboardStep, input: { choiceId: string|null; text: string }, settings: OnboardingSettings): Parsed<unknown>;
  //   choice ids are "ob:<step>:<value>"; typed forms accepted: option number ("2"), option title in en/mr/hi,
  //   bill "3000"/"₹3,000"/"3k" → the band containing it, floors "2"/"G+2", roof "rcc"/"slab"/"tin"/"sheet",
  //   city: a listed city (case and space insensitive) or any 2–40 character text after the "Other" choice
  export function nextStep(after: OnboardStep, answers: OnboardAnswers, known: Partial<OnboardAnswers>): OnboardStep;
  //   skips steps whose value is in answers or known; previousStep(step) for "back"
  export function previousStep(step: OnboardStep): OnboardStep;

  // estimate-math.ts
  export function pricingInputsFor(answers: OnboardAnswers, settings: OnboardingSettings):
    | { kind: 'priceable'; subsidyCategory: 'individual'|'commercial'; structureType: 'rcc_elevated'|'tin_shed'; floors: number; targetWp: number }
    | { kind: 'expert'; reason: 'farm'|'society'|'roof_other'|'large_bill'|'missing' };
  //   home → individual; business → commercial; society/farm/other roof/null band → expert
  export function savingAndPayback(capacityWp: number, effectivePaise: number, settings: OnboardingSettings):
    { monthlySavingPaise: number; paybackYears: number }   // saving = kW × units × tariff; payback rounded to 0.5 years
  // default-products.ts
  export function suggestPanel(panels: readonly PanelLike[], category: 'individual'|'society'|'commercial'): PanelLike | null
  ```

- [ ] **Step 1: Write failing tests** (`*.test.ts` beside each file):
  - The validator accepts the defaults. It rejects 1 band, 10 bands, a negative tariff, and a non-positive targetWp.
  - `parseAnswer`:
    - Each choice id parses.
    - `'2'` on site gives `'society'`, and `'घर'` gives `'home'`.
    - On bill, `'3000'` gives `'2000_3000'`, `'₹4,500'` gives `'3000_5000'`, and `'9000'` gives `'over_5000'`.
    - On floors, `'G+2'` gives 2, and `'5'` gives 3.
    - On city, `' pune '` gives `'Pune'` when listed. `'x'` gives `{ok:false}`.
  - `nextStep` skips `name` when `known.name` is set, and skips `site` and `bill` when they are known.
  - `previousStep('city')` is `'name'`, and `previousStep('language')` is `'language'`.
  - `pricingInputsFor`:
    - home + `2000_3000` + rcc + 2 gives priceable `{individual, rcc_elevated, 2, 3000}`.
    - farm gives expert `'farm'`, and the `over_5000` band gives expert `'large_bill'`.
  - `savingAndPayback(3000, 10_700_000, defaults)` gives saving 3 × 120 × 800 = 288,000 paise and payback 10,700,000 / (288,000 × 12) ≈ 3.1, rounded to 3.0.
  - `suggestPanel` keeps today's web behaviour: the cheapest active DCR panel for individual and society, the cheapest active panel for commercial. Copy the existing web tests if there are any.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/domain test -- onboarding default-products`. Expect FAIL.
- [ ] **Step 3: Implement.** Keep each file ≤250 lines. The step titles and option labels live in the API's words files (Task 4), not in domain. Domain only knows ids and the typed-word lists needed to parse: the en/mr/hi synonyms for each option.
- [ ] **Step 4: Run** the domain tests and `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(onboarding): pure rules for the WhatsApp onboarding steps and the estimate maths`

### Task 2: Storage — chat language, lead estimates, system lead writes, onboarding setting

**Files:**
- Modify: `packages/database/src/schema/whatsapp.schema.ts` (add `language text` to `wa_conversations`, nullable), `packages/database/src/business-settings.ts` (key `onboarding`, default `DEFAULT_ONBOARDING`)
- Create: `packages/database/src/schema/lead-estimates.schema.ts`, `packages/database/src/lead-from-chat.ts`, and the migration (generate it, read it, rename it to the next number in the repo style)
- Test: `packages/database/src/lead-from-chat.test.ts` if the package has DB tests; otherwise cover it in Task 4's acceptance test

**Interfaces:**
- Produces:
  ```ts
  // lead_estimates: id uuid pk, leadId uuid not null → leads (cascade), capacityWp int, moduleCount int,
  //   totalPaise, subsidyPaise, effectivePaise, monthlySavingPaise money, paybackYears double,
  //   answers jsonb not null, priced jsonb not null (the PricedQuotation.preview snapshot), createdAt
  export async function updateLeadFromChat(tx: DatabaseExecutor, leadId: string,
    change: { name?: string; city?: string; subsidyCategory?: 'individual'|'society'|'commercial'; estimatedWp?: number },
    note: string): Promise<void>
  //   writes only the given fields, then logLead(tx, leadId, null, 'whatsapp', note)
  //   (move or reuse logLead from apps/api/src/modules/crm/lead-history.ts — if it lives in the API, put this
  //   helper in apps/api/src/modules/crm/lead-from-chat.ts instead; same signature)
  export async function storeLeadDocument(tx: DatabaseExecutor, storage: ObjectStorage, input:
    { leadId: string; category: 'electricity_bill'; fileName: string; contentType: string; buffer: Buffer }): Promise<string /* documentId */>
  //   documents row with leadId, customerId null, source 'upload', then logLead "Electricity bill received on WhatsApp"
  //   (lives in the API documents module if the storage service is API-only)
  ```
- Before generating the migration, check `git status` for foreign schema or migration edits. If you find any, stop (another session may be writing migrations).

- [ ] **Step 1: Write the acceptance test** in `33-whatsapp-onboarding.acceptance.ts`: `it('stores a chat language and an estimate row; system lead updates write history')`. Insert through the API's internal path where possible. A thin test that the migration applied (`information_schema` for both columns and the table) is acceptable here. Tasks 4–5 exercise the real behaviour.
- [ ] **Step 2: Run it.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it and `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(onboarding): chat language, lead estimates table, system lead writes`

### Task 3: Settings → Selling → WhatsApp onboarding

**Files:**
- Modify: the business-settings contract, schema, service (`CHECKS`/`PROBLEM`) and controller, following the `lead_assignment` pattern from Part 2; `apps/web/src/features/settings/settings-view.tsx` (new section in the Selling group); the messages JSON
- Create: `apps/web/src/features/settings/onboarding/onboarding-section.tsx` (and a small hook if needed)

**Interfaces:**
- Produces: `GET /settings/onboarding` and `PUT /settings/onboarding` (needs `settings.manage`, audited, validated by `isOnboardingSettings`; cities trimmed with blanks and duplicates dropped; panel overrides must be active panels).
- UI:
  - A switch "Onboard new WhatsApp numbers with a short guided chat".
  - Service cities, as a comma list.
  - Bill bands, as a table of label and size in kW, where an empty size means "our expert prices it".
  - "Electricity price per unit (₹)" and "Units per kW per month".
  - "Nudge after (hours, 0 = off)".
  - Optional panel per site type: Home, Shop or business.
  - Help: "The bot never shows a price it cannot work out; those chats go to sales."

- [ ] **Step 1: Write the acceptance test** (scenario 33): GET returns the defaults; PUT saves and reads back; PUT rejects one band and rejects an inactive panel.
- [ ] **Step 2: Run it.** Expect FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run** it and `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(settings): WhatsApp onboarding settings`

### Task 4: The guided onboarding flow

**Files:**
- Create: `apps/api/src/modules/whatsapp/onboarding/onboarding-flow.ts` and `onboarding-replies.ts` (they build the ChatReply for each step from the words)
- Modify: `assistant/assistant.service.ts` (route), `assistant/stranger-flow.ts` (onboarding on → start the flow; off → today's buttons), `assistant/language.ts` and `languageOf` (a stranger chat uses `wa_conversations.language`), `assistant/hand-over.ts` (hand-over carries a summary), `words.ts` / `words-mr.ts` / `words-hi.ts` (new `ONBOARD_WORDS`), `chat-store.ts` (a locked read helper; `keepEntry` also keeps `ob`), `chats.service.ts` `release()` (keeps `ob`)
- Test: scenario 33; `words.test.ts` (limits)

**Interfaces:**
- Consumes: Tasks 1–3, `LeadIntakeService.receive` / `openLeadByPhone`, `savedEntry` / `clearEntry` (Part 2 attribution), `handOver` / `passToOwner`.
- Chat states: `onboard:<step>`. The context holds `ob: { answers: OnboardAnswers; misses: number }`.
- Routing:
  - Strangers (no customer) go into onboarding when it is enabled and there is no open lead, or when the open lead was made by onboarding (the chat state is `onboard:*`).
  - An open lead made by staff → today's hand-to-owner.
  - Customers → unchanged.
  - Referral code → today's referral lead, then onboarding continues from `site` (name and city come from the referral).
- Lead creation at the city answer: `intake.receive({ name, phone, city, source: 'whatsapp', attribution: savedEntry(chat), firstNote: 'Started onboarding on WhatsApp', nextActionNote: 'Finish onboarding' })`, then `clearEntry`. Each later answer calls `updateLeadFromChat` with a note, for example "Site: Home", "Bill: ₹2,000–3,000 (about 3 kW)", "Roof: RCC, 2 floors".
- Replies:
  - Language: 3 buttons.
  - Name: shows the WhatsApp profile name with Yes / Change / Talk to a person (3 buttons), or asks them to type it.
  - City, site, bill, roof and floors: lists, with "Talk to a person" as the last row.
  - Photo: buttons "Send later" and "Talk to a person". The photo itself is Task 6.
- Talk to a person → `handOver` with the body "Asha will reply here" and a staff summary: "Onboarding answers so far: …".
- Every step update runs inside `db.transaction` with `SELECT … FOR UPDATE` on the conversation row.

- [ ] **Step 1: Write the acceptance tests** (scenario 33, driven by `sendInbound` from a fresh number; extend the helper to send `interactive.list_reply` / `button_reply` taps by id):
  - Language → name (Yes) → city (Pune) gives one lead with that name, city and source `whatsapp`, an owner by rule, and a history note.
  - Site / bill / roof / floors taps update `subsidyCategory` and `estimatedWp`, with one note each.
  - "back" at roof goes back to the bill question.
  - Two unclear typed answers at bill → state `human` and the owner is alerted.
  - "Talk to a person" at site → state `human`, with the summary in the staff alert.
  - A customer's "hi" gets the customer menu.
  - A number with a staff-made open lead gets the old behaviour.
  - Onboarding off gives the old stranger buttons.
  - Two quick messages: each applies once.
  - Marathi chosen → the next question body is the Marathi text.
  - Every hand-over in the flow creates a staff notification. Check the alert row, not only the state.
  - Staff release mid-onboarding, then the stranger replies → the bot asks the first missing question, and the answers kept from before are not asked again.
  - Onboarding turned off mid-chat → the chat in progress continues; a new number gets the old buttons.
- [ ] **Step 2: Run** `pnpm test:acceptance 33`. Expect FAIL.
- [ ] **Step 3: Implement.** Keep `assistant.service.ts` ≤250 lines; the flow lives in `onboarding/`.
- [ ] **Step 4: Run** scenario 33, `words.test.ts`, the full suite (32-lead-attribution must still pass when onboarding is off, so set it off there if needed) and `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(whatsapp): guided onboarding for new numbers; every answer updates the lead`

### Task 5: The instant estimate

**Files:**
- Create: `apps/api/src/modules/whatsapp/onboarding/estimate.service.ts`, `apps/api/src/modules/reports/estimate-pdf.service.ts`, `apps/api/assets/estimate/estimate.hbs` and `estimate.css`
- Modify: `whatsapp/file-links.ts` (kind `'estimate'`; for this kind `customerId` may be empty and the link carries `leadId`), `shared-files.controller.ts` (serves the estimate PDF), `onboarding-flow.ts` (calls the estimate after the photo step), words
- Test: `34-onboarding-estimate.acceptance.ts`

**Interfaces:**
- Produces:
  ```ts
  @Injectable() export class EstimateService {
    async make(tx: Transaction, leadId: string, answers: OnboardAnswers):
      Promise<{ kind: 'sent'; estimateId: string } | { kind: 'expert'; reason: string }>
  }
  ```
- Pricing: `pricingInputsFor` → `QuotationPricingService.price({ subsidyCategory, systemType: 'on_grid', targetWp, panelProductId, inverters: suggestInverterMix(...), structureType, floors, distanceKm: 0 })`.
  - The panel is `settings.panelProductIds[category] ?? suggestPanel(active panels, category)`.
  - Inverters come from `suggestInverterMix` (domain).
  - Any throw, or a missing panel or inverter, gives `expert`.
- Stored: a `lead_estimates` row with answers and the `preview` snapshot.
- Message: one session `document` with the estimate PDF, followed by buttons:
  - **"Call me back"** sets the lead's next action to today with "Customer asked for a call after the estimate", alerts the owner, and replies "Asha will call you today" (Part 4 replaces this with slot booking).
  - **"Talk to a person"** hands over.
  - **"Not now"** shows a list (In 1 week / 1 month / 3 months), sets `nextActionOn` to that date with the note "Check back (customer chose)", and replies with a thank-you.
- The PDF shows:
  - the company name and logo, as on the quotation
  - the system size in kW and the module count
  - the price, the expected subsidy and the cost after subsidy
  - the monthly saving and the payback years
  - the line "Estimate — final price in your quotation after a free call or visit"
  - the date and "valid for 15 days"
- Lead: stage `new` → `contacted`, with the note "Estimate sent: 3 kW, ₹1,85,000 (₹1,07,000 after subsidy)".
- Expert path: the reply "Our expert will prepare your price and call you", a hand-over, and the next action set to today with a reason note.

- [ ] **Step 1: Write the acceptance tests:**
  - The full onboarding to the photo step (choose "Send later") gives:
    - a `lead_estimates` row with `capacityWp >= 3000`
    - a session document whose link returns `application/pdf`
    - the lead at stage `contacted` with the note
  - "Not now" → "1 month" sets `nextActionOn` to today + 1 month.
  - "Call me back" sets today's next action and an owner alert.
  - Farm gives no estimate row, an expert reply, `human` state and a next action for today.
  - Turning the active panels off (via SQL) gives the expert path, never a crash.
  - After the estimate with no tap, the lead's next action is today with "Call — estimate sent".
  - Free text after the estimate ("too costly") gives the warm hand-over reply and an owner alert, never "not understood".
- [ ] **Step 2: Run** `pnpm test:acceptance 34`. Expect FAIL.
- [ ] **Step 3: Implement.** Reuse the quotation PDF's header and footer partials where possible.
- [ ] **Step 4: Run** scenario 34, the full suite and `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(onboarding): instant estimate PDF from the real pricing engine, with next steps`

### Task 6: The bill photo on the lead

**Files:**
- Modify: `assistant/media-intake.ts` (a stranger with an open lead: store via `storeLeadDocument`, category `electricity_bill`), `assistant.service.ts` (the media route for strangers), `onboarding-flow.ts` (a photo at the `photo` step → "Thanks" and move on; a photo at another step → kept, the current step stays), the acceptance helper (`sendInbound` sends `image` / `document` media; the acceptance API needs a fake media gateway — check how the `WHATSAPP_MEDIA` token is provided under acceptance and add a test double that returns a small JPEG or PDF when `WHATSAPP_DELIVERY=log`)
- Test: scenario 33 or 34

- A file sent before the lead exists is downloaded and held as `ob.pendingFile` (the storage key after a put to object storage), then filed by `storeLeadDocument` when the lead is made at the city step.
- [ ] **Step 1: Write the tests:**
  - A photo sent at the name step (no lead yet) gets the "first a few details" reply. After the city answer, the photo is filed on the new lead.
  - Audio at any step gets the existing refusal reply and the current question again.
  - An image at the photo step gives a `documents` row (`lead_id` set, `customer_id` null, category `electricity_bill`), a history note, and the estimate follows.
  - A PDF sent at the bill step is stored and the bill question is asked again.
  - A file over the size cap gets the existing "too large" reply and no row.
  - A stranger outside onboarding (onboarding off, no lead) still stores nothing (unchanged).
- [ ] **Step 2: Run them.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them, the full suite and `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(onboarding): the electricity bill photo is filed on the lead`

### Task 7: One nudge after silence

**Files:**
- Create: `apps/worker/src/activities/onboarding-nudges.ts` (+ test)
- Modify: `apps/worker/src/activities/timed-reminders.ts:41` (call it on each 5-minute tick)

**Interfaces:**
- Produces: `queueOnboardingNudges(db, now, settings)`. It selects chats with:
  - state `onboard:*`
  - `last_inbound_at` older than `nudgeAfterHours` but under 24 hours (inside the free window)
  - no `ob.nudgedAt` in the context
  - the current time inside working hours (reuse the reminders' working-time helper)
- For each one it queues a session `buttons` reply ("Shall we continue? It takes a minute." / Continue / Talk to a person) in the chat's language, with dedupe `ob_nudge:<chatId>`, and sets `ob.nudgedAt`.
- If the chat has a lead, it sets the lead's next action note to "Call — stopped at <step> question" (due today).
- If the chat has **no lead yet** (stopped at the language, name or city question), it makes one through `LeadIntakeService.receive`:
  - The name is the answered name, else the WhatsApp profile name, else "WhatsApp enquiry". The city is "Not given".
  - The source is `whatsapp`, with the saved attribution, and the next action is "Call — stopped at <step> question" today.
  - This happens even when nudges are off (`nudgeAfterHours = 0` uses 3 hours for this rule), so a half-finished chat never stays only in chat.
- `nudgeAfterHours = 0` turns off only the customer message.

- [ ] **Step 1: Write the failing unit tests** with a fake db, or an integration test the way other worker activities are tested:
  - A chat silent 4 hours inside working hours is nudged once.
  - A chat silent 2 hours is not nudged.
  - A chat silent 25 hours is not nudged.
  - A chat already nudged is not nudged again.
  - Night time: no nudge.
  - A chat stopped at the name question 4 hours ago gives a lead with city "Not given" and a next action for today, also when nudges are off.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/worker test -- onboarding-nudges`. Expect FAIL.
- [ ] **Step 3: Implement.** "Continue" re-sends the current question (Task 4 handles the `ob:continue` choice).
- [ ] **Step 4: Run** it and `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(onboarding): one gentle nudge when a customer stops halfway`

### Task 8: Staff see it on the lead page

**Files:**
- Modify: the sales report by-campaign rows, which gain `estimates: number` (leads with at least one `lead_estimates` row), plus the web "By campaign" table column "Estimates"
- Modify: the lead read model (`crm/lead-read.ts` / `lead-present.ts`) and its contract (adds `latestEstimate: { id, capacityWp, totalPaise, effectivePaise, monthlySavingPaise, paybackYears, createdAt, pdfUrl } | null`), and the web lead page (one small "Estimate sent" card under the facts card with the size, price and a PDF link; the bill photo already shows if lead documents are listed — check, and list it if not)
- Create: a staff PDF route for the estimate (`GET /leads/:id/estimates/:estimateId/pdf`, needs `leads.manage` or the lead's view permission)
- Test: scenario 34

- [ ] **Step 1: Write the acceptance test:**
  - After an estimate, `GET /leads/:id` has `latestEstimate.capacityWp` and a working `pdfUrl`.
  - A user without lead access gets 403 on the PDF route.
  - `GET /business-reports/sales` by-campaign row for the lead's code has `estimates: 1`.
- [ ] **Step 2: Run it.** Expect FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run** scenario 34, the full suite and `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(leads): the lead page shows the estimate the customer got`
