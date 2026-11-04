# Live Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 45 findings from the live review (`docs/testing/2026-11-03-live-review-findings.md`), Critical first, in the smallest way that fully solves each one.

**Architecture:** No new modules unless a task names one.
- Each fix changes the code that owns the behaviour.
- Bigger ideas from the review are left out on purpose: the status card, the "ball is with" field, the quote chase cadence beyond one follow-up, and an alert digest beyond excluding admin.

**Spec:** `docs/superpowers/specs/2026-11-03-whatsapp-sales-cycle-design.md`, plus the findings file above. The IDs (A1… C16) refer to the findings file.

## Global Constraints (product philosophy first)

- **Calm, simple, zero learning curve.**
  - No new pages.
  - No new settings unless a fix truly needs one, and then with a safe default.
  - The customer never needs to type special words.
- **Nothing goes silent.** Every customer message gets a reply. Every step that needs a person gives that person a next action and one alert, not many.
- **Nothing stays only in chat.** Changes write the record and the history in the same transaction.
- **No over-engineering.** Use the simplest fix that closes the finding. If a fix needs more than one new table or service, stop and report it.
- **Customer words** stay plain and short, in en / mr / hi. They follow WhatsApp limits: buttons ≤20 characters, list rows ≤24, ≤3 buttons, ≤10 rows. `words.test.ts` and the onboarding words test must cover new words.
- **Shared folder.** `git add` only your own files by path. Other sessions have uncommitted edits in the command centre, discom and approvals files and in web components; never touch those.
- **Checks.** `pnpm check` stays green (with the 250-line limit). The full `pnpm test:acceptance` passes, including scenarios 42/43, the full journey. Each fix has a test that fails before it.

## Rulings that keep this small

- **B2 (advance waits for the project):** no new booking milestone. B1 makes "start project" a same-day task for a named person, with escalation. The bot's promise changes to "your project manager will start your project and send the advance link today (or the next working day)".
- **A3/A4 (lost or late inbound):** no new inbox table.
  - Record the dedupe marker only after handling succeeds, so Meta's retry is processed.
  - Ignore button and list taps that are older than the chat's newest inbound.
  - Write `lastInboundAt` with `greatest()`.
  - Move the slow parts (media download, PDF rendering) after the 200 only if it fits in the same controller. Otherwise keep it synchronous and report it.
- **A6 (double send):** a send that times out after the POST is marked failed with "may have been sent — check before resending". It is never retried automatically.
- **A8 (order):** the relay starts a recipient's next row only when that recipient has no row in flight. There is no new table: use the existing outbox status and attempts columns, or add one nullable `started_at`.
- **B6 (admin gets everything):** broadcasts skip system-role holders whenever another holder of that capability exists, and Create project requires a project manager pick. There is no digest yet.
- **C1 (money explained):** add one line to the quote and accept messages: "Full price ₹X, paid in 3 parts: ₹a now, ₹b before dispatch, ₹c after installation. Subsidy ₹s comes back to your bank after commissioning." There is no image and no new flow.
- **C3/C4 (Marathi templates and buttons):** this is done by the controller through the Meta API (Task 10). The code side only needs the existing Settings fields (`metaNameMr`, `metaNameHi`, `extrasApproved`).
- **C8 (bursts):** order fixes most of it (A8). Also skip the plain `quotation_sent` template when the chat window is open and the PDF and buttons go as chat messages. Instalments are rounded to whole rupees, with the remainder on the last one.

---

### Task 1: Webhook and secrets (A1, A2, A10 start-up check, A16)

**Files:**
- `apps/api/src/config/environment.ts` (productionIssues)
- `apps/worker/src/config.ts`
- `apps/api/src/modules/whatsapp/whatsapp-events.ts` / `whatsapp-webhook.controller.ts`
- `apps/worker/src/channels/whatsapp-cloud.ts` (log masking)
- `apps/api/src/modules/online-payments/pay-token.ts` (separate secret)
- `.env.example`, `docs/DEPLOYMENT.md`

**What to do:**
- **Production refuses to start when:**
  - `WHATSAPP_DELIVERY=live` without `WHATSAPP_APP_SECRET`
  - `FILE_LINK_SECRET` is the default value (in the API **and** the worker)
  - `API_PUBLIC_URL` is not https or is a localhost / trycloudflare / loca.lt host
- **When `WHATSAPP_APP_SECRET` is set, unsigned posts are refused even on the key path.** This already holds; add a test.
- **New `PAY_LINK_SECRET`** for pay tokens, falling back to `FILE_LINK_SECRET` outside production and required in production. Old tokens signed with the file secret still work for 30 days, behind a fallback flag.
- **Logs:** mask phone numbers to the last 4 digits and never print signed links or tokens.

**Tests:** unit tests for productionIssues (each case) and the masking helper. Acceptance: a webhook post without a signature, with the secret set, returns 401 or 403.

### Task 2: Inbound reliability (A3, A4)

**Files:** `whatsapp-webhook.controller.ts`, `chat-store.ts` (logIncoming / lastInboundAt), the assistant entry.

**What to do:** the A3/A4 ruling. If handling throws:
- remove or undo the inbound dedupe marker, so Meta's retry is processed;
- answer 500 so Meta retries;
- send the chat owner one alert "A WhatsApp message could not be handled", deduped per message.

Stale taps (a choice whose message timestamp is older than the chat's newest inbound) are ignored with no reply.

**Tests (acceptance):**
- Force a handler error (a test-only trigger, for example a DB trigger as in scenario 39) → 500, then the retry with the same id is processed.
- An old tap after a newer message → no state change.
- `lastInboundAt` never moves backwards.

### Task 3: Outbound reliability (A5, A6, A8, A9)

**Files:** `apps/worker/src/channels/whatsapp-cloud.ts`, `delivery.activities.ts`, `relay/outbox-relay.ts`, the outbox schema (only if needed).

**What to do:**
- **Retry by Meta error code:**
  - Retry on 130429 / 131056 / 131048 / 131000 and 5xx.
  - Code 190, or a 401: permanent failure plus one staff alert "WhatsApp token expired", deduped per day, to `settings.manage` holders.
  - 131026 keeps the SMS fallback.
- **A6 ruling.**
- **A8 ruling:** per-recipient order.
- **A9:** a `session:*` row is re-checked against the recipient's `lastInboundAt` at send time with a 23 h margin. Outside the window it becomes failed, with "chat window closed", and the existing failed-file alert covers documents.

**Tests:** worker unit tests for the retry classification and the window re-check. A relay ordering test: two rows for one recipient → the second starts only after the first finishes (unit, with a fake db or the existing test style).

### Task 4: STOP / opt-out (A7)

**Files:** `apps/api/src/modules/whatsapp/assistant/assistant.service.ts` (early route), a small `opt-out.ts`, `delivery.activities.ts` (check), and `wa_conversations` (add `opted_out_at timestamptz null`) or the existing `customers.whatsappOptIn` for customers.

**What to do:**
- **STOP words:** "STOP", "stop", "बंद", "रद्द", "unsubscribe" as the whole message. These mark the phone opted out and reply once: "You will not get messages from us. Send START to begin again."
- **START words:** "START" / "सुरू" opt back in.
- **Opted-out phones:** every template and nudge is skipped with the note "opted out". Replies to messages the customer sends still go out, because the customer wrote first.
- **Staff see "Opted out of WhatsApp"** on the lead and customer page chat panel. Use the existing banner area; add no new page.

**Tests:** acceptance: STOP → reply and flag; a later template is skipped; START → it is sent again.

### Task 5: Payment safety (A11, A12, A13, A14, A15, C8 rounding)

**Files:** `online-payments/due-pay.controller.ts`, `gateway-payments.service.ts`, `link-sync.service.ts`, `razorpay-events.ts`, `projects/receipt-number.ts`, `projects/project-milestones.ts` (planMilestones rounding lives in domain `planMilestones`), and a webhook heartbeat in an existing scheduled job.

**What to do:**
- **A11:** GET `/v1/pay/due/:token` shows a small "Pay ₹X to OneOhm — Continue" page. POST (or a GET with `?go=1` from the button) creates or reuses the link and redirects.
- **A12:** `recordLinkPayment` runs in one transaction with `FOR UPDATE` on the link, and the link status is updated on every path. Link-sync takes `pg_try_advisory_lock` and catches errors per link.
- **A13:** the `refund.processed` / `payment.refunded` / dispute events record an audit row and alert `finance.record_payments` holders: "Refund/dispute on receipt …". Nothing is reversed automatically.
- **A14:** if WhatsApp delivery is live and no inbound webhook has arrived in 24 h while outbound sends happened, alert `settings.manage` once a day.
- **A15:** the receipt number takes the numeric maximum of the suffix.
- **C8:** milestone amounts are rounded to whole rupees, with the remainder on the last customer milestone, for new projects only.

**Tests:** domain unit tests for rounding (the sum stays exact). Acceptance: the landing page has no side effect; concurrent webhook plus sync give one payment and the link is paid; a refund event alerts finance; receipt 10000 sorts after 9999 (unit).

### Task 6: Nobody's move after accept and quote (B1, B2 message, B3, B10)

**Files:**
- `quotations/quotation-accept.ts` (`tellStartProject`)
- `crm/lead-history.ts`
- `quotations/quotations.service.ts` (send)
- the command centre count (a new small item, following an existing one; do not touch other sessions' uncommitted command-centre files — if they conflict, report it)
- `whatsapp/onboarding/estimate-next-steps.ts` (call promise)
- worker daily or timed job for the validity reminder

**What to do:**
- **B1:** on accept (staff or customer), set the lead owner's next action to "Start project for <quote no.>" today. A command-centre count: "Accepted quotes without a project". After 1 working day without a project, alert holders of `projects.create` once.
- **B2:** change the bot words to the ruling's promise, in all 3 languages.
- **B3:**
  - Sending a quote sets the next action "Follow up quote <no.>" in 2 days (a constant; no setting).
  - 3 days before `validUntil`, if the quote is still open, the owner gets one alert. Do not message the customer without an approved template.
- **B10:**
  - The call promise is "today" inside working hours, otherwise "tomorrow morning". Use the existing working-time helper.
  - At the end of the working day, a promised call with no call logged since gets one owner alert.

**Tests:** acceptance for each: the next action after accept, after send, the validity alert (time passed in), the wording by hour, and the end-of-day check.

### Task 7: Chat hand-back and alert noise (B4, B5, B6, B7, B8)

**Files:** `whatsapp-webhook.controller.ts` (`tellAnswerer`), `chat-summaries.ts` / chat reminders (waiting rule), `chats.service.ts`, `notify.ts` (`holdersOf` filters), `projects/project-creation.service.ts` (PM required), `online-payments/payment-follow-ups.ts`.

**What to do:**
- **B4:**
  - A chat in `human` state goes back to the assistant automatically after 4 working hours with no staff message. It is a constant, reusing the reminder clock.
  - Menu, quote and payment taps are always answered by the bot, even in `human` state.
- **B5:** handled taps (choice ids the bot acted on) create no staff alert and don't count as waiting. Only free text and files do.
- **B6:** the ruling.
- **B7:** online payment also tells the project manager and the lead owner (deduped).
- **B8:** broadcasts and owner alerts use the leave backup (the existing `answererFor` / leave logic), and the command centre counts leads whose owner is on leave.

**Tests:** acceptance for each rule, reusing the scenario 36 and 39 style.

### Task 8: Honest funnel and chat panel (B9, B11, B12, B13)

**Files:** `crm/lead-history.ts` (stage on estimate), `business-reports/sales-*.ts`, web `features/reports/sales/*`, `whatsapp/chats.service.ts` (order), `onboarding` notes, `quotation-message.ts` (resend).

**What to do:**
- **B9:**
  - The bot's estimate no longer moves the stage to Contacted. The lead stays New with an "Estimate sent" note, already counted by the `estimates` column.
  - The first staff call, visit or WhatsApp reply moves New → Contacted.
  - By campaign adds an "Advance paid" column: leads whose project has a paid first customer milestone.
- **B11:** the chat panel loads the newest 200 messages, in ascending order for display.
- **B12:** the bot's bill note says "Bill file received on WhatsApp (not checked)".
- **B13:** roof and floors make one note. "Send again" sends only the parts not delivered before (the PDF if failed, the buttons).

**Tests:** acceptance updates to 31/32/40/42 where they assert stage or columns, plus new asserts.

### Task 9: Customer clarity (C1, C2, C5, C6, C7, C9–C16, C11, C12)

**Files:** the onboarding words, `assistant/words*.ts` (split a file if it is at the size limit), `quotation-message.ts`, `quote-actions.ts` (confirm text), `estimate.service.ts` / domain `savingAndPayback` (cap), `receipt-message.ts`, `payment_received` follow-up, `assistant/answers.service.ts`, `onboarding-files.ts` (voice), the onboarding list builders (back row), the settings bill band labels (per-language labels optional: `labelMr`, `labelHi`; fall back to the label), `pdf-file-name.ts`.

**What to do:**
- **C1:** the money line (ruling) in the quote buttons message and the accept confirm.
- **C2:** `savingAndPayback` caps the monthly saving at the band's upper rupee limit (or the label's value), and the PDF and caption say "up to ₹…".
- **C5:**
  - Every bot closing message (answers, receipts, thank-yous, estimate next steps) ends with 1–3 tap buttons: **Menu**, plus the next step (**Pay now**, **Track my project**, **Talk to us**).
  - Marathi and Hindi menu words are accepted.
  - Any text the bot doesn't understand → the menu (already).
- **C6:** after a payment, a chat message with the next step, a named person (the project manager, else the owner) and a phone number, in the customer's language.
- **C7:** remove "in the OneOhm app" from customer chat replies and give a **View receipt** button. Template wording changes go through Task 10.
- **C9:** customer-facing words use "your solar project in <city>" and "1st / 2nd / last instalment". Codes appear only in PDFs and captions. Size reads "6 panels (3.27 kW)".
- **C10:** the first message opens with "Welcome to OneOhm Solar 🙏" (en/mr/hi), then the language buttons.
- **C11:** files from strangers get "File received — our team will check it."
- **C12:** a voice note during onboarding → a warm hand-over to a person (`ensureLead` + `passToOwner`).
- **C13:** bill band labels per language. City names stay as typed by the owner, with a Settings hint to type them in Marathi if wanted.
- **C14:** a "मागे / Back / पीछे" row on each list after the first question (respect the 10-row limit: the person row plus the back row; cut the cities cap to 7 if needed).
- **C15:** fix the listed Marathi phrases, use respectful forms (प्रिया यांच्याकडून), and title-case names.
- **C16:** PDF file names like `OneOhm-<name>-quote.pdf` / `-estimate` / `-receipt`, with captions in the customer's language.

**Tests:** words tests (limits, all languages), plus acceptance updates. The journey transcript is regenerated.

### Task 10: Templates on Meta (C3, C4) — controller task

- Through the Graph API with the `.env` keys, submit:
  - the Marathi and Hindi versions of `quotation_sent`, `payment_link`, `payment_reminder`, `payment_received` and `project_started`;
  - the English versions with a document header (`quotation_sent`, `payment_received`) and buttons (quote: Accept / Question quick replies; pay: a URL button with the production domain and the token as the suffix).
- The production domain is needed for the URL button. Ask the owner once; if it is not known, submit everything except the URL-button versions.
- When approved: set `metaNameMr`, `metaNameHi` and `extrasApproved` in Settings.
- Record the status in `docs/whatsapp-templates.md`.
