# Known-customer main menu: map of the WhatsApp assistant

All paths are under `/Volumes/works-space/oneohm-official/OneOhm-Official/.claude/worktrees/papers-per-home/apps/api/src/modules/whatsapp/`. I abbreviate `assistant/` as `A/`. Everything is read from code; nothing was run.

Notation: `[Title|id]` is a reply button. `{Title|id}` is a list row. "Closing taps" are the 1–3 buttons from `A/closing-taps.ts`. English wording is verbatim. Marathi and Hindi variants exist for everything and are not repeated.

---

## 0. Pipeline for any inbound message from a known number

`whatsapp-webhook.controller.ts:79-120`, then `A/assistant.service.ts`.

0.1 **Webhook** (`:79-120`):
- The chat is found or created by phone (`conversationFor`). A customer's own number or an added family contact maps to the same chat and customer.
- The message is logged.
- If the message is an assistant-owned tap, it is marked `assistantTap`, so it never counts as "customer waiting" (`:91`).
- **Late tap** (`inbound-retry.ts:12-15`): a button or list tap whose timestamp is at least 1 s older than the chat's newest inbound message is silently ignored. It is only logged ("Ignored a late tap…"). The customer gets no reply.
- A customer's file is stored first (`files.keep`). After the assistant handles the message, `files.settle` files whatever is left.
- If the handler throws, the staff alert `whatsapp_not_handled` ("A WhatsApp message was not handled") fires and the inbound row is deleted, so Meta's retry is handled again.

0.2 **Held chat** (`:128-137`): if `chat.state === 'human'` and the message is not one the assistant owns (`handled-taps.ts`), staff get a `whatsapp_message` alert. The title is "WhatsApp from {name}". The body is the first 140 characters of the text, or "Sent a photo" (or the file type). `nightReply` may also fire (see 6.8).

0.3 **`AssistantService.handle`** (`assistant.service.ts:60-74`), in this order:
1. **STOP/START** (`opt-out.ts`). A whole-message `stop`, `unsubscribe`, `मेसेज बंद`, `संदेश बंद`, `मेसेज नको` or `मैसेज बंद` sets `optedOutAt` and `customers.whatsappOptIn=false`.
   - Reply: "You will not get WhatsApp messages from us now. Tap "Start again" whenever you want them back." `[Start again|start]`.
   - A START word (`start`, `सुरू`, `शुरू`) or the `start` tap works only when opted out. Reply: "Welcome back! You will get updates here again." `[Menu|menu]`.
   - START from a customer who is not opted out falls through and counts as a greeting.
2. `captureEntry` runs for strangers only.
3. **Quote tap** (`quote_accept|quote_yes|quote_ask:<uuid>`) goes to `QuoteActionsService`. It works even in a held chat. A tap also ends any waiting step.
4. Otherwise `answer()` (`:76-115`). The exact order is in section 6.

---

## 1. How the menu is reached

| Trigger | Where | Result |
|---|---|---|
| Typed `hi`, `hii`, `hello`, `hey`, `start`, `namaste`, `namaskar` (lower-cased, trimmed) | `incoming-words.ts:7-8` | `restart` → menu |
| Typed `Hi`, `नमस्कार`, `नमस्ते`, with a trailing `. ! ।` allowed | `saysHello`, `packages/domain/src/messaging/chat-openers.ts:29` | `restart` → menu |
| Typed `menu`, `मेनू`, `मेन्यू`, `मेनु`, `मेन्यु`, `मेन्यूं` (a trailing `. ! ?` is stripped) | `menu-words.ts:9` | `restart` → menu |
| Tap `[Menu|menu]` or row `{Back to menu|menu}` | `closing-taps.ts:53`, `paper-words.ts` | `restart` → menu |
| Tap `[Start again|start]`, or typed `start`, when not opted out | | `restart` → menu |
| A bad or unknown tap id | `assistant.service.ts:113-114` | "Sorry, I did not get that. Here is what I can help with." then the menu |
| Typed `Talk to a person` (or `मला टीमशी बोलायचे आहे` / `मुझे टीम से बात करनी है`) | `assistant.service.ts:84-85` | Skips the menu and hands over to a person |

`restart` (`assistant.service.ts:180-193`):
- **A held chat with a waiting step** (a person holds it and the bot's step is still set): only the step ends, the person stays, and the menu shows.
- **A held chat with no step**: `handedOverAt` and `handledByUserId` are cleared. The chat goes back to the bot with no note to staff or customer, then the menu shows.
- **Otherwise**: `setState('menu')`, then the menu.

In a held chat, a typed greeting does not restart (`incoming-words.ts:32-33`). Only the Menu tap or the typed word "menu" does. A typed "hi" goes to the person and alerts staff.

**Menu message** (`menu-answers.ts:68-85`). It is one list message.
- Body: `Hello {FirstName}! I am the {Brand} assistant. What would you like to see?` The first name is title-cased. The brand comes from `companyProfile.brandName`; if blank, "I am the assistant".
- List button: `Choose`.
- Section heading: the brand, cut to 24 characters by the worker.
- If the number has no customer record, it gives the stranger buttons instead.

**Rows** (`A/words.ts:9-20`; typed aliases from `menu-words.ts`):

| # | id | Title | Description | Typed aliases |
|---|---|---|---|---|
| 1 | progress | Project progress | Where your solar work stands | progress, project, status, प्रगती, प्रगति, प्रकल्प, प्रोजेक्ट, काम |
| 2 | payments | Payments | Paid, due and a link to pay | payment(s), pay, पेमेंट, पैसे, हप्ता, भुगतान, किस्त |
| 3 | documents | Documents | Quotation, invoices, receipts, papers | documents, document, papers, receipt, कागद…, पावती, दस्तावेज…, रसीद |
| 4 | service | Report a problem | Raise a service request | problem, complaint, तक्रार, समस्या, शिकायत |
| 5 | requests | My requests | Status of service requests | requests, विनंती, विनंत्या, अनुरोध |
| 6 | warranty | Warranty and AMC | Your equipment and cover | warranty, amc, वॉरंटी, वारंटी |
| 7 | refer | Refer a friend | Tell friends, earn rewards | refer, referral |
| 8 | rewards | My rewards | Your referrals and rewards | rewards, reward, बक्षीस, इनाम |
| 9 | feedback | Rate us | Tell us how we did | feedback, rating, रेटिंग |
| 10 | human | Talk to a person | A team member replies here | help, मदत, मदद |

Other ways to pick a row (`incoming-words.ts:15-20`): the number `1`–`10` (never advertised to the customer), the row id, or the row title in any of the three languages.

**Not recognised as typed words**: the closing-tap titles "Talk to us", "Track my project", "Pay now", "View receipt" and "Start again". They fall to the unknown-text rule (section 6).

**There is no language-change option.** The language comes from `customers.preferredLanguage` (set in the app) and is read per message (`assistant.service.ts:233-240`). Typed menu words work in all three languages whatever the setting is.

---

## 2. Each menu option, end to end

`MenuAnswersService.choose` (`menu-answers.ts:29-65`). The helper `answer(body, taps)` sends the body with closing taps. **If the customer has no active (non-cancelled) project, the taps are forced to `[Menu][Talk to us]`.** The "Talk to us" tap is `{human}`. Any body over 1,024 characters goes as plain text, then a "What next?" buttons message carrying the same taps (`closing-taps.ts:72-84`).

### 2.1 Project progress (`progress`)

1. Trigger: row, tap id `progress` (the "Track my project" button), or typed alias.
2. Reply (`answers.service.ts:33-68`). One message holds all active projects joined by a blank line, with no which-home question. Each block is:
   - `*Your solar project in {place}* · {N} panels ({x.xx} kW)`. `place` is just the town, or "{site label}, {town}" when the customer has projects on 2 or more sites. With 0 panels it shows only "x kW".
   - `Now: {Stage} ({done} of {steps} steps done)`, or `All {n} steps done. Your solar system is complete.` Stages: Site visit, System design, Equipment, Installation, Switch-on, Net meter, Subsidy.
   - `Next: {step title}, planned {Mon, 3 Nov}`. Shown only if there is a next step.
   - `{Waiting for something from you | Waiting for the bank | Waiting for the electricity board (DISCOM)} since {date}`. Shown only if the project is waiting.
   - A subsidy line:
     - No subsidy on this project.
     - Subsidy: not applied yet
     - Subsidy: applied, waiting for the government
     - Subsidy: inspection done, waiting for the release
     - Subsidy: released
3. Buttons: if any amount is due (`payNow().length > 0`), `[Menu|menu] [Pay now|payments] [Talk to us|human]`. Otherwise `[Menu][Talk to us]`.
4. Next steps:
   - `[Pay now|payments]` runs the Payments answer (2.2), not a payment. It is a second step before the real pay link.
   - `[Talk to us|human]` hands over (2.10).
5. No project at all: "We do not have a project for you yet. Tap "Talk to us" to speak to us." `[Menu][Talk to us]`.
6. Side effects: none.

### 2.2 Payments (`payments`)

1. Trigger: row, tap `payments` (the "Pay now" and "View receipt" ids differ, see 2.3), or typed alias. Handled in `menu-answers.ts:92-103`.
2. Reply 1 (text), `payments-answer.ts`. Per active project: `*Your solar project in {town}*`, then one line per instalment:
   - `✓ 1st instalment: ₹X paid`
   - `• Bank loan: ₹X (bank loan)`
   - `• 2nd instalment: ₹X later`
   - `• Last instalment: ₹X due`. Names are "1st/2nd/3rd/4th… instalment", with the last one called "Last instalment", and "Bank loan" for the bank share.
   - A due line gets `\n  Pay here: {our pay-page URL}` only when no Pay-now cards follow and the gateway mode is not off.
3. Two branches:
   - **A. Customer-share instalments are due and `RAZORPAY_MODE` is not off** (`pay-buttons.ts`). Reply 2 is one `cta_url` card per due instalment:
     - Body: `*Your solar project in {town}*\n• 1st instalment: ₹X due`
     - Button label: `Pay now`
     - URL: `{API_PUBLIC_URL}/v1/pay/due/{signed token}`. The token is valid for `PAYMENT_LINK_DAYS`. It opens our pay page, which makes the Razorpay link only when opened.
     - Final reply: `What next?` with `[Menu][Talk to us]`.
   - **B. Nothing due, or online payments are off.** The text from step 2 carries closing taps `[Menu][Track my project|progress][Talk to us]`.
4. Side effects: none. The pay-page token is signed only.
5. No project: the noProject text with `[Menu][Talk to us]`.

### 2.3 After-payment message (outbound, `projects/receipt-message.ts`)

When the customer's chat window is open and they have not sent STOP:
- The receipt PDF is sent as a document with the caption `Your payment receipt ({number})`.
- **Fully paid:** `Thank you, your payment is received. Next: {what happens next}. Your contact: {manager}, {phone}.` Taps: `[View receipt|paper:receipt:<paymentId>] [Track my project|progress] [Menu|menu]`.
- **Part paid:** `{amount} received. {left} is left on this instalment.` A `Pay now` card follows, then `What next?` with `[Menu][Talk to us]`.
- A tap on `paper:receipt:<id>` goes to `PaperRepliesService.tapped`. It sends that receipt PDF however old it is, then `What next?` with `[Menu][Talk to us]`.

### 2.4 Quotation

There is no quotation row in the menu. A quote reaches the customer in two ways.

**A. Push, from the team's "send quote"** (`quotations/quotation-message.ts:57-124`):
- Inside the 24-hour window, the PDF goes as a document with the caption `Your solar quotation ({number})`.
- Then a buttons message: `Your solar quotation is above.\nFull price ₹T, paid in N parts: ₹a on acceptance, ₹b before dispatch, ….(Subsidy ₹S comes back to your bank after commissioning.)\nHappy to go ahead?`
- Buttons: `[Accept quote|quote_accept:<id>] [I have a question|quote_ask:<id>]`.
- Outside the window, the approved `quotation_sent` template carries the same payloads.

**B. Pull**: Documents list (2.3b) → `{Your quotation|paper:quotation:<id>}`.

Taps (`quote-actions.ts`):
- **`quote_ask`** ("I have a question") → `passToOwner` (2.10), straight to a person. The assistant does not ask what the question is.
- **`quote_accept`** → `askToConfirm`:
  - Other customer's quote or not found: "This quote has changed or is no longer open." then `passToOwner`.
  - Phone is not the customer's own (family number): "Only the customer’s own number can accept a quote." then `passToOwner`.
  - Already accepted: "This quote is already accepted. Thank you!" `[Menu]`. Dedupe key `quote_already:{messageId}`.
  - Status not `sent`: the "changed" text, then `passToOwner`.
  - Otherwise a buttons message: `Accept your solar quotation for ₹T? The 1st instalment, ₹X, is due {on acceptance|before dispatch|…}.` Buttons: `[Yes, accept|quote_yes:<id>] [Not yet|quote_ask:<id>]`.
- **`quote_yes`** → `acceptByCustomer`:
  - Accepted now: "Thank you. Your project manager will start your project and send the advance payment link today (or the next working day)." `[Menu][Talk to us]`. Deduped by `quote_thanks:{id}`. Side effects: the quotation is set to accepted, the lead goes to "won", the lead's next action becomes "start project", and an audit row is written. Staff alert `quotation_accepted` ("{Customer} accepted {number} on WhatsApp — start the project") goes to the lead owner and to holders of `projects.create`.
  - `already`: "This quote is already accepted. Thank you!" `[Menu]`.
  - `not_open` (expired, newer revision, discount pending): the "changed" text, then `passToOwner`.
  - `not_owner`: the owner-only text, then `passToOwner`.
- **"Not yet"** uses `quote_ask`, so it also hands over to a person and alerts staff.

### 2.5 Documents (`documents`)

`paper-replies.ts` and `customer-papers.ts`.

1. Trigger: row, typed alias, or `[View receipt|documents]` (the one without an id).
2. Papers are collected in this order:
   - project quotations, plus up to 3 sent or accepted quotes not tied to a project;
   - up to 3 receipts;
   - up to 3 tax invoices;
   - up to 3 ready, customer-visible reports;
   - up to 3 other customer papers (excluding site photos, quotations and invoice receipts).
3. **0 papers:** "No documents yet. They will appear here as your project moves." `[Menu][Talk to us]`.
4. **Exactly 1 paper:** it is sent at once as a file, with no question and no lead-in text.
5. **2 or more papers:** a list message.
   - Body: `Which paper would you like? Tap one and I will send it here as a file.` If more than 9, add `\nFor older papers, ask us here.`
   - List button: `Choose a paper`. No section heading.
   - Rows (maximum 9 papers, then the Back row), with a description of up to 72 characters:
     - `{Your quotation|paper:quotation:<id>}`, described by `Your solar project in {town}` or `Sent {date}` / `Revised, sent {date}`.
     - `{Receipt · 1st instalment|paper:receipt:<paymentId>}` (falls back to "1st instalment receipt" or "Payment receipt" to fit 24 characters), described by `₹X · paid {date}`.
     - `{Tax invoice|paper:invoice:<id>}`, described by `₹total`.
     - `{<report name>|paper:report:<projectId>:<key>}` and `{<paper name>|paper:document:<id>}`, titles cut to 24 characters with "…".
     - `{Back to menu|menu}`.
6. Tapping a paper sends a document message: link from `sharedFileUrl` (Meta fetches the file), filename by customer, and caption:
   - quote: `Your solar quotation ({number})`
   - receipt: `Your payment receipt ({number})`
   - invoice: `Your tax invoice ({number})`
   - report or paper: its name

   Then `What next?` with `[Menu][Talk to us]`.
7. A tapped paper that is no longer theirs re-shows the list (or sends the single paper) with no explanation.
8. Side effects: none. Documents are stored under the customer.

### 2.6 Report a problem (`service`): entry only

`complaint-start.ts`.

1. Trigger: row, typed alias, or a tap on a stale `home:<uuid>` row (see section 8).
2. **0 or 1 active home:** `setStep('await_problem')` with the single home as `projectId`, and any pending photos kept. Reply: `Please tell us the problem in one message (for example "inverter shows an error since morning"). You can send a photo with a caption.` `[Menu]`.
3. **2 or more active homes:** `setStep('await_home')`, then a list.
   - Body: `Which home is the problem at?`
   - List button: `Choose`
   - Rows (up to 9): `{<town, 24 characters>|home:<projectId>}` with the description `<site label, 72 characters>`, plus `{Back to menu|menu}`.
   - A tap leads to `pickHome`, then the ask-problem message above.
   - A home that is no longer active: `That home is no longer active.` then the list again, or the question when one home is left.
   - Typed words at `await_home` end the step silently and are read as normal text.
4. Next, typed words (5 or more characters) at `await_problem` raise the request (`problem-flow.ts`).
   - Reply: `Thank you. Your {inverter|no generation|low generation|damage|cleaning|bill or meter|subsidy|service} request is raised. Our team will call you. Tap "My requests" to see its status.` With photos: "…request is raised with your photo / N photos. …". Buttons: `[My requests|requests][Menu]`.
   - Under 5 characters: `Please write a few more words so we can help.` `[Menu]`. The step stays.
   - Side effects: a service request is created (description saved as "{text} (via WhatsApp)"); staff alert `service_request` ("New service request") goes to holders of `service.manage` and the assignee.
   - The step expires after 30 minutes.

### 2.7 My requests (`requests`)

1. Trigger: row, tap `requests` (the `[My requests]` button), or typed alias.
2. Up to 5 requests, one per line: `• {first 60 characters of description} — *Open | Being worked on | Resolved*`, then optionally `\n  Technician visit: {date}` (not when resolved) and `\n  {resolution note}`.
3. None: `You have no service requests.`
4. Buttons: `[Menu][Talk to us]` (forced when no project). There is no "Report a problem" button.

### 2.8 Warranty and AMC (`warranty`)

`cover-answer.ts`. Per active project:
- `*Your solar project in {town}*`
- `Switched on {date}. Cover counts from that day.`
- `• Solar panels (24 × Make Model): 25 years, until {date}`, with `  Power output guaranteed until {date}`, or `• …: warranty ended on {date}`
- `AMC: {plan} ({starts soon|active|ended|cancelled}), {from} to {to}`, `{n} of {m} visits done`, `Next {visit} visit: {date}`, or `AMC: none yet. For yearly cleaning and check-up visits, tap "Talk to us".`
- Nothing installed yet: "Your warranties start on the day your system is switched on. They will show here then."
- If installed, the footer is: `For a problem with any of these, tap "Report a problem" in the menu.`
- No project: the noProject text.
- Buttons: `[Menu][Talk to us]`.

### 2.9 Refer a friend (`refer`) and My rewards (`rewards`)

**Refer:**
1. `setStep('await_referral')`. Reply: `Send your friend's name and 10-digit mobile number in one message, for example "Suresh Patil 9876543210".` `[Menu]`.
2. The next typed text is parsed by `readReferral`. It needs a mobile starting 6–9 (an optional +91 is allowed) and a name of at least 2 letters.
3. Outcomes:
   - **Not parsed:** `I could not find a name and a 10-digit mobile number. Please try again.` `[Menu]`. The step stays.
   - **Saved:** `Thank you! We will call {name}. You earn a reward when their solar is installed.` `[Menu]`. Side effect: a lead is created with source `referral` and `referredByCustomerId`, note "Referred by {customer}". The owner is chosen by rule and the lead intake alerts them.
   - **Duplicate** (an open lead exists on that number): `We are already in touch with this number. Thank you for thinking of us!` `[Menu]`.
   - **Any other AppError:** its raw message as plain text with no buttons (`assistant.service.ts:204`).
4. A tapped menu row at this step ends the step and is answered as itself.

**Rewards:**
- `*Your referrals*`, then `• {name}: {we will call them soon | we are talking to them | they ordered solar | their solar is installed | did not go ahead}; reward ₹X, waiting for approval | approved and paying soon | paid on {date} | no reward on this one`. Up to 8 are shown, then `And N more.`
- Totals: `Paid to you: ₹X` and `On the way: ₹Y`.
- None: `You have not referred anyone yet. Tap "Refer a friend" to tell your friends about us. You earn a reward when their solar is installed.`
- Buttons: `[Menu][Talk to us]`. There is no "Refer a friend" button.

### 2.10 Talk to a person (`human`)

1. Trigger: row, tap `human` (`[Talk to us]`), typed `help` / `मदत` / `मदद`, typed "Talk to a person" (the app's opener), or `quote_ask`. A typed unknown text takes the `passToOwner` variant.
2. `handOver(chat, 'service.manage')` (`hand-over.ts:60-87`):
   - `state='human'`, the step is cleared, `handedOverAt` is set.
   - The chat owner is ensured. If an owner exists, `tellChatTeam` sends an alert. Otherwise `notifyStaffHolders('service.manage')` sends it.
   - Alert: kind `whatsapp_handover`, title "Someone wants to talk on WhatsApp", body "{profileName | A customer} · {phone}", deduped by the customer's latest inbound message.
3. Reply: `A team member will reply here soon (Monday to Saturday, 9:30 am to 6:30 pm). Tap "Menu" to go back to the assistant.` `[Menu]`.
4. The `passToOwner` variant (unknown text, replies to our updates, quote questions) replies `Thank you. {Name | Our team} will reply to you here.` `[Menu]`, with the alert sent to the owner or the owner's desk. Name is the first name of whoever answers this chat today.
5. After that the bot is silent in this chat. Every customer text or file alerts staff ("WhatsApp from {name}"), and once per night outside working hours the customer hears the 6.8 reply. The customer's exits:
   - tap `[Menu]` or type "menu";
   - `handBackQuietChats` returns the chat to `menu` after 4 working hours with no team reply and no customer waiting. It writes a note in the history (`Handed back to the assistant (no reply for 4 working hours)`) and tells the customer nothing.

### 2.11 Rate us (`feedback`)

`feedback-flow.ts`.
1. `projectToRate` picks the newest live project (commissioned, `operational` or `completed`) not yet rated, else the newest live one. There is no which-home question.
2. No project: noProject text, `[Menu][Talk to us]`.
3. No live project: `Thank you! We will ask for your rating once your solar system is switched on.` `[Menu][Talk to us]`.
4. Otherwise a list:
   - Body: `How happy are you with us so far?`
   - List button: `Choose`
   - Rows: `{Very happy|rate:5, "5 of 5"}`, `{Happy|rate:4}`, `{Okay|rate:3}`, `{Not happy|rate:2}`, `{Very unhappy|rate:1}`, and `{Back to menu|menu}`.
5. A `rate:n` tap saves the rating on the project (updates it if one exists). It also writes a staff points suggestion (`suggestRatingPoints`) and sets `await_comment` with `{projectId, rating}`.
   - Reply: `Thank you for rating us! Anything to add? Write it here, or tap "Menu".` `[Menu]`.
6. The next typed text becomes the comment. It is capped at 1,000 characters.
   - If it is `skip, no, nothing, no thanks, none, nahi, nako`: `Thank you for rating us! It helps the team.` `[Menu]`.
   - Otherwise: `Thank you, we have noted it. It helps the team do better.` `[Menu]`.
7. There is no staff alert on a low rating.

---

## 3. Customers with several projects or homes

| Where | Behaviour | Code |
|---|---|---|
| Progress, Payments, Warranty, Documents | Not asked. Every active project is listed together (progress and warranty as one text message; payments one Pay-now card per due instalment; documents one list mixing all homes). | `answers.service.ts`, `payments-answer.ts`, `customer-papers.ts` |
| Report a problem | Asked, only at 2 or more active homes: "Which home is the problem at?" list `home:<projectId>` (town + site label). With 1 home it takes that one. | `complaint-start.ts:28-44` |
| Rate us | Not asked. Auto-picks the newest live unrated home. | `rating-rule.ts:16-19` |
| Customer sends a photo or paper | Asked once per burst at 2 or more homes: "Which home is this for?" list `fhome:<propertyId>`, with a person row `{Aadhaar/PAN (all homes)|fhome:person}`. The pick is remembered 30 minutes. The home is chosen without asking when there is 1 home, or one picked in the last 30 minutes, or only one home has open site requests. | `file-home.ts:31-51`, `file-home-flow.ts` |
| Then "Which paper is this?" | List with the open paper requests, `fpaper:<requestId>`, plus `{Something else|fpaper:none}`. Asked when 2 or more are open. | `file-paper-flow.ts` |
| Pay-now cards, payments text | Named by town only. | `pay-buttons.ts:56`, `payments-answer.ts:68` |

---

## 4. Customer sends a file or other message kinds

`assistant.service.ts:87-92`:
- **Photo or PDF:** `media.receive`.
  - At `await_problem`, the file raises the complaint with the caption as the words.
  - Within 30 minutes of a request being raised, it is added to that request: `Thank you, the photo is added to your request.` with `[My requests][Menu]`.
  - Otherwise it goes to a home and paper: `Saved: *{kind}* for your home at *{home}*.` plus `Still needed for this home: …`, with `[Menu]`.
  - A customer with no home gets `Thank you! We got your photo. It is saved with your documents and the team is told.`, `[Menu]`.
  - A file that is too large: `This file is too large. Please send a smaller photo or PDF.` A file that cannot be opened: `Sorry, we could not open that file. Please send it again in a little while.`
- **Voice note or video:** `Thank you for the voice note. {Name | Our team} will listen to it and reply to you here.` (or "…the video. … will watch it…"), then a handover with a staff alert.
- **Location pin, contact card, sticker:** nothing is said to the customer. Staff get a `whatsapp_message` alert, and the assistant stays on.
- **Reaction (👍 on our message):** nothing is said and nobody is alerted.

---

## 5. Closing taps (what ends an answer)

Titles and ids from `closing-taps.ts:10-60`:

| Tap | Title | id sent |
|---|---|---|
| menu | Menu | `menu` |
| pay | Pay now | `payments` |
| track | Track my project | `progress` |
| talk | Talk to us | `human` |
| receipt | View receipt | `documents` (or `paper:receipt:<id>` when attached to a payment) |
| requests | My requests | `requests` |
| start | Start again | `start` |
| (body) | What next? | (used as the body over taps when the answer is over 1,024 characters or follows a card or file) |

Per answer:

| Answer | Taps |
|---|---|
| Progress | Menu, Pay now (only if due), Talk to us |
| Payments, nothing due | Menu, Track my project, Talk to us |
| Payments with due cards | Pay cards, then `What next?` with Menu, Talk to us |
| Documents sent | `What next?` with Menu, Talk to us |
| Requests, warranty, rewards, refer, no-docs, no-project, rating-not-yet | Menu, Talk to us |
| Refer-ask, referral results, rating/comment saved, hand-over, thanks | Menu |
| Complaint ask | Menu |
| Complaint raised | My requests, Menu |
| Quote thanks | Menu, Talk to us |
| Quote already | Menu |
| STOP | Start again |
| START | Menu |
| After payment | View receipt, Track my project, Menu |

---

## 6. Typed free text: decision order (`assistant.service.ts:76-115`)

Words are read as `(choiceId ?? text).trim().toLowerCase()`. In order:

1. **`restartsChat`**: hello or menu words → menu (section 1).
2. **Held chat** (`state='human'`), when the message is not one of the assistant's own taps or step words: no reply. Photos and papers are still filed (`heldByPerson`, `:121-126`). Staff are alerted by the webhook.
3. **No customer id** → stranger flow (belongs to another map).
4. **`asksForPerson`** → hand over (`:84-85`). This is above all step handling.
5. **File** (`incoming.media`) → media intake (section 4).
6. **Location, contact, sticker or reaction** (`kind==='other'`) → tell staff (or nothing for a reaction).
7. **`isThanks`** → `You’re welcome 🙏` `[Menu]`. No alert (`:94`). Skipped when a step is waiting.
   - Matches `ok, okay, thanks, thank you, धन्यवाद, ठीक आहे, ठीक है, शुक्रिया`. A trailing `. !` is stripped. An emoji-only message also matches.
   - It does not match anything else ("thank you so much", "yes", "done", "Thanks 🙏", "okk").
8. **Reply to our business update** (`:96`): any typed text that is not a menu word, sent within a day of our last non-note outbound message being a template → `passToOwner` (alert + `Thank you. {Name} will reply to you here.` `[Menu]`), even in the middle of a step.
9. **`homeTap`**: `home:<uuid>`, `fhome:…`, `fpaper:…` (complaint home, file home, file paper).
10. **Waiting step** (`await_problem`, `await_referral`, `await_comment`; steps last 30 minutes): any typed text goes to the step (complaint text, referral, comment). Typed text at `await_home`, `await_file_home` or `await_file_paper` ends the step and is read as normal text. A tap ends the step and is answered as itself.
11. **`rate:n`** → rating.
12. **`menuChoice(word)`** (number, id, title, alias) → menu answer.
13. **`paper:…` tap** → send that paper.
14. **Any other typed text** (`:112`) → `passToOwner`. The chat goes to `human`, staff are alerted, and the customer hears `Thank you. {Name | Our team} will reply to you here.` `[Menu]`. So any unknown question, "Good morning", "Hello!" and so on takes the chat out of the bot's hands.
15. **Any other non-text** (an unknown tap id, for example a stranger's `callback`) → `Sorry, I did not get that. Here is what I can help with.` then the menu. These are two messages.

**6.8 Night reply** (`hand-over.ts:137-158`): for a held chat, once per night outside working hours, if the `whatsappNightReply` setting is on and the bot has not already said something since the last working-day end: `Thank you. We reply from 9:30 am to 6:30 pm. Your message is with {Name | our team}.` No buttons.

### `guess-category.ts`

Used only on complaint text. The first matching rule wins; they are regexes, not word matches:
1. inverter / error / fault / beep → `inverter`
2. no power / no generation / not generating / zero / stopped / बंद → `no generation`
3. low / less / reduced / कमी → `low generation`
4. broken / damage / crack / leak / wire → `damage`
5. clean / dust / wash → `cleaning`
6. bill / meter → `bill or meter`
7. subsidy → `subsidy`
8. otherwise `service`

The category label feeds the confirmation text ("Your damage request is raised").

---

## 7. Old and stale taps

- **Menu list rows and closing buttons carry static ids.** They keep working however old the message is, in any state. In a held chat, `assistantAnswersTap` answers them: `menu`, `start`, any menu id, `paper:…`, `rate:n`, `home:…`, `fhome:…`, `fpaper:…`, and quote taps. They do not alert staff.
- **Stale `rate:n`:** re-rates and updates the stored rating, and asks for a comment again. If the project is no longer live, the "later" text shows.
- **Stale `home:<uuid>`** (complaint list), tapped when not in `await_home`: starts a complaint on that home (sets `await_problem`). A cancelled home gets "That home is no longer active." and then the list or question again.
- **Stale `fhome:`:** with no files waiting, it replies `Noted: files you send now are for *{home}*.` `[Menu]` and remembers the home for 30 minutes. A cancelled home gets "That home is no longer active." and the list again.
- **Stale `fpaper:`:** `Your files are already saved. Nothing else was changed.` A paper that is no longer open gets `That paper is no longer needed, or we have it already. Nothing was changed.`
- **Stale quote buttons:** see 2.4. They give the "changed or no longer open" text and a handover.
- **Steps older than 30 minutes** (`chat-step.ts:15-42`) are treated as ended. Typed words then fall to the "unknown text → person" rule. In a held chat the bot no longer takes the words, and they go to the person.
- **Meta out-of-order delivery:** a tap older than a newer message is skipped (0.1).
- **STOP/START** works at any time (0.3).
- **Pay-now links:** each link has an expiry (`PAYMENT_LINK_DAYS`).

---

## 8. Side-effects summary

| Event | Record or alert |
|---|---|
| Hand over (menu "Talk to a person", `quote_ask`, unknown text, update reply, voice/video) | `wa_conversations.state='human'`, `handedOverAt`; chat owner assigned; staff alert `whatsapp_handover` ("Someone wants to talk on WhatsApp") to owner or desk |
| Customer message while held | `whatsapp_message` alert "WhatsApp from {name}" per message; night reply once per night |
| Complaint raised | Service request created; `service_request` alert to `service.manage` holders and assignee |
| Referral saved | Lead (source `referral`) with owner by rule |
| Rating or comment | `customerFeedback` upsert; `suggestRatingPoints` (no alert) |
| Quote accepted | Quotation set to accepted; lead to "won"; `quotation_accepted` alert; audit row |
| Photo or paper | Stored as a document; filed on a home or request; `whatsapp_message` alert "Sent a photo… Saved in Documents…"; `whatsapp_file_failed` or `wa_file_unfiled` alerts when it fails |
| Unhandled error | `whatsapp_not_handled` alert; inbound row deleted so Meta's retry reruns |
| Quiet chat | Silent hand-back after 4 working hours; a history note only |

---

## 9. Issues seen

### Dead ends and confusing paths

1. **Unknown typed text silently moves the chat to a person.** `assistant.service.ts:112`. "Good morning", "Hello!" (with punctuation), "Hi there", "Namaste!", "when will you come?", "thanks so much", "yes", "no", "done" all take the bot out of the chat and alert staff. After that the bot stays silent until the customer taps Menu. Nothing tells them this, and a later "hi" does not wake it (`incoming-words.ts:32-33`).
2. **Greeting matching is brittle** (`incoming-words.ts:7-8`, `chat-openers.ts:26-29`). Punctuation is stripped in the `menuWordChoice` and `saysHello` checks, but the `GREETINGS` set compares the raw lower-cased word. So `hello!` and `hey!` do not match the set. `saysHello` knows only `hi`, `नमस्कार`, `नमस्ते`, so `Hello!`, `Namaste!` and `Good morning` do not restart. They go to a person.
3. **"Ok" or "Yes" is misread.** After the quote's "Happy to go ahead?" buttons, a typed "ok" gets "You’re welcome 🙏" (`assistant.service.ts:94`). Typed "yes" goes to a person. Neither accepts the quote.
4. **Typed menu words are swallowed mid-step.** At `await_problem` a typed "payments" or "thanks" (5 or more characters) raises a service request (`assistant.service.ts:164`, `problem-flow.ts:51-54`). "ok" gets "Please write a few more words so we can help." At `await_comment`, "thanks" is saved as the comment. At `await_referral` any non-number text loops on the unclear message.
5. **Hidden typed shortcuts.** Numbers 1–10 map to rows (`incoming-words.ts:16`) but are never offered. The typed titles of closing taps ("Talk to us", "Track my project", "Pay now", "View receipt") are not understood and hand over.
6. **Answers tell the customer to tap buttons that are not there:**
   - Warranty: `tap "Report a problem" in the menu` (`words.ts:148`).
   - Rewards: `Tap "Refer a friend"` (`words.ts:153`).
   - No project: `Tap "Talk to us"` (`words.ts:32`).
   - My requests, rewards and warranty offer only `[Menu][Talk to us]`, so the natural next action costs three taps (Menu → Choose → row).
7. **"Pay now" on the progress answer does not pay.** It runs the Payments answer, which then shows the real "Pay now" card (`menu-answers.ts:42`, `closing-taps.ts:54`). That is three messages and extra taps before the web page.
8. **Quote buttons are not interpreted.** "I have a question" and "Not yet" both hand over without asking what the question is (`quote-actions.ts:50`). "Not yet" is not a "later" signal.
9. **Documents returns a file with no lead-in** when there is exactly one paper (`paper-replies.ts:34`), and a paper that is gone silently re-shows the list (`:61`).
10. **Raw error text** with no buttons for non-duplicate referral errors (`assistant.service.ts:204`).
11. **Stale-tap risks.** A stale `home:` row starts a complaint out of nowhere (`assistant.service.ts:98`). A stale `rate:n` overwrites the rating and reopens the comment step.
12. **Silent hand-back.** After 4 working hours of silence the chat returns to the bot with no message to the customer (`chat-hand-back.ts`), and no message when a customer taps Menu out of a person's hold.

### Robotic or inconsistent wording

13. **"Talk to a person" vs "Talk to us".** The menu row is "Talk to a person", the closing tap is "Talk to us". The hand-over reply names a person in one place (`passedToOwner`) but is generic in another (`humanSoon`, with working hours and "Tap "Menu""). The menu "Talk to a person" reply does not name the owner even when one exists.
14. **"Back to menu" (list rows) vs "Menu" (buttons).** The list rows need open-list plus pick, two taps for a single choice.
15. **Menu greeting is identical every time** ("Hello {name}! I am the {Brand} assistant. What would you like to see?") and is shown on every hello and every "unknown tap". It never mentions the project, an instalment due, or what happened last.
16. **Payments text.** `• Bank loan: ₹X (bank loan)` repeats itself (`words.ts:190`, `project-words.ts`). A mixture of ticks and bullets with "later" is terse. Due amounts do not say which home when two are in the same town.
17. **Home naming differs.** Progress uses "{site}, {town}" for multi-site customers, but payments, pay cards, warranty and documents use town only (`customer-home.ts:170` vs `payments-answer.ts:68`). Two homes in one town look identical on the Pay-now cards.
18. **My requests shows the internal suffix** " (via WhatsApp)" (`problem-flow.ts:63`, `answers.service.ts:93`), cut at 60 characters.
19. **"Sorry, I did not get that. Here is what I can help with."** is followed by the full menu as a separate message (`assistant.service.ts:113`). It is unused for typed text, which goes to a person instead.
20. **Category words** ("Your damage request", "Your service request") read oddly (`words.ts:198-207`). Category guessing is substring-based and can mis-tag ("low" in "slow", "wire" in "wireless") (`guess-category.ts`).
21. **Language.** There is no in-chat way to change language. A customer who writes in Marathi but has `preferredLanguage` unset gets English.

### Too many steps

22. Typical path: say hi → read the menu → tap Choose → tap a row → read the answer → tap a button. Documents with several papers adds a second list. Payments is three messages. The menu and every list need two taps.
23. Report a problem needs a home pick (2+ homes), then the typed message, then no follow-up question; the customer is not asked for a photo or the time it started, only told they can attach one.
24. The 30-minute step timer is invisible to the customer. A step started and left silently expires, and the next message goes to a person.

### Other

25. **Rating** is not per home and offers no way to choose which home is being rated (`rating-rule.ts`). A low rating raises no staff alert.
26. **Referral** does not check whether the number is already a customer (only open leads, `customer-portal.service.ts:88-96`).
27. **Held-chat gaps.** In a held chat, an unrecognised tap or any typed word alerts staff, but the customer gets nothing back. Staff replies do not carry a Menu button, so the customer has no visible way back to the bot (only the hand-over reply had one).
28. **`answer()` calls `hasProject` on every menu answer** (`menu-answers.ts:34-36`), one extra query per reply, and forces `[Menu][Talk to us]` even for answers that do not depend on a project (requests, rewards).