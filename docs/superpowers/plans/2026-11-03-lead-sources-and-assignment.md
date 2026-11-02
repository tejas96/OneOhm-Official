# Lead Sources and Auto-Assign (Part 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new lead gets an owner at once by a rule the owner sets in Settings, never a person on leave. Every lead remembers the ad or campaign it came from. One report shows which campaigns bring paying customers.

**Architecture:**
- The owner choice stays in one pure function (`pickLeadOwner`, in domain) and one loader (`ownerByRule`, in the API).
- The loader now reads approved leave and a new `lead_assignment` business setting.
- Attribution is captured at the edge: website form fields, and the Meta `referral` object or a `Hi OneOhm <CODE>` text on WhatsApp. On WhatsApp it is kept on the chat until the lead is made, then written onto the lead. The first touch wins.
- The sales report gains a by-campaign table.

**Tech Stack:** NestJS API, Drizzle/Postgres, React web, Vitest, the acceptance suite (`pnpm test:acceptance`).

**Spec:** `docs/superpowers/specs/2026-11-03-whatsapp-sales-cycle-design.md` (sections "Assignment (G4)" and "Campaigns and sources (G6)")

**Branch:** `feat/lead-sources-assignment`, cut from `feat/whatsapp-quote-and-pay` (Part 1 is not merged yet).

## Global Constraints

- "On leave" means **approved `leave_requests` covering today** (business time zone), **or** the manual `users.onLeave` switch.
- People on leave are **skipped**, not sorted last.
- If nobody is free, the lead goes to the desk and is never left without an owner:
  - The owner is the system-role holder that `ownerByRule` already uses as its last resort.
  - Every `leads.manage` holder gets an alert: "New lead <name> needs an owner — everyone is away".
- The same rule assigns every lead the system assigns: website, WhatsApp, referral, reseller and reopen. A staff member creating a lead by hand and picking an owner keeps that choice.
- Attribution is first touch: an existing open lead's attribution is never overwritten.
- No new pages. The lead rule goes on the existing Settings → Assignment panel. The campaign list is a new section under Settings → Selling, named **"Ad and campaign codes"**, because "campaign" is already used by the referral budget.
- Customer-facing words: none change in this part.
- `pnpm check` must stay green (the 250-line file limit included), and the full `pnpm test:acceptance` must pass.

## Review Focus

1. **Two leads arrive at the same moment under round robin.** Expect a fair spread over time. A duplicate pick in one exact moment is acceptable (no pointer row), but a stuck rule is not. (Task 2 test: three leads in a row go to three different people.)
2. **A person's leave starts today, or ends yesterday.** Expect the leave to be counted for both dates, in the business time zone. (Task 2 tests the boundary dates.)
3. **A city list names a person who is now on leave or inactive.** Expect that person to be skipped, and the general rule to apply. (Task 1 test.)
4. **The same number writes again with a different campaign code while its lead is open.** Expect the attribution to stay the first one. (Task 5 test.)
5. **A Meta referral arrives with an unknown ad id and no code.** Expect it to be kept as typed, with the source `whatsapp` and the campaign shown as the ad headline. (Task 5 test.)

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/epc/lead-rules.ts` (+ test) | modify | `pickLeadOwner` v2: skip away, strategy, city |
| `packages/domain/src/settings/lead-assignment.ts` (+ test) | create | `LeadAssignmentRules` shape, defaults, validator |
| `packages/database/src/away-today.ts` | create | `awayUserIds(db, date)`: one shared "on leave on date" query |
| `packages/database/src/business-settings.ts` | modify | Adds the `lead_assignment` key |
| `apps/api/src/modules/crm/lead-owner.ts` | modify | `ownerByRule(db, { city })` → `{ userId, fallback }` |
| `apps/api/src/modules/crm/lead-intake.service.ts`, `leads.service.ts` | modify | Use the new result, send the desk alert, take attribution |
| `apps/api/src/modules/settings/…business-settings…` + contract | modify | GET/PUT `/settings/lead-assignment` |
| `apps/web/src/features/settings/rules/assignment-panel.tsx` (+ new `lead-assignment-section.tsx`) | modify | The "New leads" section |
| `packages/database/src/schema/crm.schema.ts`, new `lead-campaigns.schema.ts`, migration | modify / create | Attribution columns and the codes table |
| `lead-campaigns` contract, controller, service, web section (copy of the lead-steps pattern) | create | Settings → Ad and campaign codes |
| `apps/api/src/modules/whatsapp/whatsapp-events.ts`, `assistant/stranger-flow.ts`, `assistant/assistant.service.ts` | modify | Read the referral and the code; keep them on the chat; apply them when the lead is made |
| `packages/domain/src/epc/campaign-code.ts` (+ test) | create | `findCampaignCode(text)` |
| `crm/website-leads.ts`, `lead-intake.contract.ts` | modify | UTM and landing-page fields |
| Lead page (web) source line | modify | Shows the source and the campaign |
| `business-reports/sales-report.service.ts`, `sales-report.read.ts`, contract, `features/reports/sales/sales-tables.tsx` | modify | The `byCampaign` table |
| `apps/api/test/acceptance/scenarios/29-lead-assignment.acceptance.ts`, `30-lead-attribution.acceptance.ts` | create | End-to-end proof |

---

### Task 1: Owner rule v2 (pure)

**Files:**
- Modify: `packages/domain/src/epc/lead-rules.ts:50-70`, `lead-rules.test.ts`
- Create: `packages/domain/src/settings/lead-assignment.ts`, `lead-assignment.test.ts`; export them from the settings index

**Interfaces:**
- Produces:
  ```ts
  export interface LeadAssignmentRules {
    readonly strategy: 'least_busy' | 'round_robin';
    readonly cityOwners: readonly { readonly userId: string; readonly cities: readonly string[] }[];
  }
  export const DEFAULT_LEAD_ASSIGNMENT: LeadAssignmentRules = { strategy: 'least_busy', cityOwners: [] };
  export function isLeadAssignmentRules(value: unknown): value is LeadAssignmentRules;
  // OwnerCandidate gains: away: boolean (replaces onLeave); lastLeadAt: Date | null
  export function pickLeadOwner(
    candidates: readonly OwnerCandidate[],
    rules: LeadAssignmentRules,
    city?: string | null,
  ): string | null;
  ```

- [ ] **Step 1: Write the failing tests** in `lead-rules.test.ts`:
  - `skips people who are away`: A (away, 0 open) and B (3 open) → B.
  - `returns null when everyone is away`.
  - `least_busy picks fewest open leads, then name`: as today.
  - `round_robin picks the person who got a lead longest ago; never-assigned first`: A last 10:00, B last 09:00, C null → C, then B.
  - `city owners win for their city, case and space insensitive`: rules `cityOwners [{userId:B, cities:['Pune']}]`, city `' pune '` → B, even when A has fewer leads.
  - `a city owner who is away falls back to the general rule`.
  - `city owners split their city by the strategy`: two owners for Pune → the least busy of the two.
- [ ] **Step 1b: Write the failing tests** in `lead-assignment.test.ts`:
  - The validator accepts the default.
  - It rejects an unknown strategy, a cities value that is not an array, and an empty userId.
  - It accepts at most 50 cities per person.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/domain test -- lead-rules lead-assignment`. Expect FAIL.
- [ ] **Step 3: Implement.** Normalise city names with `trim().toLowerCase()`. The tie-break order stays name, then userId.
- [ ] **Step 4: Run** the same command. Expect PASS. Typecheck shows the callers of `pickLeadOwner` breaking; Task 2 fixes them, so run `pnpm --filter @oneohm/domain typecheck` only.
- [ ] **Step 5: Commit** `feat(leads): owner rule skips people on leave, with round robin and city owners`

### Task 2: Leave-aware loader, desk fallback, lead-assignment setting

**Files:**
- Create: `packages/database/src/away-today.ts` (export it from the package index)
- Modify: `packages/database/src/business-settings.ts` (key `lead_assignment`, default `DEFAULT_LEAD_ASSIGNMENT`), `apps/api/src/modules/crm/lead-owner.ts`, `crm/lead-intake.service.ts:100-126`, `crm/leads.service.ts:97,144-146`, every other caller of `ownerByRule` (grep)
- Test: `apps/api/test/acceptance/scenarios/29-lead-assignment.acceptance.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  // away-today.ts
  export async function awayUserIds(db: DatabaseExecutor, date: string /* YYYY-MM-DD */): Promise<Set<string>>
  //   approved leave_requests with fromDate <= date <= toDate, plus users.onLeave = true
  // lead-owner.ts
  export async function ownerByRule(db: DatabaseExecutor, options?: { city?: string | null }):
    Promise<{ userId: string; fallback: boolean } | null>
  //   lastLeadAt = max(leads.createdAt) per owner (no pointer table)
  //   fallback = true when every non-system holder is away → the system-role holder is returned
  ```
- The date is `todayIn(env.BUSINESS_TIMEZONE)`. Pass it in from the callers, or read it with `environmentOnce()`, as the codebase already does.
- When `fallback` is true, lead intake also calls `notifyHolders(tx, 'leads.manage', { title: 'New lead needs an owner', body: '<name> came in while everyone is away. Pick an owner.', … })`, deduped per lead.
- Ruling: the other inline "away today" queries in the codebase are left alone, to avoid scope creep. Only the lead owner uses the new helper.

- [ ] **Step 1: Write the acceptance tests** in `29-lead-assignment.acceptance.ts`:
  - Make two sales people with `leads.manage` (see `support/team.ts`).
  - Approve today's leave for one of them, using the leave API as in `13-leave`.
  - Post a website lead (`POST /public/leads`). Expect it to go to the other person.
  - `all away → system holder + alert`: put both on leave, post a lead → the owner is the system holder and a `leads.manage` notification exists.
  - `leave that ended yesterday does not count`.
  - `round robin spreads three leads to three people`: PUT `/settings/lead-assignment {strategy:'round_robin'}` with 3 sales people.
  - `city owner gets their city's leads`.
  - `a staff member's own pick is kept`: `POST /leads` with `ownerUserId`.
  - Reset the setting in `afterAll`.
- [ ] **Step 2: Run** `pnpm test:acceptance 29`. Expect FAIL.
- [ ] **Step 3: Implement** the helper, the loader, the callers and the alert. Keep `lead-owner.ts` under 250 lines.
- [ ] **Step 4: Run** `pnpm test:acceptance 29`, then the full suite (other scenarios create leads), then `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(leads): new leads skip people on approved leave; desk alert when everyone is away`

### Task 3: Settings → Assignment, "New leads" section

**Files:**
- Modify: `packages/api-contracts/src/contracts/business-settings.contract.ts`, `apps/api/src/modules/settings/business-settings.controller.ts` and `.service.ts` (wherever `/settings/assignment` lives), `apps/web/src/features/settings/rules/assignment-panel.tsx`, and its messages JSON
- Create: `apps/web/src/features/settings/rules/lead-assignment-section.tsx`

**Interfaces:**
- Produces: `GET /settings/lead-assignment` → `LeadAssignmentRules`. `PUT /settings/lead-assignment` (needs `settings.manage`, writes `recordAudit`) → the saved rules. It rejects with 400 when the validator fails, and when a `cityOwners.userId` cannot own leads (`assertCanOwnLeads`).
- UI:
  - Heading "New leads".
  - A strategy choice: "Fewest open leads" or "Take turns".
  - The list "City owners (optional)": a person picker from `leadOwnerOptions` and a comma-separated list of cities, with add and remove.
  - Help text: "People on leave are always skipped. If everyone is away, new leads go to the admin and sales is alerted."
  - The panel's doc comment no longer says it is only for project work.

- [ ] **Step 1: Write the acceptance test** in scenario 29: `it('saves and reads the lead rule; refuses a person who cannot own leads')`.
- [ ] **Step 2: Run it.** Expect FAIL.
- [ ] **Step 3: Implement** the API and the web section, following the existing assignment panel's form pattern.
- [ ] **Step 4: Run** scenario 29 and `pnpm check`. Expect PASS. Open the web app and check that the section saves (run the web dev server and look).
- [ ] **Step 5: Commit** `feat(settings): a rule for who gets new leads`

### Task 4: Attribution columns and Ad and campaign codes list

**Files:**
- Modify: `packages/database/src/schema/crm.schema.ts` (leads)
- Create: `packages/database/src/schema/lead-campaigns.schema.ts`, the migration (`pnpm --filter @oneohm/database db:generate`, renamed to the repo style as before), the contract `lead-campaigns.contract.ts` and schema, `apps/api/src/modules/crm/lead-campaigns.controller.ts` and `lead-campaigns.service.ts`, and `apps/web/src/features/settings/lead-campaigns/` (panel, dialog, hook), all copied from the lead-steps pattern; register it as a section under Settings → Selling
- Test: `apps/api/test/acceptance/scenarios/30-lead-attribution.acceptance.ts`

**Interfaces:**
- Produces:
  - New lead columns, all nullable text: `campaignCode`, `adId`, `adHeadline`, `adSourceUrl`, `utmSource`, `utmMedium`, `utmCampaign`, `landingPage`.
  - `lead_campaigns`: `code text pk` (uppercase, 2–20 chars, `[A-Z0-9_-]`), `name text not null`, `active boolean default true`, timestamps.
  - API: `GET /lead-campaigns`, `POST /lead-campaigns`, `PATCH /lead-campaigns/:code`, each returning the whole list. Writes need `settings.manage` and are audited.
  - `export type LeadAttribution = Partial<Pick<Lead, 'campaignCode'|'adId'|'adHeadline'|'adSourceUrl'|'utmSource'|'utmMedium'|'utmCampaign'|'landingPage'>>`, exported from the database or contracts package where `NewLead` types live.

- [ ] **Step 1: Write the acceptance test**: `it('adds, renames and turns off a campaign code; codes are stored uppercase; a duplicate code is refused')`.
- [ ] **Step 2: Run** `pnpm test:acceptance 30`. Expect FAIL.
- [ ] **Step 3: Implement.** Copy the lead-steps files and rename them. Seed none.
- [ ] **Step 4: Run** scenario 30 and `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(leads): attribution fields on leads and a list of ad and campaign codes`

### Task 5: Capture attribution (website and WhatsApp)

**Files:**
- Create: `packages/domain/src/epc/campaign-code.ts` and its test
- Modify: `packages/api-contracts/src/contracts/lead-intake.contract.ts:17`, `apps/api/src/modules/crm/website-leads.ts`, `crm/lead-intake.service.ts` (`receive` and `create` take `attribution?: LeadAttribution`, written only on insert), `whatsapp/whatsapp-events.ts` (`RawMessage.referral`, `Incoming.referral`), `whatsapp/assistant/assistant.service.ts` (`answer`), `whatsapp/assistant/stranger-flow.ts` (`callBack`, `referredFriend`), the referral path into `intake.create`
- Test: `whatsapp-events.test.ts`, `campaign-code.test.ts`, scenario 30

**Interfaces:**
- Produces:
  ```ts
  export function findCampaignCode(text: string): string | null
  //   matches "hi oneohm <CODE>" / "hello oneohm <CODE>" / "oneohm <CODE>" (the literal word
  //   "oneohm", so domain stays pure), CODE = [A-Za-z0-9_-]{2,20}, returned uppercased;
  //   null for plain "hi", for the referral "code XXXXXX" form, and for menu words
  // Incoming gains: referral?: { sourceId: string | null; sourceUrl: string | null; headline: string | null } | null
  ```
- The chat context gains `entry: LeadAttribution`. It is written on the **first** inbound message of a conversation that has no lead or customer yet, and kept until a lead is made. `callBack` and `referredFriend` pass `chat.context.entry` to the intake.
- A text that is only `Hi OneOhm <CODE>` is treated as a greeting: it shows the stranger buttons, the same as "hi". It must not fall into "not understood".
- Website: the contract gains optional `utmSource`, `utmMedium`, `utmCampaign` and `campaignCode` (each max 100 characters). `sourcePage` also goes to `landingPage`.

- [ ] **Step 1: Write the tests:**
  - Unit `findCampaignCode`: `'Hi OneOhm DIWALI26'` → `'DIWALI26'`; `'hello oneohm  poster-1 '` → `'POSTER-1'`; `'hi'` → null; `'my code AB12CD'` → null; `'menu'` → null.
  - Unit `readWebhook`: a message with `referral: { source_id, source_url, headline, source_type:'ad' }` fills `Incoming.referral`; without it, it is null.
  - Acceptance:
    - `website UTM fields land on the lead`.
    - `a WhatsApp ad referral then call-back makes a lead with adId, adHeadline and source whatsapp`: use `sendInbound` from `support/whatsapp.ts`, extended with an optional `referral` field.
    - `Hi OneOhm CODE then call-back stores campaignCode`.
    - `a second code from the same number while the lead is open does not overwrite`.
    - `an unknown code is kept as typed`.
- [ ] **Step 2: Run** the unit tests and `pnpm test:acceptance 30`. Expect FAIL.
- [ ] **Step 3: Implement.** Keep `assistant.service.ts` ≤250 lines: put the entry capture in `stranger-flow.ts` or a new `entry-capture.ts`.
- [ ] **Step 4: Run** them, then the full acceptance suite, then `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `feat(leads): remember the ad or campaign a lead came from`

### Task 6: Show it — lead page line and by-campaign report

**Files:**
- Modify: the lead detail read (`crm/lead-read.ts` or `lead-present.ts`) and its contract, the lead page source line in `apps/web` (find where the source label renders), `business-reports/sales-report.read.ts:42`, `sales-report.service.ts:~119`, `business-reports.contract.ts:19`, `apps/web/src/features/reports/sales/sales-tables.tsx`, `sales-report.tsx`
- Test: scenario 30; `sales-report.service` unit test if one exists, otherwise acceptance

**Interfaces:**
- Produces:
  - The lead detail gains `attribution: LeadAttribution & { campaignName: string | null }`, where the name comes from `lead_campaigns`.
  - The lead page shows "Source: WhatsApp · Diwali poster 2026", falling back to the ad headline, then the code, then nothing.
  - `SalesReport.byCampaign: { key: string; label: string; leads: number; quoted: number; won: number; wonValuePaise: number; collectedPaise: number }[]`:
    - The key is the campaign code, else `ad:<adId>`, else `utm:<utmCampaign>`.
    - Leads with none of these are grouped as "No campaign".
    - `quoted` counts leads that reached quoted or later.
    - `collectedPaise` is the sum of customer payments on projects whose quotation's `leadId` is the lead.
    - It respects the report's existing date range filter.
  - Web: a "By campaign" table under "By source", with the same style.

- [ ] **Step 1: Write the acceptance test**: two leads with code `DIWALI26` (one won, its project with a recorded advance payment, using `sellProject` with lead options or a lead converted the way 19-lead-history does it) and one lead with no code → `GET /business-reports/sales` has the `DIWALI26` row `{ leads: 2, won: 1, collectedPaise: <advance> }` and the "No campaign" row with `leads >= 1`.
- [ ] **Step 2: Run it.** Expect FAIL.
- [ ] **Step 3: Implement it.** Keep each file ≤250 lines.
- [ ] **Step 4: Run** scenario 30, the full suite and `pnpm check`. Expect PASS. Open the sales report in the web app and check the table renders.
- [ ] **Step 5: Commit** `feat(reports): sales by campaign, from first lead to money collected`
