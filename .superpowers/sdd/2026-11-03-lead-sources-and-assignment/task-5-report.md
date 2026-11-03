# Task 5 report: capture attribution

Implemented
- domain `findCampaignCode` (+test); contract gains utmSource/utmMedium/utmCampaign/campaignCode (max 100); website lead writes them plus landingPage = sourcePage (code uppercased).
- `IntakeInput.attribution`, spread into the lead only in `insert()`; the nudge path in `receive()` never writes it (first touch).
- `Incoming.referral` (sourceId, sourceUrl, headline) read in `readMessage`.
- New `whatsapp/assistant/entry-capture.ts`: `captureEntry` (first attribution on a chat with no customer wins; saved in `wa_conversations.context.entry`), `savedEntry`, `clearEntry` (after a lead is made).
- `chat-store.setState` now keeps an existing `entry` key when the new context lacks one (it used to replace the whole context, which restart/menu would have wiped).
- `assistant.service`: `handle` captures first; a stranger's "Hi OneOhm CODE" counts as a greeting (shows the stranger buttons). 224 lines.
- `stranger-flow` callBack and referredFriend pass the entry; `CustomerPortalService.refer/referByCode` accept `attribution`.
- `sendInbound` takes optional Meta `referral`.

Tests
- Unit: campaign-code (2), whatsapp-events (+1, 8 total) pass.
- Acceptance 30: 16/16 (5 in 30-lead-attribution: UTM, ad referral, code, second code no overwrite, unknown code). Full acceptance: 209/209.
- `pnpm check` green (1 pre-existing complexity warning in projects/finance.service.ts, not ours).
- TDD: tests and implementation were written together; no separate RED run was captured.

Notes
- Website scenario uses 1 post. Referral-code path (referredFriend) passes the entry but has no acceptance test.
- An entry is captured from any later message too if none was saved yet (not only the very first).

## Fix round 1
- captureEntry now takes LeadIntakeService and skips when `openLeadByPhone(chat.phone)` finds an open lead (AssistantService injects the intake). Scenario 30 asserts the chat context has no `entry` after the OTHER-9 message.
- `keepEntry` exported from chat-store; staff `release()` uses `context: keepEntry({})`. New scenario test: ad referral -> "Talk to a person" -> admin POST /whatsapp/chats/:id/release -> call-back -> lead has the ad.
- Ran: `pnpm test:acceptance 30` 17/17; full acceptance 34 files, 211/211; `pnpm check` green (same one old warning in finance.service.ts).
