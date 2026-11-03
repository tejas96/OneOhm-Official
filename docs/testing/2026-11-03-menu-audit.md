# WhatsApp menu and tap audit — 3 Nov 2026

A read-only audit of every menu row, button and list tap the OneOhm WhatsApp bot sends,
checked against the product rules:

- the customer only taps and never needs to type keywords;
- every message ends with a way forward (taps);
- nothing is silent: an unknown or failed input reaches a person or gets a helpful answer;
- the words come in English, Marathi and Hindi;
- the WhatsApp limits hold (≤3 buttons, button ≤20, list ≤10 rows, row title ≤24, row description ≤72);
- session messages go only inside the 24-hour window.

No code was changed. Unit tests run: `pnpm --filter @oneohm/api exec vitest run src/modules/whatsapp`
gave **19 files, 87 tests, all passed**. Acceptance tests were not run; they are cited by name only.

**Scope:** 73 tap ids plus 8 typed or file inputs, so 81 paths. Each was checked against the 12 edge cases.
**Result:** 4 High, 13 Medium and 20 Low findings. They are listed at the end.

Paths below are short forms:

- `A/…` means `apps/api/src/modules/whatsapp/assistant/…`
- `O/…` means `apps/api/src/modules/whatsapp/onboarding/…`
- `T/…` means `apps/api/test/acceptance/scenarios/…`

---

## 1. How a message is routed (for reading the matrix)

1. `whatsapp-webhook.controller.ts:85-101`: the chat is upserted and the message is logged. A tap the bot answers is marked `assistant_tap` (`A/handled-taps.ts:18-27`). A late tap is dropped (`inbound-retry.ts:12-15`): this means a tap sent *before* a newer message, not a tap on an old button.
2. `whatsapp-webhook.controller.ts:119-122`: if a person holds the chat (`state='human'`) and the bot does not own the tap, staff are alerted and a night reply may go out.
3. `A/assistant.service.ts:68-80`: STOP/START comes first, then quote taps (these work in any state), then `answer()`.
4. `A/assistant.service.ts:82-109` runs these checks in order:
   1. hello or Menu → restart (this also drops a person's hold);
   2. human hold → quiet unless it is the bot's tap;
   3. stranger → `StrangerFlowService`;
   4. typed "Talk to a person" opener;
   5. file;
   6. reply to a business template within 24 h → owner;
   7. `await_problem`;
   8. `await_referral`;
   9. `await_comment`;
   10. `rate:N`;
   11. menu choice;
   12. otherwise paper tap or "Sorry" + menu.

`assistantAnswersTap` returns true only for:

- `menu`
- `start`
- `quote_accept|quote_yes|quote_ask:<uuid>`
- the 10 menu row ids and `paper:*`, and only when the chat is linked to a customer.

It returns false for:

- `rate:*`
- `callback`
- every `ob:*`
- any tap from a stranger except menu, start and quote taps.

---

## 2. Every tap id: sent vs received

The ids were grepped both ways: every `id:` the bot puts on a button or row, and every place an incoming `choiceId` is read.

| Tap id | Sent by (file:line) | Received by (file:line) | Bot-handled (`assistantAnswersTap`) | Reply ends with taps |
|---|---|---|---|---|
| `progress` (row, "Track my project") | `A/words.ts:10`, `A/closing-taps.ts:55` | `A/assistant.service.ts:136-137` | Yes (customer) | Yes: Menu · Pay now · Talk to us (Menu · Talk with no project) |
| `payments` (row, "Pay now") | `A/words.ts:11`, `A/closing-taps.ts:54` | `A/assistant.service.ts:138-146` | Yes | **No** when dues exist: the last message is a Pay-now link button (M3). Yes when nothing is due. |
| `documents` (row) | `A/words.ts:12` | `A/assistant.service.ts:147-148` → `A/paper-replies.ts:30-50` | Yes | Yes: list, or file + "What next?" Menu · Talk |
| `service` (row; media "Report a problem") | `A/words.ts:13`, `A/media-intake.ts:143` | `A/assistant.service.ts:153-155` | Yes | **No**: `askProblem` is plain text (M1) |
| `requests` (row; "My requests") | `A/words.ts:14`, `A/closing-taps.ts:58` | `A/assistant.service.ts:149-150` | Yes | Yes: Menu · Talk |
| `warranty` (row) | `A/words.ts:15` | `A/assistant.service.ts:151-152` | Yes | Yes: Menu · Talk |
| `refer` (row) | `A/words.ts:16` | `A/assistant.service.ts:156-158`, then `:199-212` | Yes | **No**: `askReferral` is plain text (M1); the saved/known reply has Menu |
| `rewards` (row) | `A/words.ts:17` | `A/assistant.service.ts:159-160` | Yes | Yes: Menu · Talk |
| `feedback` (row) | `A/words.ts:18` | `A/assistant.service.ts:161-162` → `A/feedback-flow.ts:25-34` | Yes | Yes: rating list, or Menu · Talk |
| `human` (row; "Talk to us"; media/stranger "Talk to a person") | `A/words.ts:19`, `A/closing-taps.ts:56`, `A/media-intake.ts:144`, `A/stranger-flow.ts:72,94` | `A/assistant.service.ts:163-164` → `A/hand-over.ts:60-88`; strangers `A/stranger-flow.ts:88` | Yes for customers; **No** for strangers | Yes: "A team member will reply…" + Menu |
| `menu` (closing tap; Documents "Back to menu") | `A/closing-taps.ts:53`, `A/paper-replies.ts:47` | `A/assistant.service.ts:30,84` → `restart` `:169-178` | Yes (any chat) | Yes: menu list (strangers: onboarding question or Call me back · Talk) |
| `start` ("Start again") | `A/opt-out.ts:67`, `A/closing-taps.ts:59` | `A/opt-out.ts:39-42,49-71`; else a hello `A/assistant.service.ts:29` | Yes (any chat) | Yes: "Welcome back" + Menu |
| `paper:receipt:<paymentId>` ("View receipt") | `projects/receipt-message.ts:96` | `A/assistant.service.ts:113` → `A/paper-replies.ts:53-56` | Yes | Yes: file + Menu · Talk, or the list again (M12) |
| `paper:quotation\|receipt\|invoice\|report\|document:<id>[:key]` | `A/customer-papers.ts:47-48,98-148` | same as above | Yes | Yes |
| `rate:1`…`rate:5` | `A/words.ts:90-94` | `A/assistant.service.ts:104-105` → `A/feedback-flow.ts:36-45` | **No** (H3) | Yes: "Anything to add?" + Menu |
| `quote_accept:<uuid>` | `quotations/quotation-message.ts:44,116` | `A/quote-actions.ts:26-33,60-80` | Yes | Yes: Yes, accept · Not yet; **silent** if already accepted (H4) |
| `quote_yes:<uuid>` | `A/quote-actions.ts:76` | `A/quote-actions.ts:82-94` | Yes | Yes the first time; **silent** after that (H4) |
| `quote_ask:<uuid>` ("I have a question", "Not yet") | `quotation-message.ts:45,117`, `A/quote-actions.ts:77` | `A/quote-actions.ts:49` → `passToOwner` | Yes | **No**: plain "X will reply to you here" (M2) |
| `callback` (stranger "Call me back") | `A/stranger-flow.ts:93` | `A/stranger-flow.ts:87,127-140`; onboarding `O/onboarding-turn.ts:48` | **No** | **No**: `callbackNoted` is plain text (M4) |
| `ob:language:en\|mr\|hi` | `O/onboarding-replies.ts:67-70` | `O/onboarding-flow.ts:112-149` (via domain `parseAnswer`) | No | Yes: next question |
| `ob:name:yes`, `ob:name:change` | `O/onboarding-replies.ts:79-80` | `O/onboarding-answer.ts:52-67` | No | Yes |
| `ob:city:<city>`, `ob:city:other` | `O/onboarding-replies.ts:89-90` | `O/onboarding-answer.ts:42-49` | No | Yes |
| `ob:site:*` (4), `ob:bill:<band>` (2-8), `ob:roof:*` (3), `ob:floors:1\|2\|3` | `O/onboarding-replies.ts:93-115` | `O/onboarding-flow.ts:131-148` | No | Yes |
| `ob:<step>:back` (city, site, bill, roof, floors, photo) | `O/onboarding-replies.ts:47,55,60,120` | `O/onboarding-turn.ts:44-46,82-86` | No | Yes: the question before |
| `ob:photo:later` | `O/onboarding-replies.ts:120` | domain `steps.ts:178-180` | No | Yes |
| `ob:person` | `O/onboarding-replies.ts:46`, `O/estimate-next-steps.ts:110,132`, nudges `:214` | `O/onboarding-turn.ts:48-51` → `O/onboarding-flow.ts:205-220` | No | **No**: passToOwner plain text (M2) |
| `ob:done:call`, `ob:done:notnow`, `ob:done:later:1w\|1m\|3m` | `O/onboarding-replies.ts:128-130,143-148`, `O/estimate-next-steps.ts:131` | `O/estimate-next-steps.ts:73-136` | No | Yes |
| `ob:continue` (nudge) | `O/onboarding-nudges.service.ts:213` | `O/onboarding-flow.ts:129` (asks the current question) | No | Yes |

**Two-way check.** Every id that is sent has a receiver. No receiver waits for an id that is never sent.

`documents` as a plain `receipt` tap (TAP_IDS `receipt → documents`) is wired but never sent without an id. That is harmless.

Three receivers can be reached but are wrong in some states:

- every tap in `await_problem` (H1);
- every tap in `await_referral` (H2);
- `rate:*` while a person holds the chat (H3).

---

## 3. WhatsApp limits in all three languages

The lengths were computed with a script that imports the live word lists (`words*.ts`,
`closing-taps.ts`, `paper-words.ts`, `onboard-words.ts`, `quote-money-words.ts`, and the default bill bands).
It counted Unicode code points for 96 strings per language (288 in all). **Nothing is over a limit.**

The tightest strings:

| String | en | mr | hi | Limit |
|---|---|---|---|---|
| Receipt row "Receipt · 1st instalment" (`A/paper-words.ts:23`, uses `fit()`) | 24 | 19 | — | 24 row |
| Receipt row "last instalment" | 23 | 20 | — | 24 row |
| Onboarding "Talk to a person" button | 16 | 14 | **19** ("व्यक्ति से बात करें") | 20 button |
| "Start again" | 11 | 15 | 16 | 20 button |
| "Accept quote" | 12 | 15 | 16 | 20 button |
| "I have a question" | 17 | 14 | — | 20 button |
| "Track my project" | 16 | 12 | — | 20 button |
| Longest menu row description | 28 | 30 | — | 72 |
| Longest menu row title | 16 | 17 | — | 24 |

Strings built at run time:

- Lists: the menu has 10 rows; Documents has at most 9 papers + Back (`A/paper-replies.ts:14`); ratings have 5; "Not now" has 3 + person.
- Onboarding city list: 7 cities + Other + Back + person = 10 (`packages/domain/src/onboarding/settings.ts:39-43`).
- Bill bands: 8 + Back + person = 10.
- City and band titles are checked against 24 when settings are saved (`settings.ts:120-123`).
- Paper titles go through `fit()` (24); descriptions are cut to 72 (`A/paper-replies.ts:45`).
- The list section heading (the brand, up to 80 characters) is cut to 24 by the worker (`apps/worker/src/channels/whatsapp-cloud.ts:162`).
- A body over 1024 is split into text plus a "What next?" buttons message (`A/closing-taps.ts:79-83`).

**24-hour window.** Every bot message is a reply, so the window is open when it is sent. The quote and receipt follow-ups check `chatWindowOpen` and opt-out first:

- `quotation-message.ts:78`
- `receipt-message.ts:84`

The nudge waits at most 22 h. The worker refuses a session message once the window has closed, and alerts staff (`delivery.activities.ts:222-226`).

---

## 4. Customer menu: edge-case matrix

Each cell is **OK** (correct, ends with taps), a finding id, or **n/a**. "Human" means a person holds the chat. "Typed-wait" means the customer typed text while the bot waited for a tap.

| Row (handler) | No project | 2+ projects | Completed / cancelled | Nothing to show | All paid | Human | Opted out | Stale tap | Family number | Typed-wait | Abandoned flow → Menu | en / mr / hi |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Project progress `A/assistant.service.ts:136`, `A/answers.service.ts:30-67` | OK: "no project yet" + Menu · Talk | OK: one block per home | M8 (completed says "Now: Subsidy"); M7 (cancelled is hidden, but Pay now is still offered) | n/a | L1 (Pay now still offered) | OK: answered, hold kept | OK, L12 | OK: always live data | OK: customer's data | H1 / H2 if mid-flow | OK | OK; M9 ("inspected" subsidy line missing in all 3) |
| Payments `:138-146`, `A/payments-answer.ts`, `A/pay-buttons.ts` | OK: Menu · Talk | OK: per home, one Pay now per due | M7 (cancelled dues listed with Pay now; the pay page refuses them) | L8 (home with no milestones shows only its heading) | L1 (no "Everything is paid" line) | OK (T/47) | OK | OK: recomputed | OK | H1 / H2 | OK | OK; M3 (no Menu after Pay now) |
| Documents `:147`, `A/paper-replies.ts:30-66` | OK: sent quotes listed, or "No documents yet" + Menu · Talk | OK | OK (cancelled project's quote hidden) | OK | n/a | OK (paper taps are counted) | OK | OK when the paper is deleted (list again); M12 when older than the newest 3 | OK | H1 / H2 | OK | OK |
| Raise a complaint `:153-155`, `A/media-intake.ts:97-100`, `A/problem-flow.ts:44-76` | OK: raised with no project | M10 (always the newest home) | M7 (may file on a cancelled newest home) | n/a | n/a | M6 (tap ends the hold) | OK | OK | OK (filed under the customer) | Typed text is the complaint (by design); taps → H1 | OK via an old Menu tap; the prompt has none (M1) | OK; M1 (tooShort has no taps) |
| My requests `:149-150`, `A/answers.service.ts:90-100` | OK: "no service requests" + Menu · Talk | OK | OK | OK | n/a | OK | OK | OK | OK | H1 / H2 | OK | OK; L4 |
| Warranty and AMC `:151-152`, `A/cover-answer.ts:54-72` | OK | OK: per home | OK completed; M7 cancelled listed | OK: "starts on switch-on", "AMC: none yet" | n/a | OK | OK | OK | OK | H1 / H2 | OK | OK; L3 |
| Refer a friend `:156-158,199-212` | OK | OK | OK | n/a | n/a | M6 (tap ends the hold) | OK | OK | OK (credited to the customer) | Typed text is the friend (by design); taps → H2 | OK via an old Menu tap; the prompt has none (M1) | OK; L16 |
| My rewards `:159-160`, `A/rewards-answer.ts` | OK | OK | OK | OK: "not referred anyone" (L2) | n/a | OK | OK | OK | OK | H1 / H2 | OK | OK |
| Give a rating `:161-162`, `A/feedback-flow.ts` | OK: "no project" + Menu · Talk | OK: newest live home not yet rated | OK; before switch-on says "we will ask later" + Menu · Talk | n/a | n/a | **H3** (list sent, rate taps ignored) | OK | OK: a re-rate updates the same row | OK (saved as the customer's) | Comment step: typed text is the comment (by design); typing "5" at the list → L6 | OK: "Anything to add?" has Menu | OK; L5 |
| Talk to a person `:163-164`, `A/hand-over.ts:60-88` | OK | OK | OK | n/a | n/a | OK: re-alerts once per message | OK | OK | OK | H1 / H2 (the tap becomes complaint/friend text) | OK | OK |

### Closing taps and other customer taps

| Tap | Handler | Edge cases |
|---|---|---|
| Menu | `A/assistant.service.ts:84,169-197` | OK in every state. It clears `await_*` and a person's hold. That is right for a tap; M5 covers the same done by typing "hi". |
| Pay now / Track my project / Talk to us / My requests | as their rows | Same as the matching row above. Always live data, so a stale tap is fine. |
| Start again | `A/opt-out.ts:49-71` | Opted out → "Welcome back" + Menu. Not opted out → a hello → menu. OK. |
| View receipt `paper:receipt:<id>` | `A/paper-replies.ts:53-56` | Deleted → list or "No documents". Older than the 3 newest receipts → a list without it (M12). Human: OK. |
| Paper rows | `A/paper-replies.ts:53-66` | Another customer's id is never found: lookup stays within this customer's own papers. OK. |
| `rate:N` | `A/feedback-flow.ts:36-45` | Human → H3; in `await_problem` → H1; in `await_referral` → H2; in `await_comment` → re-rates (OK). |
| `quote_accept` | `A/quote-actions.ts:60-80` | Human: works. Family: "only the customer's number" + owner (M2). Revised or closed quote: "changed" + owner (M2). Already accepted: **silent** (H4). |
| `quote_yes` | `A/quote-actions.ts:82-99` | The first tap accepts and thanks. Any later tap is **silent** because of the `quote_thanks:<id>` dedupe (H4). |
| `quote_ask` | `A/quote-actions.ts:49` | To the owner, with no taps (M2). |
| Media "Report a problem" / "Talk to a person" | `A/media-intake.ts:134-147` | OK; the waiting photos go into the complaint. |

---

## 5. Stranger and lead paths

| Path | Handler | Notes |
|---|---|---|
| "hi" / Menu | `A/stranger-flow.ts:79-83` | With onboarding on (or a chat already onboarding): the current question. Otherwise the buttons Call me back · Talk to a person. OK (T/33). |
| Call me back | `A/stranger-flow.ts:127-140` | A lead is made and the chat goes to a person. The reply is plain text (M4). If the chat is already held, there is no bot reply and staff are alerted (L18). |
| Talk to a person | `A/stranger-flow.ts:88` | "A team member will reply" + Menu. OK. |
| Typed text from a lead the team made | `A/stranger-flow.ts:45,86-97` | "This number is not linked to any of our customers yet" every time; it never reaches the lead's owner (M13). |
| Photo from a team-made lead | `A/stranger-flow.ts:53-76` | Filed on the lead. An unreadable file gets a "Talk to a person" button. A voice note or video goes to the owner. OK. |
| Referral code | `A/stranger-flow.ts:103-121` | Welcome text, then onboarding. If onboarding is off, the welcome has no taps (covered by M1/M4-type polish, L16). |

## 6. Onboarding paths

The onboarding code (`O/onboarding-flow.ts`) handles stale taps, two misses in a row (sent to a person), Back, a hold, a hand-back and two quick messages correctly. Tests: T/35, T/36, T/41, T/43-side-paths, T/49, T/42.

| Path | Handler | Edge cases |
|---|---|---|
| A tap on another step's list (stale) | `O/onboarding-flow.ts:129` | Asks the current question again. OK. |
| Typed text at a list | `O/onboarding-flow.ts:131-143` | Parsed; "not clear" once; a person after two misses. OK. |
| Back rows | `O/onboarding-turn.ts:44-46,82-86` | OK, including typed back words in all three languages. |
| `ob:person` / voice note / video | `O/onboarding-flow.ts:205-220` | To the owner with a summary. The reply has no taps (M2). |
| Held by a person | `O/onboarding-flow.ts:114` | Quiet; staff are alerted by the webhook. OK. |
| Estimate taps (`ob:done:*`) | `O/estimate-next-steps.ts:73-136` | Call me back is alerted once a day. Not now → when → thanks + taps. OK. |
| "hi" after the estimate | `O/onboarding-flow.ts:121,195-199` | Goes to a person instead of showing the estimate taps again (L14). |
| Bill bands in mr/hi | `O/onboarding-replies.ts:33-36` | The default bands have no `labelMr`/`labelHi`, so the rows read "Up to ₹1,000" in English (L7). |
| City list with a city named "Other" | `O/onboarding-replies.ts:89-90` | Its id `ob:city:Other` sits next to `ob:city:other`. Low risk (L20). |

## 7. Missing records: does any handler throw?

None throws on a missing record in normal use:

- A quote not found is caught (`A/quote-actions.ts:61-64`; `quotations.service.ts:179-182`).
- A paper not found shows the list again.
- A missing customer in `menu()` falls back to the stranger buttons (`A/assistant.service.ts:187`).
- A missing rating context saves "thank you" (`A/feedback-flow.ts:52-58`).
- A photo the request service refuses is caught (`A/problem-flow.ts:85-94`).

`portal.home` throws `notFound('Your account')` (`customer-portal.service.ts:54`). It is reachable only if a customer is deleted between the chat upsert and the answer.

Any unexpected throw is caught by the webhook: staff are alerted, the message is forgotten, and Meta retries (`whatsapp-webhook.controller.ts:96-114`). So nothing is silent, but replies queued before the throw are sent again on the retry (L15).

---

## 8. Test coverage per path

| Path | Automated test (file › name) |
|---|---|
| Project progress | T/49 › "C5: a customer types Marathi words and every answer ends with taps"; T/49 › "C5: a customer with no project gets only Menu and Talk to us" |
| Payments | T/28-whatsapp-quote-and-pay › "the Payments menu sends a Pay now button for each due amount"; T/47 › "a menu tap while a person has the chat is answered, alerts nobody and is not waiting"; T/49 (no project); T/42-sale step 9 |
| Documents and paper taps | T/50 › "Documents lists the papers, and a tap sends that PDF itself"; T/28-quote-and-pay › "sends a sent, not yet accepted quote as the file from Documents"; `A/paper-words.test.ts` › "names every paper in plain words that fit a list row, in every language", "reads a paper row tap, a report by its key too" |
| Raise a complaint | **none** (not end to end; `A/guess-category.test.ts` › "guesses the kind of problem"; `A/chat-memory.test.ts` for the photo memory only) |
| My requests | **none** |
| Warranty and AMC | `A/cover-answer.test.ts` (the text only), none end to end |
| Refer a friend | `A/guess-category.test.ts` › "reads a name and mobile number", none end to end |
| My rewards | `A/rewards-answer.test.ts` (the text only) |
| Give a rating / `rate:N` | `A/rating-rule.test.ts`; T/47 › "a tap the assistant does not answer while a person has the chat alerts and waits". This test **locks in H3**. |
| Talk to a person (customer row) | **none** for the customer row; T/32, T/33, T/36 for strangers |
| Menu | T/49 C5; T/45 › "STOP gets one reply and the flag; staff see it; START brings it back"; `A/handled-taps.test.ts` |
| Start again | T/45 › "the Start again tap starts the messages again, like typing START"; `A/opt-out.test.ts`; `A/closing-taps.test.ts` › "offers Start again after STOP, answered like typing START" |
| View receipt | T/50 › "a part payment gets its receipt and what is left; the full one gets the next step" (checks the ids only; the tap itself is never tested) |
| quote_accept / quote_yes | T/28-quote-and-pay › "asks to confirm, then accepts on yes", "accepts once when the yes arrives twice" (expects one thank-you, i.e. **locks in H4**), "refuses an old revision and hands over", "hands a family number to a person"; `A/quote-actions.test.ts` |
| quote_ask | `A/quote-actions.test.ts` (parsing only); **none** end to end |
| Stranger callback / human | T/33 › "a number with a lead made by staff gets the old buttons"; T/32 (attribution); T/36 › "the old call-back and person buttons hand an onboarding chat over" |
| Onboarding lists, Back, person | T/35 (all), T/36, T/41, T/43-side-paths, T/49 C10/C11/C12/C14; `O/onboarding-replies.test.ts`; `A/words.test.ts` › "fits WhatsApp's limits and offers a person on every question, in every language" |
| Late tap | T/44 › "a tap from an older message, arriving after a newer one, changes nothing" |
| A tap mid-flow (H1/H2), a hello while held (M5), cancelled projects (M7), 2+ projects in the menu | **none** |
| Button and row lengths | `A/words.test.ts` › "fits WhatsApp's limits in every language"; `A/closing-taps.test.ts` › "fits WhatsApp's 20-character buttons in every language" |

---

## 9. Findings

Severity:

- **High:** the customer is stuck, or gets a wrong or silent answer.
- **Medium:** the answer is awkward.
- **Low:** polish.

### High

| # | Finding | file:line | One-line fix |
|---|---|---|---|
| H1 | While the bot waits for a complaint (`await_problem`), **any tap** is taken as the complaint text, because a tap's `text` is the button title. Examples: a menu row, "Talk to us", a paper row, a rating. "Payments", "पेमेंट" or "Talk to us (via WhatsApp)" is raised as a service request, and the person the customer asked for is never reached. | `A/assistant.service.ts:96-97` (input from `whatsapp-events.ts:160`) | Only read `incoming.kind === 'text'` as the complaint; for a choice, reset the state to `menu` and handle the tap normally (as `await_comment` already does at `:99-103`). |
| H2 | While the bot waits for a referral (`await_referral`), **any tap** goes to `readReferral(title)`. The reply is "I could not find a name…" with no taps, and the chat stays stuck. A "Talk to a person" tap is lost. | `A/assistant.service.ts:98,199-201` | The same as H1: a choice leaves `await_referral` and is routed normally. |
| H3 | While a person holds the chat, the bot still answers "Give a rating" with the rating list. The `rate:N` taps it then gets are not bot taps, so the bot says nothing. The rating is not saved, and staff get an alert that only reads "Very happy". | `A/handled-taps.ts:22-26`, `A/assistant.service.ts:86`; locked in by T/47 › "a tap the assistant does not answer…" | Count `rate:[1-5]` as a bot tap in `assistantAnswersTap` (and update T/47). |
| H4 | A second "Yes, accept", or "Accept quote" on an already-accepted quote, gets **no reply at all**. `thank()` reuses the dedupe key `quote_thanks:<id>`, and the tap is marked as the bot's, so staff are not alerted either. | `A/quote-actions.ts:68,92-99` | Keep the dedupe key only for the moment of acceptance. An already-accepted quote gets a fresh "This quote is already accepted" + Menu · Talk. |

### Medium

| # | Finding | file:line | One-line fix |
|---|---|---|---|
| M1 | The flow prompts and retries have no taps: "Tell us the problem", "Send your friend's name and number", "Please write a few more words", "I could not find a name". To leave, the customer must find an old Menu button or type. | `A/assistant.service.ts:155,158,201`; `A/problem-flow.ts:53` | Send them with `sayWithTaps(…, ['menu', 'talk'])`. |
| M2 | Every `passToOwner` reply ("Thank you. X will reply to you here") is plain text with no Menu tap. This covers: quote question, quote refused, reply to an update, voice note or video, onboarding "Talk to a person". | `A/hand-over.ts:86-87` | Send a given `reply` with a Menu tap too (as `humanSoon` does). |
| M3 | Payments with dues ends on the last Pay-now link button, with no Menu or Talk tap. The part-payment message after a receipt is the same. | `A/assistant.service.ts:143-145`; `projects/receipt-message.ts:117-118` | Follow the Pay-now buttons with "What next?" + Menu · Talk to us. |
| M4 | A stranger's "Call me back" reply is plain text with no tap. | `A/stranger-flow.ts:139` | Use `sayWithTaps(…, ['menu'])`. |
| M5 | Typing a hello while a person holds the chat makes the bot take the chat back and send the menu. This covers "Hi", "नमस्कार" and "नमस्ते", the normal way to greet the staff member in Marathi. It happens after the staff alert and possibly a night reply that says "your message is with X". | `A/assistant.service.ts:84,169-174`; `whatsapp-webhook.controller.ts:119-122` | While held, only the Menu *tap* (or typed "menu") restarts; a typed hello stays with the person. |
| M6 | Tapping "Raise a complaint" or "Refer a friend" while a person holds the chat moves the state to `await_*`. The person's hold ends silently and the reminders stop. | `A/assistant.service.ts:154,157` | Keep `human` and only answer the row, or record that the hold was released (with a note) when it is. |
| M7 | Cancelled projects are counted inconsistently. `hasProject`, Payments, the Pay-now buttons, the complaint's project and Warranty all include them; Progress, Rating and Documents exclude them. A customer with only a cancelled home sees "no project yet" with a Pay-now tap whose page refuses them. | `A/answers.service.ts:76-83`, `A/payments-answer.ts:39-43`, `A/pay-buttons.ts:41-46`, `A/problem-flow.ts:56-61`, `after-sales/customer-after-sales.service.ts:68-72` vs `customer-portal/customer-home.ts:96` | Filter `projects.status <> 'cancelled'` everywhere the bot reads projects. |
| M8 | A finished project's progress reads "Now: Subsidy (7 of 7 steps done)", even when the subsidy step was skipped. | `customer-portal/customer-home.ts:38-39`; `A/answers.service.ts:50` | When there are no open tasks, say "Your solar system is complete" instead of a stage. |
| M9 | The subsidy status `inspected` has no words in any language, so its line is dropped from Progress. | `customer-portal/customer-home.ts:64`; `A/words.ts:42-47` (and `words-mr.ts:39-44`, `words-hi.ts`) | Add `inspected` to `WORDS.subsidy` in en/mr/hi. |
| M10 | A complaint from a customer with two or more homes is always filed on the newest project; there is no question about which home. | `A/problem-flow.ts:56-61` | When there are 2+ live projects, ask which home with a short list of towns. |
| M11 | Typed questions from a customer never reach a person ("Sorry, I did not get that" + menu) unless the last bot message was a template. "Ok" or "yes" after the in-window quote buttons gets "Sorry". | `A/assistant.service.ts:107,112-122,233` | After one "Sorry", hand the next free text to the owner (or treat any bot message from the last day like an update). |
| M12 | "View receipt" on a receipt older than the newest 3 shows the Documents list, which does not contain it. | `A/customer-papers.ts:27,153-169`; `A/paper-replies.ts:53-56` | In `tapped()`, look up the tapped paper by its id directly instead of within the newest-3 list. |
| M13 | A lead made by the team (open lead, onboarding not taking the chat) gets "This number is not linked to any of our customers yet" for every typed message, and it never reaches the lead's owner. | `A/stranger-flow.ts:45,86-97` | When there is an open lead, pass the typed words to its owner (`passToOwner`). |

### Low

| # | Finding | file:line | One-line fix |
|---|---|---|---|
| L1 | "Everything is paid" (`WORDS.allPaid`) is never used; when all is paid, Progress still offers Pay now. | `A/words.ts:53`; `A/assistant.service.ts:137` | Add the all-paid line and offer Track or Documents instead of Pay now. |
| L2 | The "no referrals" text says to tap "Refer a friend", but the only taps are Menu · Talk. | `A/words.ts:145`; `A/assistant.service.ts:160` | Add a `refer` closing tap. |
| L3 | The Warranty help says to tap "Report a problem", which is not offered. | `A/words.ts:140`; `A/assistant.service.ts:152` | Add a `service` closing tap. |
| L4 | My requests shows 5 with no "and N more", and echoes " (via WhatsApp)" in the description. | `A/answers.service.ts:91,97`; `A/problem-flow.ts:65` | Add a "more" line and strip the suffix when showing it. |
| L5 | The rating list has no Menu or Back row. | `A/feedback-flow.ts:28-33` | Add a `menu` row. |
| L6 | Typing "5" at the rating list opens "My requests" (menu row 5). | `A/assistant.service.ts:34` | Read 1-5 as a rating while the rating list was the last message. |
| L7 | The default bill bands have no Marathi or Hindi labels, so those chats show English rows. | `packages/domain/src/onboarding/settings.ts:55-61` | Add `labelMr`/`labelHi` to the defaults. |
| L8 | A project with no milestones yet shows only its heading under Payments. | `A/payments-answer.ts:55-67` | Say "No payments set up yet". |
| L9 | The file-failed, file-too-large and photo-added replies are plain text. | `A/media-intake.ts:163`; `A/problem-flow.ts:81` | Add a Menu tap. |
| L10 | A photo sent while a paper request is open is filed as that paper, even if it shows a fault. | `A/media-intake.ts:91-92` | Ask "Is this your <paper>?" before filing. |
| L11 | A family number linked to two customers is treated as a stranger and onboarded. | `chat-store.ts:64-70` | Hand it to a person instead of onboarding. |
| L12 | An opted-out customer gets answers but is never reminded that updates are off. | `A/opt-out.ts:55` | Add a line + Start again to the menu while opted out. |
| L13 | Typed "menu" or STOP while held alerts staff and may send a night reply before the bot's answer. | `whatsapp-webhook.controller.ts:119-123` | Check menu and STOP words before alerting. |
| L14 | "Hi" after the estimate goes to a person instead of showing the estimate taps again. | `O/onboarding-flow.ts:121,195-199` | On `resume` at `done`, send `question('done')`. |
| L15 | When a handler throws after queueing replies, Meta's retry sends those replies again. | `whatsapp-webhook.controller.ts:93-101` | Run each message's handling in one transaction. |
| L16 | A referral error other than duplicate is sent as the portal's English message, with no taps. The referral-code welcome has no taps when onboarding is off. | `A/assistant.service.ts:208`; `A/stranger-flow.ts:113-118` | Map it to a localized "could not save" + Menu · Talk. |
| L17 | A business template that arrives mid-referral or mid-complaint sends the next typed text to the owner, not to the flow. | `A/assistant.service.ts:95` | Check `await_*` states before `answersOurUpdate`. |
| L18 | A stranger's Call me back or Talk tap while held gets no bot reply (staff are alerted). | `A/handled-taps.ts:26` | Send `humanSoon` again for those taps. |
| L19 | The "This quote has changed" words are sent to an unlinked number (a revoked family contact) whose real problem is that the number is not the owner's. | `A/quote-actions.ts:65-66` | Use `quoteOwnerOnly` when `chat.customerId` is null. |
| L20 | A service city named "Other" gets the id `ob:city:Other`, next to `ob:city:other`. | `O/onboarding-replies.ts:89-90`; `packages/domain/src/onboarding/steps.ts:37` | Refuse "Other" as a city name in settings. |

### Tests to add first

1. A tap mid-complaint and a tap mid-referral (H1, H2).
2. `rate:5` while held, then saved (H3; update T/47).
3. A second Yes / Accept after acceptance gets a reply (H4; update T/28 "accepts once…").
4. A hello typed while held (M5).
5. A customer with only a cancelled project (M7).
6. End-to-end Raise a complaint, My requests, Warranty, Refer a friend, My rewards and Talk to a person on WhatsApp. None of them has an acceptance test today.
