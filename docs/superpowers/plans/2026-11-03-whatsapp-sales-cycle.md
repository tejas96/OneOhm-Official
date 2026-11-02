# WhatsApp Sales Cycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The quote PDF, the "Accept quote" button, the "Pay now" button and the receipt reach the customer on WhatsApp. Every tap updates our records. This is Part 1 of 4. Parts 2–4 are outlined at the end, and each gets its own detailed plan before it is built.

**Architecture:** WhatsApp messages already flow API → `outbox` row (same transaction) → Temporal worker → Meta Cloud API. Part 1 has three pieces:
- The worker can add a **document header** and **buttons** to template messages, and can send **document** and **URL-button** chat messages.
- Each template has a setting that says whether its Meta-approved version has these extras. Until the owner turns it on, the plain text version goes out, so nothing breaks while Meta reviews.
- Customer taps come back through the existing webhook → `AssistantService`, which calls the same domain services as the web app.

**Tech Stack:** NestJS API, Drizzle/Postgres, Temporal worker, React web, Vitest, the acceptance suite (`pnpm test:acceptance`), Meta WhatsApp Cloud API, Razorpay Payment Links.

**Spec:** `docs/superpowers/specs/2026-11-03-whatsapp-sales-cycle-design.md`

## Global Constraints

- Nothing stays only in chat. Each customer tap calls a domain service, which writes the record, the history and the alert in one transaction.
- No payment inside the app or WhatsApp. "Pay now" always opens `${API_PUBLIC_URL}/v1/pay/due/<token>`, which then opens Razorpay.
- The app never fails a send because Meta has not yet approved a template with extras. With extras off, the current template goes out as today.
- Customer-facing words are plain and short, in English, Marathi and Hindi. Put them in the existing `words.ts`, `words-mr.ts` and `words-hi.ts`.
- No new pages. Staff see changes on existing places: Today, the lead page, the customer page, the project page, Settings → Messages.
- Only the customer's own number (`customers.phoneE164`) can accept a quote. A family number gets a hand-over to a person.
- Every customer acceptance writes `recordAudit(tx, null, 'quotation.accepted', 'quotation', id, { by: 'customer', phone, channel: 'whatsapp', totalPaise })`.
- The lint, typecheck and test pass is `pnpm check`. It must pass before every commit.
- Tests never message real numbers. `WHATSAPP_DELIVERY=log` is the default, and live mode is limited by `WHATSAPP_TEST_NUMBERS`.

## Review Focus

1. **The customer taps "Accept" on an old revision or an expired quote.** Expect a calm "this quote has changed" message and a hand-over, not an acceptance. (Test in Task 6.)
2. **The customer taps "Accept" twice, or Meta delivers the webhook twice.** Expect one acceptance, one audit row and one thank-you. (Test in Task 6.)
3. **Meta cannot fetch the PDF link** (the link expired, or the API is not public). Expect the send to fail permanently and show in the outbox with a reason, with no endless retry. The Documents menu still works. (Test in Task 1: 4xx is not retried. Task 4 sets the link life.)
4. **A payment link expires before the customer pays.** Expect exactly one new "Pay now" message per expired link, and none when the milestone is already paid. (Test in Task 8.)
5. **The owner turns extras on for a template whose Meta version has no header.** Meta rejects the send. Expect a visible failure in the outbox with Meta's reason, and the owner can turn extras off again. (This is covered by the existing permanent-error path. Task 2's help text says this.)

---

## File Structure (Part 1)

| File | Change | Responsibility |
|---|---|---|
| `apps/worker/src/channels/whatsapp-cloud.ts` | modify | Template header and buttons; `document` and `cta_url` chat kinds |
| `apps/worker/src/channels/message-templates.ts` | modify | `approvedMessage` returns header and buttons when extras are on |
| `apps/worker/src/activities/delivery.activities.ts` | modify | Passes header and buttons through |
| `packages/domain/src/messaging/message-templates.ts` | modify | `extras` on each default template |
| `packages/database/src/schema/message-templates.schema.ts` | modify | `extrasApproved boolean default false` |
| `apps/web/src/features/settings/…messages…` | modify | One switch per template: "Meta approved the version with file and buttons" |
| `apps/api/src/modules/whatsapp/file-links.ts` | modify | `sharedFileUrl()` helper (removes 3 copies) |
| `apps/api/src/modules/quotations/quotations.service.ts` | modify | Send carries PDF and buttons; `acceptByCustomer()` |
| `apps/api/src/modules/crm/lead-history.ts` | modify | `autoMoveLead` takes `userId: string \| null` |
| `apps/api/src/modules/whatsapp/assistant/quote-actions.ts` | create | Accept and Question taps on a quote |
| `apps/api/src/modules/whatsapp/assistant/assistant.service.ts` | modify | Routes `quote_*` taps; Documents lists sent quotes |
| `apps/api/src/modules/whatsapp/assistant/answers.service.ts` | modify | Sent quotes in Documents; Pay now buttons in Payments |
| `apps/api/src/modules/online-payments/milestone-due-notice.ts`, `payment-links.service.ts`, `apps/worker/src/activities/payment-reminders.ts` | modify | `payToken` in the payload |
| `apps/api/src/modules/projects/finance.service.ts` | modify | Receipt PDF on `payment_received`; staff alert on online payments |
| `apps/api/src/modules/online-payments/razorpay-events.ts` | modify | Expired link → one fresh Pay now |
| `apps/api/test/acceptance/scenarios/28-whatsapp-quote-and-pay.acceptance.ts` | create | End-to-end proof |
| `apps/api/test/acceptance/support/whatsapp.ts` | create | Signed fake inbound webhook |
| `docs/whatsapp-templates.md` | modify | Meta drafts with header and buttons |
| `docs/LIVE-TEST-WHATSAPP-RAZORPAY.md` | create | Checklist for the live run |

---

### Task 1: Worker — template extras and new chat kinds

**Files:**
- Modify: `apps/worker/src/channels/whatsapp-cloud.ts`
- Test: `apps/worker/src/channels/channels.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TemplateHeader { readonly kind: 'document'; readonly link: string; readonly filename: string }
  export type TemplateButton =
    | { readonly kind: 'quick_reply'; readonly index: number; readonly payload: string }
    | { readonly kind: 'url'; readonly index: number; readonly suffix: string };
  // WhatsAppTemplateMessage gains: header?: TemplateHeader; buttons?: readonly TemplateButton[]
  // SessionMessage gains:
  //   | { kind: 'document'; link: string; filename: string; caption?: string }
  //   | { kind: 'cta_url'; body: string; label: string; url: string }
  ```

- [ ] **Step 1: Write failing tests** in `channels.test.ts`:
  - `templateRequestBody adds a document header first`: `components[0]` equals `{ type: 'header', parameters: [{ type: 'document', document: { link: 'https://x/q.pdf', filename: 'QT-1.pdf' } }] }`, and the body stays `components[1]`.
  - `templateRequestBody adds quick reply and url buttons`: with buttons `[{kind:'quick_reply',index:0,payload:'quote_accept:Q'},{kind:'url',index:1,suffix:'tok'}]`, expect `{ type:'button', sub_type:'quick_reply', index:'0', parameters:[{type:'payload',payload:'quote_accept:Q'}] }` and `{ type:'button', sub_type:'url', index:'1', parameters:[{type:'text',text:'tok'}] }`.
  - `templateRequestBody without extras is unchanged`: deep-equals today's output.
  - `sessionRequestBody document`: `{ type:'document', document:{ link, filename, caption } }`.
  - `sessionRequestBody cta_url`: `{ type:'interactive', interactive:{ type:'cta_url', body:{text}, action:{ name:'cta_url', parameters:{ display_text: label, url } } } }`. `label` is cut to 20 characters (Meta's limit).
- [ ] **Step 2: Run** `pnpm --filter @oneohm/worker test -- channels`. Expect FAIL.
- [ ] **Step 3: Implement** in `whatsapp-cloud.ts`. In log mode, `send` also logs the header filename and the button payloads.
- [ ] **Step 4: Run** the same command. Expect PASS.
- [ ] **Step 5: Commit** `feat(worker): WhatsApp templates carry a file and buttons; chat sends files and link buttons`

### Task 2: Template extras setting

**Files:**
- Modify: `packages/domain/src/messaging/message-templates.ts`, `packages/database/src/schema/message-templates.schema.ts`, `apps/worker/src/channels/message-templates.ts`, `apps/worker/src/activities/delivery.activities.ts`, and the Settings → Messages component under `apps/web/src/features/settings/`
- Create: a migration via `pnpm --filter @oneohm/database db:generate`
- Test: `packages/domain/src/messaging/message-templates.test.ts`, `apps/worker/src/channels/template-language.test.ts`

**Interfaces:**
- Consumes: `TemplateHeader` and `TemplateButton` (Task 1).
- Produces:
  ```ts
  // MessageTemplateDefault gains:
  readonly extras?: {
    readonly document?: { readonly urlField: string; readonly nameField: string };
    readonly quickReplies?: readonly string[];   // payload field names, in button order
    readonly urlButton?: string;                 // payload field holding the URL suffix
  };
  // approvedMessage(...) result gains header?: TemplateHeader; buttons?: TemplateButton[]
  // messageTemplates.extrasApproved: boolean, default false
  ```
- Extras per template:
  - `quotation_sent`: document `documentUrl` / `documentName`; quickReplies `['acceptPayload','askPayload']`.
  - `payment_link`: urlButton `payToken`.
  - `payment_reminder`: urlButton `payToken`.
  - `payment_received`: document `documentUrl` / `documentName`.

- [ ] **Step 1: Write failing tests:**
  - `approvedMessage adds header and buttons only when extrasApproved`: with `extrasApproved: true` and a payload holding `documentUrl`, `documentName`, `acceptPayload` and `askPayload`, the header and 2 quick replies come back. With `false`, neither does.
  - `approvedMessage with extras on but documentUrl missing throws MissingFieldError`.
  - `quick reply index follows button order`, and the URL button index is `quickReplies.length`.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/worker test -- template` and `pnpm --filter @oneohm/domain test -- message-templates`. Expect FAIL.
- [ ] **Step 3: Implement.** Add the column. `prepare()` in `delivery.activities.ts` passes `config?.extrasApproved ?? false`. `send()` forwards `header` and `buttons`. Settings → Messages gets one switch per template that has `extras`, with the label "Meta approved the version with file and buttons". Help text: "Turn on only after Meta approves it. If messages fail, turn it off."
- [ ] **Step 4: Run** `pnpm --filter @oneohm/database db:generate`, then the tests above. Expect PASS. Then run `pnpm check`.
- [ ] **Step 5: Commit** `feat(messages): a switch per template for its Meta version with a file and buttons`

### Task 3: One helper for shared file links

**Files:**
- Modify: `apps/api/src/modules/whatsapp/file-links.ts`, `assistant/answers.service.ts:131-134`, `projects/task-message-reach.ts:37-70`
- Test: `apps/api/src/modules/whatsapp/file-links.test.ts`

**Interfaces:**
- Produces: `sharedFileUrl(env: Pick<Environment,'API_PUBLIC_URL'|'FILE_LINK_SECRET'|'FILE_LINK_HOURS'>, file: Omit<SharedFile,'exp'>, now?: number): string`. It returns `${API_PUBLIC_URL}/v1/files/shared/<token>` and expires `FILE_LINK_HOURS` from `now`.

- [ ] **Step 1: Test** `sharedFileUrl builds a link readFileLink accepts until FILE_LINK_HOURS pass`. Read the token back with `readFileLink`. It must fail at `now + hours*3600*1000 + 1`.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/api test -- file-links`. Expect FAIL.
- [ ] **Step 3: Implement it,** and replace the 2 hand-built copies.
- [ ] **Step 4: Run** the same test, then `pnpm check`. Expect PASS.
- [ ] **Step 5: Commit** `refactor(whatsapp): one helper builds shared file links`

### Task 4: Quote send carries the PDF and buttons

**Files:**
- Modify: `apps/api/src/modules/quotations/quotations.service.ts:113-146`
- Test: `apps/api/test/acceptance/scenarios/28-whatsapp-quote-and-pay.acceptance.ts` (create; the first `it` blocks)

**Interfaces:**
- Consumes: `sharedFileUrl` (Task 3). Extras keys (Task 2).
- Produces: a `quotation_sent` payload with `documentUrl`, `documentName = "<number>.pdf"`, `acceptPayload = "quote_accept:<quotationId>"` and `askPayload = "quote_ask:<quotationId>"`.

- [ ] **Step 1: Write the acceptance test** `it('sends the quote PDF and buttons with the quote message')`:
  - Use `newCustomer` and `createQuotation` from `support/sales.ts`, then `POST /quotations/:id/send`.
  - Read the newest `outbox` row with `template = 'quotation_sent'` for the customer's phone.
  - Expect `payload.acceptPayload === 'quote_accept:' + id` and `payload.documentName` to end in `.pdf`.
  - `fetch(payload.documentUrl)` returns 200 with `content-type` `application/pdf`.
- [ ] **Step 2: Run** `pnpm test:acceptance -- 28`. Expect FAIL.
- [ ] **Step 3: Implement.** Add the 4 fields in `send()`. If the customer's chat window is open (`wa_conversations.lastInboundAt` within 24 h), also queue a session `document` message with dedupe key `quote_pdf:<id>`. This covers the case where the template has no extras yet.
- [ ] **Step 4: Run** the test. Expect PASS.
- [ ] **Step 5: Commit** `feat(quotes): the quote PDF and Accept / Question buttons go with the WhatsApp message`

### Task 5: Documents menu lists sent quotes

**Files:**
- Modify: `apps/api/src/modules/whatsapp/assistant/answers.service.ts` (`documents()`)
- Test: scenario 28

- [ ] **Step 1: Write the test** `it('lists a sent, not yet accepted quote in the Documents answer')`:
  - Post a signed inbound text `documents` from the customer's phone (helper in Task 6, Step 1).
  - The newest `session:` outbox row body contains the quote number and a `/v1/files/shared/` link.
- [ ] **Step 2: Run it.** Expect FAIL.
- [ ] **Step 3: Implement.** Include the customer's newest `sent` or `accepted` revision per quotation number, besides project quotations, with no duplicates.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `fix(whatsapp): Documents shows quotes that are sent but not yet accepted`

### Task 6: The customer accepts the quote on WhatsApp

**Files:**
- Create: `apps/api/test/acceptance/support/whatsapp.ts`, `apps/api/src/modules/whatsapp/assistant/quote-actions.ts`
- Modify: `quotations.service.ts` (extract `acceptInTx`; add `acceptByCustomer`), `crm/lead-history.ts:104` (`userId: string | null`), `assistant/assistant.service.ts` (route before `menuChoice`), `assistant/words*.ts`
- Test: scenario 28; `apps/api/src/modules/whatsapp/assistant/quote-actions.test.ts` for the tap parsing

**Interfaces:**
- Produces:
  ```ts
  // support/whatsapp.ts
  export async function sendInbound(from: string, message: { text?: string; buttonPayload?: string; id?: string }): Promise<void>
  //   POSTs to /v1/webhooks/whatsapp, signed with 'oneohm-acceptance-whatsapp-secret' (x-hub-signature-256)
  // quote-actions.ts
  export function readQuoteTap(choiceId: string | null): { action: 'accept' | 'confirm' | 'ask'; quotationId: string } | null
  //   ids: quote_accept:<id>, quote_yes:<id>, quote_ask:<id>
  // QuotationsService
  async acceptByCustomer(input: { customerId: string; phoneE164: string; quotationId: string }):
    Promise<'accepted' | 'already' | 'not_open' | 'not_owner'>
  ```

- [ ] **Step 1: Write the tests:**
  - Unit: `readQuoteTap` parses all 3 ids. It returns null for `menu`, for `quote_accept:` with an empty id, and for an unknown prefix.
  - Acceptance `it('asks to confirm, then accepts on yes')`:
    - `sendInbound(phone, { buttonPayload: 'quote_accept:'+id })` → the newest session row is `buttons` with ids `quote_yes:<id>` and `quote_ask:<id>`.
    - Then `sendInbound(phone, { buttonPayload: 'quote_yes:'+id })` → the quotation status is `accepted`.
    - One `audit_log` row with `action='quotation.accepted'`, `actor_user_id is null` and `data->>'by'='customer'`.
    - The lead stage is `won`.
    - A notification exists for the lead owner and for `projects.create` holders.
  - `it('accepts once when the yes arrives twice')`: send the same `id` twice → 1 audit row and 1 thank-you row.
  - `it('refuses an old revision and hands over')`: make revision 2, then tap yes on revision 1 → status unchanged and the conversation state is `human`.
  - `it('hands a family number to a person')`: save a family number on the customer, tap yes from it → not accepted and state `human`.
- [ ] **Step 2: Run** `pnpm --filter @oneohm/api test -- quote-actions` and `pnpm test:acceptance -- 28`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - `acceptInTx(tx, quotation, actorUserId: string | null, auditData)` holds the current accept body. `accept()` (staff) and `acceptByCustomer()` both call it.
  - `acceptByCustomer` returns `not_open` when any of these is true: the status is not `sent`, `validUntil` is before today, the discount is pending, or a newer revision exists.
  - It returns `not_owner` when the phone ≠ `customers.phoneE164`.
  - The alert text: "<customer> accepted <number> on WhatsApp — start the project".
  - In `AssistantService.answer`, a `readQuoteTap` hit is handled before `menuChoice`, and also when `chat.state === 'human'`.
  - Results:
    - `not_open` / `not_owner`: send words `quoteChanged` / `quoteOwnerOnly`, then `passToOwner`.
    - `accepted`: send `quoteThanks`.
    - `already`: send `quoteThanks` only if no thank-you was queued (dedupe key `quote_thanks:<id>`).
- [ ] **Step 4: Run** both. Expect PASS. Then `pnpm check`.
- [ ] **Step 5: Commit** `feat(whatsapp): customers accept their quote from WhatsApp; staff are told to start the project`

### Task 7: "Pay now" buttons

**Files:**
- Modify: `online-payments/milestone-due-notice.ts:60-77`, `online-payments/payment-links.service.ts:~98`, `apps/worker/src/activities/payment-reminders.ts:~66`, `whatsapp/assistant/answers.service.ts` (`payments()`, `milestoneLine`), `whatsapp/assistant/assistant.service.ts` (`choose` → `payments`)
- Test: scenario 28

**Interfaces:**
- Produces: `payment_link` and `payment_reminder` payloads carry `payToken`, which is the `signPayToken` value only (no URL). `link` stays for the text template. The worker gets `FILE_LINK_SECRET` if it does not have it yet, so it can sign the token for reminders.
- Menu "Payments" with the window open: one `cta_url` message per due milestone, label `WORDS.payNow`, url `${API_PUBLIC_URL}/v1/pay/due/<token>`.

- [ ] **Step 1: Write the test** `it('the advance link message carries a pay token that opens the pay page')`:
  - Accept the quote and create the project (`POST /projects` as in `sellProject`).
  - The `payment_link` outbox row for the advance has `payload.payToken`.
  - `fetch(API + '/v1/pay/due/' + payToken, { redirect: 'manual' })` returns a 302 to `/v1/pay/sandbox/`.
- [ ] **Step 2: Run it.** Expect FAIL.
- [ ] **Step 3: Implement** the changes in the 3 senders and the Payments answer.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(payments): Pay now buttons on WhatsApp payment messages`

### Task 8: After payment — receipt, alerts, expired links

**Files:**
- Modify: `projects/finance.service.ts:165-180`, `online-payments/gateway-payments.service.ts:~79`, `online-payments/razorpay-events.ts` (the `expired` branch)
- Test: scenario 28; `online-payments/razorpay-events.test.ts`

**Interfaces:**
- Produces:
  - The `payment_received` payload adds `documentUrl` (from `sharedFileUrl({kind:'receipt', id: paymentId, customerId})`) and `documentName = "<receiptNumber>.pdf"`.
  - Online payments notify the lead owner or project manager, plus `finance.manage` holders: "₹… paid online by <customer> for <milestone>".
  - An expired link whose milestone is still `due` or `partly_paid` queues `payment_link` with a fresh `payToken`, dedupe `link_expired:<paymentLinkId>`.

- [ ] **Step 1: Write the tests:**
  - Acceptance `it('a sandbox payment records the money and sends the receipt PDF')`:
    - Open the token, then `POST /v1/pay/sandbox/:id`.
    - The milestone is `paid`.
    - The `payment_received` row has a `documentUrl` that returns a PDF.
    - A finance notification exists.
    - A `project_activities` row of kind `payment` exists.
  - Acceptance `it('an expired link sends one fresh Pay now')`: post a signed `payment_link.expired` twice (`support/money.ts` signs it) → exactly 1 `link_expired:` outbox row.
  - Acceptance `it('no fresh link when the milestone is already paid')`.
- [ ] **Step 2: Run** `pnpm test:acceptance -- 28`. Expect FAIL.
- [ ] **Step 3: Implement.** Check first that `finance.manage` is the capability name in `packages/domain/src/identity/capabilities.ts`. If it is not, use the accounts capability listed there.
- [ ] **Step 4: Run it.** Expect PASS. Then `pnpm check`.
- [ ] **Step 5: Commit** `feat(payments): receipt PDF on WhatsApp, staff told of online payments, one fresh link when a link expires`

### Task 9: Meta drafts and the live test checklist

**Files:**
- Modify: `docs/whatsapp-templates.md`
- Create: `docs/LIVE-TEST-WHATSAPP-RAZORPAY.md`

- [ ] **Step 1: Update** the drafts for `quotation_sent`, `payment_link`, `payment_reminder` and `payment_received`:
  - Header and button layout as in the spec table.
  - The URL button base is `https://<API host>/v1/pay/due/{{1}}`.
  - Quick reply labels "Accept quote" and "I have a question".
  - The order to follow: submit to Meta, wait for approval, set the Meta name in Settings, turn on the extras switch.
- [ ] **Step 2: Write the checklist:**
  - `.env` values the owner sets: `WHATSAPP_DELIVERY=live`, `WHATSAPP_TEST_NUMBERS=+918087823247`, `RAZORPAY_MODE=live` with `rzp_test_` keys (allowed outside production), `RAZORPAY_WEBHOOK_SECRET`, and `API_PUBLIC_URL` set to a public tunnel.
  - The Razorpay test dashboard webhook URL `/v1/webhooks/razorpay`, with events `payment_link.paid`, `payment_link.partially_paid`, `payment_link.expired` and `payment_link.cancelled`.
  - Then walk the journey: send quote → PDF arrives → Accept → staff create the project → Pay now → pay with a Razorpay test UPI or card → receipt arrives. Check that the lead, customer, project, finance and chat all show it.
  - Add a tick column for each row of the spec's loop table.
- [ ] **Step 3: Commit** `docs: Meta drafts with file and buttons; live test checklist`

### Task 10: The live run (with the owner)

- [ ] **Step 1:** The owner sets the `.env` values from the checklist. Claude never types keys.
- [ ] **Step 2:** Start the API, the worker and a tunnel. Then send "Hi" from +91 8087823247.
- [ ] **Step 3:** Walk the checklist. Record each result in `docs/LIVE-TEST-WHATSAPP-RAZORPAY.md`.
- [ ] **Step 4:** Fix any failure as a new task, with a failing test first.

---

## Parts 2–4 (outline; each gets its own detailed plan before building)

**Part 2 — Assignment and sources (G4, G6).**
- Lead rule in Settings → Assignment: fewest open leads or round robin, plus an optional city list per person.
- `pickLeadOwner` skips people with approved `leave_requests` today and the manual switch. If nobody is free, the lead goes to the `leads.manage` desk with an alert.
- New lead fields: `campaignCode`, `adId`, `adHeadline`, `utm*`.
- Parse the Meta `referral` object and the `Hi OneOhm <CODE>` text.
- Settings → Lead sources (code → name).
- One source/campaign table on the sales dashboard.
- Leave approval moves booked slots too.

**Part 3 — Onboarding bot and estimate (G2, G3).**
- New chat states `onboard_*`: language, name, city, site type, bill band, roof and floors, bill photo.
- Each answer calls `LeadIntakeService` or a lead update.
- The bill photo is stored on the lead (`media-intake` change for strangers with a lead).
- A `lead_estimates` table. The estimate is priced by `QuotationPricingService.price()` with the default products from Settings for the site type. Estimate PDF.
- "Talk to a person" on every step. One nudge (`onboarding_nudge`). Back and change words.
- Referral, old-lead and family rules from the spec's builder's calls.

**Part 4 — Slot booking (G5).**
- Free slots come from working hours, slot length, the owner's timed next actions and approved leave. The backup or team is the fallback.
- List messages for the day and the slot. Booking sets the lead's next action with a history note and an alert.
- `slot_confirmed` and `slot_reminder` templates with Change and Cancel.
- Customer reminders the evening before and 1 hour before (worker schedule). "Not now" → a check-back pick.
