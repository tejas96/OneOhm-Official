# WhatsApp chat placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move staff WhatsApp chats from Service → WhatsApp to Today and the customer/lead records, with clear owners and six edge-case fixes.

**Architecture:** The API keeps one chat per phone (`wa_conversations`) with `assigned_user_id` as its owner. New pure rules live in `packages/domain` (working-hours clock, who answers) so the API and worker share them. The web reuses the existing inbox components (`features/service/whatsapp/*`) in new places; no new menu item.

**Tech Stack:** NestJS + ts-rest + drizzle (API), Temporal worker, Next.js + next-intl (web), Expo (field, unchanged), vitest, biome.

**Spec:** `docs/superpowers/specs/2026-11-02-whatsapp-chat-placement-design.md`

## Global Constraints

- No new main-menu item. Chats appear in Today, customer page, lead page, project card, command centre.
- Working hours for reminders, "late" and the night reply: 09:30–18:30 business time zone (final review ruling: match the hours customers are told); "late" = over 120 working minutes (same clock as `chatReminderStage`).
- Customer-facing words in English, Marathi, Hindi (assistant `words*.ts`); staff words English (`apps/web/messages/en-IN`).
- Old links `/service?tab=whatsapp&chat=<id>` keep working (redirect to `/today?tab=chats&chat=<id>`).
- No commits until the owner says so (skip every "Commit" step; keep the working copy).
- Do not touch files another session changed: `apps/web/src/features/shell/*` except one-line link edits, `packages/design-system/src/web/overlays/popover.tsx`, `apps/web/messages/en-IN/common.json`.

## Review Focus

1. A family member's number writes → must open the customer's chat, owner = that customer's owner (Task 2 test).
2. Owner on approved leave today → alerts go to the leave's `backupUserId`; no backup → `service.manage` desk (Task 1 test).
3. Customer free text within 24 h of our template, e.g. "I paid yesterday" → handed to owner with the warm line, never "did not get that" (Task 4 test).
4. Second message at night → no second night reply that night (Task 4 test).
5. Lead page for a phone with no chat yet → shows "Start chat", does not create empty chats on view (Task 6 check).

---

### Task 1: Shared rules — working clock and who answers

**Files:**
- Create: `packages/domain/src/messaging/chat-rules.ts`, `packages/domain/src/messaging/chat-rules.test.ts`
- Modify: `packages/domain/src/messaging/index.ts` (export), `apps/worker/src/activities/chat-reminders.ts` (use the shared clock, delete local copies)

**Interfaces:**
- Produces:
  - `WORK_START_HOUR = 9`, `WORK_END_HOUR = 20`, `FIRST_NUDGE_MIN = 30`, `LATE_MIN = 120`
  - `isWorkingTime(now: Date, timeZone: string): boolean`
  - `chatWaitStage(lastInAt: Date, now: Date, timeZone: string): 1 | 2 | null` (moved from worker `chatReminderStage`, same behaviour)
  - `pickAnswerer(input: { owner: string | null; ownerActive: boolean; backupToday: string | null }): string | null` — owner when active and not away; else backup; else null (desk)

- [ ] Step 1: Move the three existing worker tests to `chat-rules.test.ts` (rename function), add `isWorkingTime` cases (08:59 false, 09:00 true, 19:59 true, 20:00 false IST) and `pickAnswerer` cases: `{owner:'a',ownerActive:true,backupToday:null}`→`'a'`; `{owner:'a',ownerActive:false,backupToday:'b'}`→`'b'`; `{owner:'a',ownerActive:false,backupToday:null}`→`null`; `{owner:null,…}`→`null`.
- [ ] Step 2: `pnpm --filter @oneohm/domain exec vitest run src/messaging/chat-rules.test.ts` → FAIL (missing module).
- [ ] Step 3: Implement; worker imports `chatWaitStage` from `@oneohm/domain`. Clock helper may copy `businessClock` logic (domain must not import worker).
- [ ] Step 4: Domain and worker tests PASS.

### Task 2: API — owners, family numbers, away owners, pass-to, late flag

**Files:**
- Modify: `apps/api/src/modules/whatsapp/chat-owner.ts`, `chat-store.ts` (`conversationFor`, `conversationForPhone`), `chats.service.ts`, `whatsapp.controller.ts`, `assistant/assistant.service.ts` (stranger hand-over capability)
- Modify: `packages/api-contracts/src/schemas/whatsapp.schema.ts`, `contracts/whatsapp.contract.ts`
- Create: `apps/api/src/modules/whatsapp/chat-owner.test.ts` (pure parts)

**Interfaces:**
- Consumes: `pickAnswerer`, `chatWaitStage` (Task 1).
- Produces:
  - `customerForPhone(db, phone): Promise<{ id: string; name: string } | null>` — `customers.phone_e164`, else a non-revoked `customer_contacts.phone_e164`.
  - `answererFor(db, userId: string | null, today: string): Promise<string | null>` — loads `users.status`, `users.on_leave`, today's approved `leave_requests` → `pickAnswerer`.
  - `tellChatTeam` sends to `answererFor(...)` of handled-by and assigned; null → `service.manage`.
  - Stranger hand-over capability `'leads.manage'` (was `'service.manage'`).
  - `ChatSummary` gains `late: boolean` (needsReply and `chatWaitStage(lastInboundAt) === 2`).
  - Contract `assign`: `POST /whatsapp/chats/:id/assign` body `{ userId: idSchema }` → 200 `chatSummarySchema`; desk or current owner/handler only; target must be active staff; notifies target (`kind: 'whatsapp_passed'`, subject chat).
  - Contract `byPhone`: `GET /whatsapp/chats/by-phone?phone=` → 200 `chatDetailSchema.nullable()`; never creates a chat.

- [ ] Step 1: Tests in `chat-owner.test.ts` for a pure `familyOrCustomer(rows)` chooser if extracted; otherwise rely on Task 1 tests and verify by the live check in Task 8.
- [ ] Step 2: Implement; `conversationFor`/`conversationForPhone` use `customerForPhone`.
- [ ] Step 3: `pnpm --filter @oneohm/api exec tsc -p tsconfig.json --noEmit` and `vitest run src/modules/whatsapp` PASS.

### Task 3: API — move chats when owners change

**Files:**
- Modify: `apps/api/src/modules/projects/project-team.service.ts` (`update`, after manager change), `project-creation.service.ts` (after insert), `apps/api/src/modules/workforce/leave-handover.ts` (`handOverWork`)
- Modify: `apps/api/src/modules/whatsapp/chat-owner.ts`

**Interfaces:**
- Produces: `moveCustomerChats(db, customerId: string, toUserId: string): Promise<number>` — sets `assigned_user_id` on that customer's chats unless a staff `out` message was sent in the last 24 h by someone else; returns moved count.
- Produces: `moveChatsOf(db, fromUserId: string, toUserId: string)` — for leave hand-over, moves chats where `assigned_user_id = from`.

- [ ] Step 1: Implement and call: manager set/changed → `moveCustomerChats(project.customerId, managerUserId)`; leave approved with backup → `moveChatsOf(leave.userId, backupId)`.
- [ ] Step 2: Typecheck + existing API tests PASS.

### Task 4: Assistant — reply to our update, night reply

**Files:**
- Modify: `apps/api/src/modules/whatsapp/assistant/assistant.service.ts`, `words.ts`, `words-mr.ts`, `words-hi.ts`, `words.test.ts`, `whatsapp-webhook.controller.ts`
- Modify: business settings for `whatsappNightReply` (find the settings registry used by `readBusinessSetting`; add a boolean default `true`; add the toggle to the web Settings → WhatsApp messages panel)

**Interfaces:**
- Produces words: `WORDS.passedToOwner(name: string)` (en "Thank you. {name} will reply to you here."), `WORDS.nightReply(name: string)` (en "Thank you. We reply from 9:30 am to 6:30 pm. Your message is with {name}."). `name` falls back to the brand team name.
- Rule A: in `answer()`, before "not understood": if incoming is free text, not a menu choice, and the chat's latest `out` message of kind `template` is under 24 h old → `handOver` with `WORDS.passedToOwner`.
- Rule B: in the webhook, for a `human` chat outside `isWorkingTime`, queue `WORDS.nightReply` once per night (skip if an `out` message with that exact text exists since the last `WORK_END_HOUR`).

- [ ] Step 1: Add words tests: three languages present, `passedToOwner('Asha')` contains `Asha` in each.
- [ ] Step 2: Implement both rules; tests PASS.

### Task 5: Web — Today → Chats, Service tab removed, links redirected

**Files:**
- Modify: `apps/web/src/features/today/today-view.tsx`, `apps/web/messages/en-IN/today.json` (or the namespace it uses), `apps/web/src/features/service/service-view.tsx`, `apps/web/src/features/service/whatsapp/whatsapp-inbox.tsx`, `open-chat-button.tsx`, `apps/web/src/features/shell/alerts-bell.tsx` (one line), customer conversations link
- Create: redirect in `service-view.tsx`: `tab=whatsapp` → `router.replace('/today?tab=chats' + (chat ? '&chat=' + chat : ''))`

**Interfaces:**
- Today `View = 'work' | 'approvals' | 'chats'`; Chats tab shown when `useChats().data.length > 0`; count = chats with `needsReply`.
- Inbox filters: everyone `all | reply`; desk adds `mine | unassigned | late`. `?filter=` read from the URL so the command centre can link to `late`.
- Conversation header gains "Pass to…" using `AssignDialog`-style person list (`api.people.listPeople()`), calling `assign`.

- [ ] Step 1: Implement; `pnpm --filter @oneohm/web exec tsc --noEmit` PASS; web tests PASS.

### Task 6: Web — reply on customer and lead pages, project card

**Files:**
- Modify: `apps/web/src/features/customers/customer-conversations-tab.tsx` (replace read-only `ChatCard` with `Conversation` in a card; no back button)
- Create: `apps/web/src/features/leads/lead-chat-card.tsx` (main column under the timeline); `apps/web/src/features/projects/control-room/overview/customer-chat-card.tsx` (side column after `TeamPanel`)
- Modify: `lead-detail-view.tsx`, `overview-tab.tsx`, `use-whatsapp.ts` (`useChatByPhone(phone)`)

**Interfaces:**
- Lead card: `useChatByPhone(lead.phone)`; null → quiet "No WhatsApp chat yet" + `OpenChatButton` ("Start chat"); else the conversation with reply.
- Project card: `useChatByPhone(customer.phone)`; render only when `chat.needsReply`; text "Customer chat · Needs a reply", button → `/customers/{customerId}?tab=conversations`.

- [ ] Step 1: Implement; typecheck PASS.

### Task 7: Command centre — customers waiting over 2 hours

**Files:**
- Modify: `apps/api/src/modules/dashboard/command-center.service.ts`, `packages/api-contracts/src/schemas/dashboard.schema.ts` (`kpis.chatsWaiting: z.number().int()`), `apps/web/src/features/command-center/center-kpis.tsx`

**Interfaces:**
- `chatsWaiting` = chats in state `human` whose latest message is `in` and `chatWaitStage(...) === 2`; tile links `/today?tab=chats&filter=late`.

- [ ] Step 1: Implement; typecheck + tests PASS.

### Task 8: Checks and live test

- [ ] `pnpm exec biome check .`, `pnpm turbo run typecheck test` → all PASS.
- [ ] Rebuild API/worker, restart; browser: Today → Chats (admin and Asha), customer page reply, lead page chat/start, project card, command centre tile, Service has no WhatsApp tab, old link redirects, Pass to….
- [ ] Phone: reply to an update ("I paid yesterday") → warm hand-over; family number (temporary test row) → customer chat.
- [ ] Restore all test data.
