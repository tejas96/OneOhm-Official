# Papers per home, WhatsApp first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every customer paper lands on the right home (property + project), both sides are told the same thing at every step, and nothing goes silent.

**Architecture:** One domain rule decides person papers vs home papers. A WhatsApp file is stored once on arrival (`ChatFileKeeper`), then *filed* (home, kind, request) by updating that one document. The assistant asks "Which home?" / "Which paper?" only when it must. Staff fix mistakes with one "Move / change kind" action and one "Ask again" action. A worker job sends reminders and "to sort" alerts.

**Tech Stack:** NestJS + Drizzle (apps/api), Temporal-free worker loop (apps/worker), Next.js (apps/web), Expo (apps/customer, label only), Zod contracts (packages/api-contracts), domain rules (packages/domain), Postgres migrations (packages/database).

**Spec:** `docs/superpowers/specs/2026-11-04-papers-per-home-design.md`

## Global Constraints

- Person papers are exactly `customer_kyc` and `income_proof`. Every other category belongs to one home.
- A "home" = a property of the customer with a non-cancelled project or an open lead (stage not `won`/`lost`). Two projects on one property = one home.
- A customer with one home is never asked "Which home?".
- The "home chosen" and "paper chosen" answers cover the next **30 minutes** of files.
- Unsorted files alert the chat's person after **2 hours**. Open requests: customer reminder at **2 days** (once), staff alert at **4 days** (once).
- WhatsApp list rows: title ≤ 24 chars, description ≤ 72, at most 10 rows (9 homes + 1 person row).
- `paper_request` template wording (en): `Hello {{1}}, please send your {{2}} for your solar at {{3}}. Reply here with a clear photo or PDF. You can also send it from the OneOhm app.` Fields: `customer, document, home`.
- `document_requested` stays in use until the `paper_request` row is `active` in `message_templates`.
- Lead-stage papers stay mixed; they move onto the project when the project is made from that lead's quotation.
- No new screens or settings. One new web sheet (move/change kind) and one new request action (ask again).
- Words in English, Marathi, Hindi follow `apps/api/src/modules/whatsapp/assistant/words*.ts` and `packages/database/src/customer-message{,-mr,-hi}.ts`.
- Do not touch the uncommitted people-lifecycle work in this checkout (`apps/api/src/modules/people/**`, `discom`, `contractors`, `project-filters`, `segmented-control`, `people.contract.ts`, `schemas/index.ts`, `55-remove-person.acceptance.ts`).

## Review Focus

1. A customer with 2 homes sends 4 photos in a row → exactly one "Which home?" list, all 4 filed on the tapped home. (Task 5 test `one question for a burst`.)
2. A customer taps an old "Which home?" row after 30 minutes or for a home that is no longer active → told the home list again, nothing filed on a wrong home. (Task 5 test `stale home tap`.)
3. An Aadhaar request is open and a bill photo arrives for home B → the bill does not answer the Aadhaar request. (Task 6 test `person request not taken by a home paper`.)
4. Staff moves a paper that answered home A's request to home B → home A's request is open again and the customer is asked again. (Task 8 test `move reopens request`.)
5. Meta retries the same file (same media id) → still one document, same filing. (Task 4 test `retry keeps one document`.)

---

### Task 0: Branch for this work

- [ ] **Step 1:** `git switch -c feat/papers-per-home` from the current `feat/people-lifecycle` HEAD.
- [ ] **Step 2:** Commit only today's WhatsApp-files work (files listed in `git status` under `apps/api/src/modules/whatsapp/**`, `crm/customer-messages.read.ts`, `customer-portal/customer-*-requests*.ts`, `customer-portal/customer-request-photos.service.ts`, `documents/document-requests.service.ts`, `packages/api-contracts/src/schemas/whatsapp.schema.ts`, `packages/database/src/schema/whatsapp.schema.ts`, `packages/database/migrations/0067_*`, `migrations/meta/*`, `apps/web/src/features/service/whatsapp/message-bubble.tsx`, `apps/web/src/features/projects/control-room/activity-timeline.tsx`, `apps/api/test/acceptance/scenarios/56-whatsapp-chat-files.acceptance.ts`, the spec and this plan). Message: `feat(whatsapp): customer files show in chat and Documents`. Leave the people-lifecycle files unstaged.

### Task 1: The home rule and the home list

**Files:**
- Modify: `packages/domain/src/documents/site-papers.ts`, `packages/domain/src/documents/site-papers.test.ts`
- Create: `apps/api/src/modules/customer-portal/customer-homes.ts`, `apps/api/src/modules/customer-portal/customer-homes.test.ts` (pure label helper)
- Modify: `apps/api/src/modules/reports/document-checklist.service.ts:52-60` (count homes, not properties)

**Interfaces:**
- Produces (domain): `PERSON_DOCUMENT_CATEGORIES = ['customer_kyc','income_proof'] as const`; `isPersonDocumentCategory(category: string): boolean`; `isSiteDocumentCategory(category)` = `!isPersonDocumentCategory(category)`. `SITE_DOCUMENT_CATEGORIES` is removed; `countsForSite` unchanged.
- Produces (api): `interface CustomerHome { propertyId: string; projectId: string | null; title: string; description: string }` and `customerHomes(db: DatabaseExecutor, customerId: string): Promise<CustomerHome[]>` — newest first; `projectId` = newest non-cancelled project on that property, else null (lead only). `title` = property label or city (≤24), `description` = `city · consumer no. ending NNNN` (≤72; omit the tail when no consumer number).
- Produces: `homeLabel(home: Pick<CustomerHome,'title'>): string` used in replies ("your home at Pune").

- [ ] **Step 1: Failing tests.** In `site-papers.test.ts`: `site_photo`, `discom`, `warranty`, `subsidy`, `bank_loan` on project A do not count for project B of a 2-home customer; `customer_kyc` and `income_proof` count everywhere. In `customer-homes.test.ts` (pure `describeHome({label, city, consumerNumber})`): `{label:'Farm', city:'Sangli', consumerNumber:'170012345678'}` → title `Farm`, description `Sangli · consumer no. ending 5678`; no label → title is city.
- [ ] **Step 2:** Run `pnpm --filter @oneohm/domain test site-papers` and `pnpm --filter @oneohm/api exec vitest run src/modules/customer-portal/customer-homes.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `customerHomes` selects properties of the customer joined to non-cancelled projects (left) and open leads (left, `leads.propertyId`), keeping properties with either; `DISTINCT ON (property)` newest project.
- [ ] **Step 4:** Checklist: `customerSites` = `(await customerHomes(db, customerId)).length || 1`.
- [ ] **Step 5:** Run domain + api unit tests and `pnpm test:acceptance 12-documents 15-customer-app` → PASS.
- [ ] **Step 6:** Commit `feat(documents): only ID and income papers are shared across homes`.

### Task 2: Migration — backfill homes, template row, index

**Files:**
- Create: `packages/database/migrations/0068_papers_per_home.sql` (+ journal/snapshot via `pnpm --filter @oneohm/database db:generate` for the index, then append the data SQL to the generated file)
- Modify: `packages/database/src/schema/records.schema.ts` (add `index('documents_property_idx').on(table.propertyId)`)
- Modify: `packages/domain/src/messaging/message-templates.ts` (add `paper_request` entry after `document_requested`)

- [ ] **Step 1:** SQL appended to the migration:
  ```sql
  UPDATE documents d SET property_id = p.property_id FROM projects p
   WHERE d.project_id = p.id AND d.property_id IS NULL;
  INSERT INTO message_templates (key, audience, meta_name, fields, preview, active)
  VALUES ('paper_request', 'customer', 'paper_request', ARRAY['customer','document','home'],
   'Hello {{1}}, please send your {{2}} for your solar at {{3}}. Reply here with a clear photo or PDF. You can also send it from the OneOhm app.', false)
  ON CONFLICT (key) DO NOTHING;
  ```
- [ ] **Step 2:** Run `pnpm test:acceptance 12-documents` (recreates the acceptance DB with all migrations) → PASS; `SELECT count(*) FROM documents WHERE project_id IS NOT NULL AND property_id IS NULL` → 0.
- [ ] **Step 3:** Commit `feat(database): backfill paper homes; add paper_request template (inactive)`.

### Task 3: Every paper saved with its home

**Files:** `apps/api/src/modules/customer-portal/customer-document-requests.service.ts`, `customer-portal/customer-request-photos.service.ts`, `projects/project-creation.service.ts`, `whatsapp/onboarding/onboarding-files.ts` (PendingFile), `whatsapp/onboarding/onboarding-turn-files.ts`, `whatsapp/assistant/stranger-flow.ts`

**Interfaces:**
- Produces: `PendingFile` gains `readonly mediaId?: string`; `fileHeldBill` calls `linkChatFile(tx, held.mediaId, documentId)` (needs `filePendingBill` to return `string | null` document id instead of boolean).
- Lead papers: in `ProjectCreationService.create`, inside the project transaction: `UPDATE documents SET project_id = :project, property_id = :property WHERE lead_id = quotation.leadId AND project_id IS NULL AND removed_at IS NULL`.

- [ ] **Step 1: Failing acceptance tests** (new file `apps/api/test/acceptance/scenarios/57-papers-per-home.acceptance.ts`, describe `Papers per home`):
  - `a request answered in the app is filed with its property` → `documents.property_id` = project's property.
  - `lead papers move onto the project made from the lead` → a bill filed on the lead before `sellProject` has the project and property after.
  - `a bill held before the lead shows in the chat once filed` → chat message for that media has `file` not null.
  - `a lead's bill outside onboarding alerts the lead owner` → one `whatsapp_message`/lead alert row for the owner.
- [ ] **Step 2:** Run `pnpm test:acceptance 57-papers-per-home` → FAIL.
- [ ] **Step 3:** Implement: set `propertyId` (from the request's project / service request's project) in both inserts; held-bill media id; lead papers move; stranger `fileOnLead` sends `tellLeadOwner` (from `crm/lead-history.ts`) with title `New bill on WhatsApp`.
- [ ] **Step 4:** Run → PASS. Commit `fix(documents): every customer paper keeps its home`.

### Task 4: Store once, then file (WhatsApp customers)

**Files:**
- Modify: `apps/api/src/modules/whatsapp/chat-file-keeper.ts`, `whatsapp-webhook.controller.ts`, `chat-store.ts`
- Create: `apps/api/src/modules/whatsapp/file-paper.ts`

**Interfaces:**
- `ChatFileKeeper.keep(chat, message): Promise<string | null>` — for chats with a `customerId` it runs **before** `handle`, stores the file under the customer with `projectId/propertyId = null`, category `other`, links the message, returns the document id (null when not kept; it alerts as today). For lead/stranger chats it keeps today's "after handle" fallback.
- `chatDocumentFor(db, mediaId: string): Promise<string | null>` in `chat-store.ts`.
- `filePaper(tx: DatabaseExecutor, documentId: string, to: { projectId: string | null; propertyId: string | null; category: string; serviceRequestId?: string }): Promise<void>` in `file-paper.ts` — one update, plus a project log line `Customer sent <kind> on WhatsApp: <name>` when it gets a project.
- `linkChatFile`'s soft-remove branch is deleted (no second copy any more).

- [ ] **Step 1: Failing tests** in `57-papers-per-home.acceptance.ts`: `a file is stored once and the chat shows it before any question` (one document, `project_id` null, message has file); `retry keeps one document` (same `wamid` posted twice → 1 document).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; webhook order for customer chats: `logIncoming` → `keep` → `handle`.
- [ ] **Step 4:** Run 56 + 57 + 44 → PASS. Commit `refactor(whatsapp): store a customer file once, file it later`.

### Task 5: "Which home?" on WhatsApp

**Files:**
- Modify: `apps/api/src/modules/whatsapp/assistant/media-intake.ts`, `assistant.service.ts`, `chat-step.ts` (add step `await_file_home`), `words.ts`, `words-mr.ts`, `words-hi.ts`
- Create: `apps/api/src/modules/whatsapp/assistant/file-home.ts`, `file-home.test.ts`

**Interfaces:**
- Context keys: `toSort: string[]` (document ids, max 10), `fileHome: { propertyId: string | 'person'; at: number }`.
- `chooseHome(input: { homes: CustomerHome[]; openSiteRequestHomes: string[]; remembered: FileHome | null; now: number }): { propertyId: string | 'person' } | 'ask'` — pure: 1 home → it; remembered within 30 min → it; exactly one home with open site requests → it; else `'ask'`.
- Tap ids: `fhome:<propertyId>` and `fhome:person`. `fileHomeTapped(choiceId): string | 'person' | null`.
- `MediaIntakeService.receive(chat, customerId, media, said)` new order: complaint step (`await_problem`) → recent complaint → voice/video (pass to person; filed only if `chooseHome` gives a home without asking) → `chooseHome` → file + answer requests (Task 6) or ask list.
- Held chats (`state === 'human'`) use the same `receive` for photos and papers (replaces `answerOpenRequest`).
- Words (en): `whichHome: 'Which home is this for?'`, `personRow: 'Aadhaar / PAN (all homes)'`, `savedFor: (kind, home) => \`Saved: *${kind}* for your home at *${home}*.\``, `stillNeeded: (list) => \`Still needed for this home: ${list}.\``.

- [ ] **Step 1: Failing unit tests** `file-home.test.ts`: one home → that home; two homes, remembered 10 min ago → remembered; remembered 31 min ago → `'ask'`; two homes, only B has open site requests → B.
- [ ] **Step 2: Failing acceptance tests** (57): `one question for a burst` (2 homes, 4 photos → 1 list reply, after tap all 4 on that property); `one home is never asked` (no list reply); `stale home tap` (tap `fhome:<id>` of a cancelled project's property → home list again, nothing filed); `unanswered files stay to sort and show in the chat`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run 51-*, 56, 57, 44 → PASS.
- [ ] **Step 6:** Commit `feat(whatsapp): ask which home a file is for, once`.

### Task 6: Match the right request, tell the customer what is left

**Files:** `apps/api/src/modules/whatsapp/assistant/media-intake.ts`, `customer-portal/customer-document-requests.service.ts`, `words*.ts`

**Interfaces:**
- `CustomerDocumentRequestsService.answerWithDocument(customerId: string, requestId: string, documentId: string): Promise<CustomerDocumentRequest>` — same claim/notify/log/audit as `answer`, but files the existing document (via `filePaper`, category = request's) instead of uploading. `answer` (app upload) keeps its signature.
- Open requests for a home = site-category requests whose project is on that property; for `person` = person-category requests of the customer.
- Two or more open → list `Which paper is this?` with rows `fpaper:<requestId>` (title = request title ≤24) + `fpaper:none` (`Something else`). Context `filePaper: { requestId: string | 'none'; propertyId: string | 'person'; at: number }` covers 30 min.
- First file answers the request; later files in the window are filed on the same home with the same category.
- Reply: `savedFor(kind, home)` + `stillNeeded(...)` listing open requests **for that home** only.
- On receipt, also notify owners of that project's tasks with `waitingParty = 'customer'` and `waitingSince` set: title `<customer> sent <paper>`, subject the project.

- [ ] **Step 1: Failing tests** (57): `person request not taken by a home paper`; `two open papers ask which paper`; `front and back go together` (2 photos → request received + 2 documents with category `customer_kyc`); `waiting task owner is told`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run 44, 56, 57 → PASS (update 56's held-paper case to the new reply).
- [ ] **Step 5:** Commit `feat(whatsapp): papers answer the right request on the right home`.

### Task 7: Requests — per home, new template, cancel and ask again, staff upload closes

**Files:**
- Modify: `apps/api/src/modules/documents/document-requests.service.ts`, `documents/documents.service.ts` (upload), `packages/api-contracts/src/contracts/document-requests.contract.ts`, `packages/api-contracts/src/schemas/document-request.schema.ts`, `packages/database/src/customer-message{,-mr,-hi,-words}.ts`, `apps/web/src/features/documents/requests/*` (row action), `apps/web/messages/en-IN/documents.json`, `apps/customer/src/features/documents/requested-section.tsx`, `apps/customer/src/copy/*/money.ts` (`requestMeta` uses home), `docs/whatsapp-templates.md`

**Interfaces:**
- Duplicate check: person categories per customer; others per project.
- SMS / app inbox words for `paper_request` (en): title `Please send your <paper>`, body `For your solar at <home>. Send it from the OneOhm app, or give it to our team.` (mr, hi alongside).
- Ask again saves the staff note in `document_requests.note`, so the app shows it on the request.
- Template choice: `paperRequestTemplate(db): Promise<'paper_request' | 'document_requested'>` — `paper_request` when its `message_templates.active` is true. Payload adds `home` = `homeLabel`.
- New route `reaskDocumentRequest`: `POST /document-requests/:id/reask`, body `{ note: string (2..300) }` → request `open`, `documentId` null, `receivedAt` null; paper taken off (`removedAt`, `removedByUserId`); customer message again (dedupe key `document_requested:<id>:reask:<n>`); note saved on the request; log + audit `document_request.reasked`.
- Cancel: also `noticeCustomer` with template key `document_request_cancelled` (app inbox words only: title `<paper> is no longer needed`, body `You do not need to send it.`) and a WhatsApp session text when the chat window is open.
- Staff upload (`DocumentsService.upload`): when an open request on the same project has the same category (or same customer for person categories), mark it received with this document, log, notify the customer (`document_received_by_team` app inbox words: `We have your <paper> for <home>. Thank you.`).
- `customerDocumentRequestSchema` and `documentRequestSchema` gain `homeName: z.string().nullable()`.

- [ ] **Step 1: Failing tests** (57): `bill can be asked for each home` (two open bill requests, two projects); `cancel tells the customer` (app notice row); `ask again reopens and messages` (outbox row for the customer, request open, old paper removed); `staff upload closes the open request`; `uses paper_request once it is active` (set `active=true` → outbox template `paper_request` with `home`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (web: "Ask again" item on a received request row, with a note field; customer app: `requestMeta(request.homeName ?? request.projectCode, …)`). **Step 4:** Run 12, 15, 57 + web/customer typecheck → PASS.
- [ ] **Step 5:** Commit `feat(documents): requests per home, ask again, cancel tells the customer`.

### Task 8: Move / change kind

**Files:** `packages/api-contracts/src/contracts/documents.contract.ts`, `packages/api-contracts/src/schemas/document.schema.ts`, `apps/api/src/modules/documents/documents.service.ts`, `documents.controller.ts`, `apps/web/src/features/documents/gallery/preview-sheet.tsx` (+ a small `move-sheet.tsx`), `apps/web/messages/en-IN/documents.json`

**Interfaces:**
- Route `moveDocument`: `PATCH /documents/:id`, body `{ projectId: id | null, category: DocumentCategory }`, needs `documents.upload`. Same customer only (project's customer must equal the document's customer) → 409 otherwise. Sets `propertyId` from the project (null for person categories with `projectId` null). Log lines on old and new project (`Paper moved: <name> → <project code>`), audit `document.moved`. If the document answered a request whose project or category no longer matches, that request is re-asked (Task 7's reask, note `Filed on another home`).
- Web: "Move / change kind" button in the preview sheet; sheet with the customer's homes (`customerHomes` via existing projects list for the customer) and kind select.

- [ ] **Step 1: Failing tests** (57): `move reopens request`; `move to another customer is refused`; `checklist follows the move` (home A missing, home B present).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run 12, 57 + web typecheck → PASS.
- [ ] **Step 5:** Commit `feat(documents): move a paper to another home or kind`.

### Task 9: Reminders and "to sort" alerts

**Files:** Create `apps/worker/src/activities/paper-reminders.ts`, `paper-reminders.test.ts`; Modify `apps/worker/src/activities/timed-reminders.ts` (call it each tick like `queueChatReminders`).

**Interfaces:** `queuePaperReminders(db: Database, now: Date): Promise<number>`:
- Open requests older than 2 days → customer message again via `queueCustomerMessage` (same template choice as Task 7), dedupe `paper_reminder:<id>`.
- Open requests older than 4 days → `notify` the requester (else project manager): `Still waiting for <paper> from <customer>`, dedupe `paper_waiting:<id>`.
- WhatsApp documents with `customer_id` set, `project_id` and `property_id` null, site category, linked from `wa_messages.document_id`, older than 2 hours, customer with 2+ homes → `tellChatTeam` `Files to sort from <name>`, dedupe `paper_sort:<documentId>`.

- [ ] **Step 1: Failing unit test** for the pure age rule `paperReminderDue(createdAt, now): 'customer' | 'team' | null` (47 h → null, 49 h → customer, 97 h → team). **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** acceptance (57) `an old request reminds the customer once` (backdate `created_at`, run the worker job through its test hook as `39-onboarding-nudge` does) → PASS.
- [ ] **Step 5:** Commit `feat(worker): paper reminders and files-to-sort alerts`.

### Task 10: Alerts that were missing

**Files:** `apps/api/src/modules/whatsapp/whatsapp-events.ts` (+ test), `whatsapp-webhook.controller.ts`, `assistant/assistant.service.ts`, `packages/database/src/chat-team.ts` (`tellChatFileFailed` → `tellChatSendFailed`), callers in `apps/api/src/modules/whatsapp/deliveries.service.ts` and `apps/worker/src/activities/delivery.activities.ts`, `packages/domain/src/documents/file-type.ts` (+ test), `apps/api/src/modules/documents/upload-file.ts` (`EXTENSION`)

**Interfaces:**
- `readMessage` turns `location` into kind `other`, text `📍 Location: <name/address> https://maps.google.com/?q=<lat>,<lng>`; `contacts` into `👤 Contact: <formatted_name> <phone>`; `sticker` into `Sticker`. The assistant passes `other` messages to the chat's person (`passToOwner`) instead of "not understood".
- `tellChatSendFailed(db, outboxId)`: any failed `whatsapp` outbox row to a number with a chat alerts the chat team once (dedupe `wa_send_failed:<outboxId>`); file rows keep their current words; rows that fall back to SMS (`isNotOnWhatsApp`) do not alert.
- `detectFileType` recognises `.docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) and `.xlsx` (`…spreadsheetml.sheet`) by ZIP magic + `word/` / `xl/` entry name; both added to `ACCEPTED_FILE_TYPES`; bubble and gallery show them as file links.

- [ ] **Step 1: Failing tests:** `whatsapp-events.test.ts` (location, contacts, sticker text); `file-type.test.ts` (docx, xlsx bytes from a tiny fixture built in the test); acceptance (57) `a location pin alerts the person` and `a failed reply alerts the person`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Run unit + 44, 47, 56, 57 → PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): no silent location, contact or failed message`.

### Task 11: Chat label and final checks

**Files:** `packages/api-contracts/src/schemas/whatsapp.schema.ts` (`chatFileSchema` gains `filedAs: z.string().nullable()` — e.g. `Electricity bill · Pune`, null = to sort), `whatsapp/chats.service.ts`, `crm/customer-messages.read.ts`, `apps/web/src/features/service/whatsapp/message-bubble.tsx`, `apps/web/messages/en-IN/service.json`, `docs/whatsapp-templates.md`

- [ ] **Step 1:** Bubble shows `Filed: <filedAs>` or `To sort` under the file (type-label, ink-faint). Acceptance (57) `chat shows where a file was filed`.
- [ ] **Step 2:** Add `paper_request` (en, mr, hi) to `docs/whatsapp-templates.md` with examples `Ramesh Patil · latest electricity bill · Farm, Sangli (OH-2026-013)`, and the switch-over steps from the spec E.3.
- [ ] **Step 3: Full verification.** `pnpm turbo run typecheck`, `npx biome check` on changed files, `pnpm --filter @oneohm/api test`, `pnpm --filter @oneohm/domain test`, `pnpm test:acceptance` (all) → all PASS.
- [ ] **Step 4: Live check** on the dev API (port 4200): from the owner's phone send a photo and a PDF; confirm labels in the chat, Documents on the right home, project log lines, one alert each.
- [ ] **Step 5:** Go-live count for the owner: `SELECT count(*) FROM (SELECT customer_id FROM projects WHERE status <> 'cancelled' GROUP BY customer_id HAVING count(DISTINCT property_id) > 1) x;` and the list of site-category papers with no home for those customers.
- [ ] **Step 6:** Commit `feat(whatsapp): chat shows where each file was filed`.
