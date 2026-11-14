# WhatsApp review — one full project, customer's view (2026-11-06)

Source: `docs/testing/2026-11-06-whatsapp-transcript.txt` (customer +91 80878 23247, chat in
Marathi, project OH-2026-015). 34 messages from the customer, 86 from us, in 53 minutes.

## How it felt for the customer

**Good**
- Onboarding is short: 8 taps to a priced estimate PDF in Marathi.
- Every question has Back and "talk to a person".
- Quote accept asks to confirm, and "Not now → 1 month" is kind and keeps the quote.
- Pay needs no typing; receipts come by themselves; the handover pack comes as PDFs.
- Complaint and referral flows are quick (4–5 taps), and the reply names the person who will call.

**Hard or confusing**
1. **Two languages.** 20 of our 86 messages were English templates, mixed into a Marathi chat
   (quote, all step updates, all receipts, service updates, one pay link).
2. **Too many messages at once.** Bursts of 3–4 messages in the same second (e.g. 09:25:16–09:25:54:
   "solar started + pay", rating ask, 2 step updates, a second pay link; 09:27:54–09:28:27: 3
   handover messages, 1 "handover papers" update, subsidy question, 3 subsidy updates).
3. **Same news twice.** Each payment: chat "payment received" + template "payment received, receipt
   attached". Installation: "finished and checked" + "is it finished to your satisfaction?".
   Handover: pack + "handover and warranty papers". Final payment: chat Pay + template pay link.
4. **Wrong order.** "Did the ₹78,000 subsidy reach your bank?" came before "subsidy applied /
   inspected / released".
5. **Answer thrown away.** "Is the roof ready?" → "Yes" → "that message is no longer open".
6. **Asked again for what they gave.** Shared a location pin → "which city is it in?".
7. **Repeated prompt.** 3 photos → the same "send up to 3 photos, then tap Done" 3 times.
8. **Two taps to pay.** "₹X due [Pay ₹X]" → "₹X to pay [Pay now]" → pay page.
9. **Promise that cannot hold.** "Rohit will start your project today" — Rohit (sales) cannot.
10. **Service updates** are English with an internal label ("inverter error or alarm") and
    "We will keep you posted" even when resolved; no "Is it fixed?" check in the chat.

## From the staff side
- The chat log shows English text marked "· sent in Marathi" — staff cannot tell what the customer read.
- Alerts for "start the project" go to people who cannot start it.
- A customer answer dropped by the bot (roof ready) is invisible to staff.
- Complaint photos 1 and 2 are not on the ticket; staff see "1 photo".

## Corrections after the code review

- The quote and the 3 receipts **did** go in Marathi with the PDF (Marathi file templates). The
  staff chat log showed English text tagged "· sent in Marathi" — the log was wrong, not the send.
- The "wrong order" (subsidy question before the updates) was also only in the log: chat replies
  were logged at queue time, templates at send time. Real send order was right.
- The extra final "please pay" link came from a 60-second auto-timer, not from the customer's tap.

## Root causes and fixes

| # | Problem | Cause | Fix (status: fixed, tested) |
|---|---|---|---|
| 1 | Step and service updates in English | No chat-window routing; `project_milestone` / `service_update` have no Marathi template | Worker sends an in-language chat message when the window is open and the template has no customer-language version |
| 2 | Staff log shows English for Marathi sends, wrong order | Log uses the English preview; chat logged at queue time, templates at send time | Log the text actually sent; one consistent timestamp |
| 3 | Bursts of step updates | One template per finished task | Step updates wait 90 s and merge into one message (`outbox.not_before`) |
| 4 | Payment received twice | Template + chat "paid, next step" | Inside the window: one chat message with the receipt PDF + next step + taps |
| 5 | "Next: site visit" after the visit | Static text by instalment | Text depends on the project's survey task |
| 6 | Step update + richer journey message for the same step | Both always sent | Skip the plain update when the journey sends its own (installation done, handover, subsidy) |
| 7 | Extra final pay link | Final-link timer always sends the template | Inside the window the chat Pay button is enough; no template |
| 8 | Roof-ready "yes" thrown away | Question closed when dispatch was marked done | Question stays open until installation starts; late answers are kept |
| 9 | Pin did not give the city | City matched only on the pin's text label | Reverse-geocode the pin (2.5 s timeout), match the service city; else ask |
| 10 | Convert form: wrong map, floors 1 | Pin and floors only in history notes | Saved on the lead (`latitude`, `longitude`, `floors`) and pre-filled |
| 11 | 3 photos → 1 on ticket, 3 prompts | Three webhooks wrote the same chat state at once | Locked, append-only photo step; prompt once |
| 12 | "Rohit will start your project" | Thank-you named the sales owner | Says "our team" unless the person can start projects |
| 13 | Start-project alert to the wrong people | Alert rules skipped owner/admin | Alert everyone at work who can create projects; FYI to the lead owner |
| 14 | Service updates English, no "Is it fixed?" | Chat check needed a template switch that is off | Chat replies in-language regardless of the template switch |
| 15 | "Rate commissioning and handover" at switch-on, asks stacked | Wording; no "one ask at a time" rule | Named "switch-on"; skip a rating ask while another ask is open |
| 16 | Vendor bank form: grey Save, no reason | Reasons shown only after a save try | Reasons shown; button never blocks silently |

Kept as is (by design): two taps to pay (the first message also holds "I paid another way";
WhatsApp cannot put a link button next to reply buttons).

## Safety review of the fixes (Opus) and what changed after it

A second review looked for lost, doubled or stuck messages. Fixed:
- Every chat message that replaces a template can carry a **backup template**. If the chat
  window closed before sending, or Meta reports error 131047 later, the backup goes once.
  Receipts, the final Pay ask, and the installation / handover / subsidy questions use it.
- Final instalment: the Pay ask is queued directly (the due notice stays quiet for a final
  milestone), and only sent or pending Pay messages count as "already asked".
- "Told" now means delivered, not just queued.
- Outbox: the worker claims a row atomically before sending; merges only into rows held > 15 s
  more and not started; merged keys are kept (no repeat); one send at a time per person; a held
  step update is released when any other message for that person is queued (order kept).
- A roof question closed early after "Not yet" resumes the waiting dispatch step.

## Checks

- Unit tests: all 16 packages pass. Typecheck, lint (no errors) and file-size checks pass.
- Acceptance: 918 of 918 scenarios pass (2 tests updated to the new correct behaviour:
  "our team" in the Marathi thank-you; the final Pay ask comes from the switch-on message).
- Live: Google reverse geocoding of the test pin gives "Sangli".
- New migration `0093_chat_hold_and_lead_pin` (outbox.not_before, leads.latitude/longitude/floors).

## Known small gaps (left as is)
- A 4th photo arriving while the complaint is being raised stays a loose file.
- If raising a complaint throws after the photo step closed, the customer must start again.
- Meta has not yet been tried with a document header on a button message (receipt in chat);
  if Meta refuses it, the backup receipt template goes.

## WhatsApp forms (Flows) — switched on (2026-11-06, afternoon)

- Published at Meta and switched on: Report a problem, Refer a friend, Self site survey, Share UPI
  (built earlier but never published), and a new **"Tell us about your home"** onboarding form.
  All 7 forms are live; each passed Meta's validator before publishing.
- Onboarding is now: language (1 tap) → one form → estimate PDF. Live test: 5 messages instead of
  about 20; the lead got name, city, site, bill band (3 kW), roof, floors 2, campaign DIWALI26 and
  the bill photo as "Electricity bill". The chat path stays as the fallback.
- Staff chat: a form reply is one card (answers as rows, photo thumbnails, Open ticket / lead
  link) instead of "Sent a form (2 files)"; buttons show as pills; form photos get readable names.
- Edge cases fixed and tested (form twice, old token, empty optional fields, long note, person
  holding the chat, two homes in one town, referral of own number / existing customer / bad
  mobile / other city, paid-another-way odd amounts and dates, bad UPI, failed photo download).
- Migration `0094_chat_message_data` (`wa_messages.data`) stores the card data.
- Tests: 950 of 950 acceptance (32 new form scenarios) + unit suites pass.

Small open points: the chat's answering person can differ from the lead owner (here Priya answers,
Tanvi owns the lead); a problem form whose home is asked later in the chat has no card link.
