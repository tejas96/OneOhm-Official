# WhatsApp conversation map: everything before a person is a known customer, plus routing

Scope: `apps/api/src/modules/whatsapp/` plus the pieces it calls (`packages/domain`, `packages/database/src/chat-*.ts`, the worker, `crm/*`, `quotations/*`). Everything below comes from reading the code; I ran nothing. Paths are relative to `apps/api/src/modules/whatsapp/` unless they start with `/`. Titles are English. Marathi and Hindi versions exist for every string and have the same ids.

---

## 0. Vocabulary

**Who someone is.** `conversationFor` (`chat-store.ts:~37`) upserts the chat row on every inbound message.
- Customer: the phone matches `customers.phone_e164`, or an unrevoked family contact on exactly one customer. `chat.customerId` is set.
- Stranger: no customer. `chat.customerId` is null.
- Lead: a stranger with an open lead (`leads.stage` not `won` or `lost`).
  - The lead is either one the onboarding bot made (the chat has `context.ob`) or one the team made.
- A lead becomes a customer when staff run `convertLead` (`crm/customers.service.ts:107`).
  - The chat's `customerId` flips on the next inbound message.
  - The chosen chat language is copied to `customers.preferredLanguage`.

**Chat `state`** (`wa_conversations.state`, default `menu`):

| State | Meaning |
|---|---|
| `menu` | Idle. |
| `human` | A person holds the chat. The assistant is quiet except for its own taps. |
| `onboard:<step>` | Onboarding is on that step. Steps in order: `language`, `name`, `city`, `site`, `bill`, `roof`, `floors`, `photo`, `done`. Source: `/packages/domain/src/onboarding/steps.ts`. |
| `await_home`, `await_problem`, `await_referral`, `await_comment`, `await_file_home`, `await_file_paper` | `WAITING_STEPS` (`assistant/chat-step.ts:5`). Customer-only. |

**`STEP_MINUTES = 30`** (`chat-step.ts:15`).
- A waiting step older than 30 minutes is read as `menu`.
- While a person holds the chat, the bot's step lives in `context.step` and the state stays `human`.
- Onboarding states have no timeout. They are handled by the nudge job instead.

**Context keys** (`wa_conversations.context`):

| Key | Used for |
|---|---|
| `entry` | Where a new person came from: ad id, headline, URL, campaign code. |
| `ob` | Onboarding memory: `answers`, `misses`, `awaiting`, `pendingFile`, `nudgedAt`, `startedAt`, `followedUpAt`. |
| `step`, `stepAt` | Customer steps. |
| `paperWait`, `fileHome`, `filePaper`, `toSort`, `projectId`, `rating`, `raised` | Customer flows. |

- `keepEntry` (`chat-store.ts:~205`) keeps `entry`, `ob`, `paperWait`, `fileHome` and `filePaper` across every `setState`.
- So `ob` survives a hand-over, a release and a hand-back.

**Other chat columns:** `optedOutAt`, `handedOverAt`, `handledByUserId`, `assignedUserId`, `language`, `lastInboundAt`, `profileName`.

---

## 1. Routing

### 1.1 Webhook order (`whatsapp-webhook.controller.ts:receive`)

1. `webhookAccess`: the Meta HMAC signature, or a secret URL key.
   - Bad signature gives 401. A wrong key gives 404.
2. `readWebhook` turns each message into an `Incoming`.
   - **Kinds:** `text`, `choice` (button or list tap, with `choiceId`), `media` (image, document, video, audio), `other`.
   - **`other`** covers a sticker, a location pin, a contact card, a reaction (marked `quiet`) and unsupported types.
     - Its text reads like "Sticker", "📍 Location: …", "👤 Contact: …", "Reaction 👍", "Message (type)".
   - It also reads the ad `referral` object from click-to-WhatsApp ads.
3. For each message:
   - `conversationFor` then `ensureChatOwner`.
     - A chat nobody owns gets the newest lead owner on that number, if staff. Otherwise it stays null, which means the desk.
   - `logIncoming`. A duplicate Meta delivery (same `wa_message_id`) is skipped silently.
   - A tap the assistant answers is marked `assistant_tap` and does not count as "customer waiting".
   - `isLateTap`: a button or list tap at least 1 second older than the chat's newest inbound is dropped silently, with only a log line.
   - Customers' files are stored before the assistant runs (`files.keep`).
   - `handle()`:
     - If `state==='human'` and the assistant does not own this message, **staff are alerted** (`tellAnswerer`) and `nightReply` runs.
     - Then `assistant.handle`.
   - On failure: log, alert staff, forget the message and answer 500, so Meta retries. The customer hears nothing.
   - After the assistant, strangers and leads get `files.keep` (files the lead on a lead), and customers get `files.settle`.
4. Delivery receipts are applied last.

**Staff alerts in the webhook.**
- `tellAnswerer` sends kind `whatsapp_message`, title `WhatsApp from <name or phone>`, and a body of the first 140 characters, or `Sent <photo|paper|video|voice note>`.
- Failures send `whatsapp_not_handled`: "A WhatsApp message was not handled".

### 1.2 `AssistantService.handle` (`assistant/assistant.service.ts`)

Order of decisions, top to bottom:

1. **Opt-out first** (`opt-out.ts`), whatever the chat state.
   - Typed text only, exactly `stop`, `unsubscribe`, `मेसेज बंद`, `संदेश बंद`, `मेसेज नको` or `मैसेज बंद`, case-insensitive.
   - Reply: "You will not get WhatsApp messages from us now. Tap "Start again" whenever you want them back." with buttons `[Start again → id start]`.
   - Side effects: `optedOutAt=now`; `customers.whatsapp_opt_in=false` for that phone.
   - **START** is `start`, `सुरू` or `शुरू` typed, or the `start` tap.
     - It only counts when `optedOutAt` is set. Otherwise "start" is just a greeting.
     - Reply: "Welcome back! You will get updates here again." with `[Menu → menu]`.
     - It clears `optedOutAt` and sets `whatsapp_opt_in=true`.
   - Opt-out only blocks template (business-initiated) sends. The worker checks it in `optOutNote`.
   - It does not block conversational replies. Session messages never check it (`worker delivery.activities.ts:~221`).
   - The nudge job skips opted-out chats.
2. `captureEntry` (`entry-capture.ts`).
   - Applies to non-customers with no saved entry and no open lead.
   - If the message carries a Meta ad referral, or is text exactly like `[hi|hello|hey] oneohm <CODE>` where the code has a digit, `-` or `_` or is on the Ad and campaign codes list, then `context.entry` is saved. First touch wins.
   - It is written onto the lead when a lead is later made, and cleared after.
3. **Quote tap** (`quote_accept:<uuid>`, `quote_yes:<uuid>`, `quote_ask:<uuid>`).
   - Handled even when a person holds the chat.
   - A waiting step is ended first. See 4.4.
4. `answer()`:
   1. `restartsChat` (`incoming-words.ts:25`). Hello and Menu win over everything else:
      - **Held (`state==='human'`):** a tap `menu` or `start`, or any other tap that reads as a greeting, restarts. A typed word restarts only if it is a menu word (`menu`, `मेनू`, `मेन्यू`, …). A typed "hi" is NOT a restart while held.
      - **Not held:** a restart is one of:
        - `hi`, `hii`, `hello`, `hey`, `start`, `namaste`, `namaskar`
        - a menu word
        - `saysHello` (Hi, नमस्कार, नमस्ते)
        - for strangers only, a campaign opener
      - `restart()` (`assistant.service.ts:180`):
        - Clears `handedOverAt` and `handledByUserId` if held, then for a stranger calls `strangers.greet`.
        - For a customer: `setState(menu)` and the menu list.
        - Strangers: `greet` resumes onboarding if it applies. Otherwise state goes to `menu` and the stranger buttons (2.1) are sent.
   2. `heldByPerson`. If `state==='human'` and the assistant does not own this message, return silently.
      - Owned means: the taps `menu`, `start`, a quote tap, a stranger's `callback` or `human`, and (customers only) menu ids, paper taps, ratings and home or paper rows.
      - A held chat that sends an unowned tap, such as an old `ob:…` list tap, gets silence plus a staff alert.
   3. `if (!chat.customerId) return stranger(...)`. See 1.3.
   4. Customer branch, out of scope here: "Talk to a person" opener, files, other, thanks, home taps, waiting step, rate, `menuChoice`, papers, then unknown text goes to a person with "Thank you. {name|Our team} will reply to you here.".

### 1.3 Stranger sub-router

`stranger()` (`assistant.service.ts:144`):
- Held: `strangers.answer(chat, word)`.
- Otherwise: `strangers.route`.

`StrangerFlowService.route` (`assistant/stranger-flow.ts:40`):

1. If the chat is not an onboarding chat and the text contains a referral code (`…code <6-8 alphanumerics>`), try `referredFriend`. See 3.9.
2. `onboarding.takes(chat)`:
   - True if `isOnboardingChat` (state `onboard:*` or `context.ob` exists). This holds even if onboarding was switched off since.
   - Or if onboarding is enabled in settings (default true) AND there is no open lead on the number.
   - If true, `onboarding.handle`. See section 3.
3. Otherwise this is a lead the team made (or onboarding is off):
   - Media goes to `fileOnLead` (3.7).
   - A text exactly equal to the "Talk to a person" opener (`Talk to a person`, `मला टीमशी बोलायचे आहे`, `मुझे टीम से बात करनी है`) calls `answer(chat,'human')`.
   - Text or `other` messages from a number with an open lead call `people.passToOwner` (2.4).
   - Everything else, including all taps and text from a number with no lead, calls `answer(chat, word)`. See 2.1.

### 1.4 Working hours and after-hours

- Constants (`/packages/domain/src/messaging/chat-rules.ts`):
  - Hours are 9:30 to 18:30 in `BUSINESS_TIMEZONE`.
  - `FIRST_NUDGE_MIN=30`, `LATE_MIN=120`, `HAND_BACK_MIN=240` working minutes.
  - `CHAT_WINDOW_HOURS=23`.
- `isWorkingTime` looks only at minute-of-day. It has no day-of-week or holiday logic.
- **Customer-facing hours text** appears in only two places:
  1. `WORDS.humanSoon`: "A team member will reply here soon (Monday to Saturday, 9:30 am to 6:30 pm). Tap "Menu" to go back to the assistant."
     - Used when a stranger taps `human` and onboarding does not apply, and when a customer taps `human`.
  2. `WORDS.nightReply`: "Thank you. We reply from 9:30 am to 6:30 pm. Your message is with {name|our team}."
- **`nightReply`** (`hand-over.ts:137`):
  - Runs only for a held chat when the customer writes something the assistant does not own.
  - Conditions:
    - Outside working hours.
    - Settings → Reminders → `whatsappNightReply` is on.
    - Our side has not already sent a non-note, non-staff message since the last 18:30.
  - The hand-over reply counts as a prior message.
  - At night the hand-over text itself is therefore the only reply, and it carries no hours (see Issue 11).
  - It is sent after the staff alert, in the customer's language.
- The onboarding "I'll call you" reply says "today" in hours and "tomorrow morning" after hours (`afterHours()` in `estimate-next-steps.ts`).
- There is no after-hours notice for an unheld chat. The bot answers 24/7.

### 1.5 Language choice

- **Strangers and leads:**
  - The very first onboarding question (`question('language')`) is trilingual, with three buttons: English `ob:language:en`, मराठी `ob:language:mr`, हिंदी `ob:language:hi`. Typing "english", "marathi", "hindi" or 1, 2, 3 also works.
  - The answer is stored in `chat.language` and `ob.answers.language`.
  - After that, all replies are in that language: `inLanguage(assistantLanguage(...))` wraps the handler. `assistantLanguage` takes the first two letters of the code (`mr` or `hi`), else English.
  - Before a language is chosen it is English, including the STOP reply, opt-out words and the unknown-number text.
  - It can be changed only by going Back to the language question during onboarding. See Issue 14.
  - A referral stranger never sees the language question (3.9).
- **Customers:** `customers.preferredLanguage`, set from the chat language at conversion or from the app. There is no in-chat way to change it.

### 1.6 Hand-over to a person and hand-back

**`HandOverService.handOver`** (`assistant/hand-over.ts:60`):
- `toPerson`:
  - `state='human'`.
  - `context.step` removed.
  - `handedOverAt=now`.
- `ensureChatOwner`.
- **Alert** (kind `whatsapp_handover`, title "Someone wants to talk on WhatsApp"):
  - Body is `<profileName or "A customer"> · <phone>` plus the optional summary.
  - It goes to the owner, or the covering person if the owner is on leave.
  - If nobody owns the chat, it goes to everyone with the desk capability: `leads.manage` for strangers, `service.manage` for customers.
  - The alert key is per customer message, so Meta retries do not double-alert.
- The customer hears the reply text plus a `[Menu → menu]` button.
  - Default reply: `WORDS.humanSoon`.
  - `passToOwner` instead sends "Thank you. {FirstName|Our team} will reply to you here." (`WORDS.passedToOwner`).
  - Onboarding passes its own reply.

**While held:**
- Typed words, files and unowned taps from the customer:
  - They alert staff (`WhatsApp from <name>: …`). Chat reminders at 30 minutes and 2 hours follow (`apps/worker/.../chat-reminders.ts`).
  - The assistant stays silent.
- Staff reply (`chats.service.ts:reply`):
  - Sets `state='human'`, clears `context.step`, `handledByUserId=staff`, and sets `handledByUserId` and `handedOverAt`.
  - Inside the window it sends text.
  - After 23 hours it sends template `chat_follow_up`: 'Hello {{1}}, you have a new message from {{2}} at OneOhm: "{{3}}" Please reply here to continue the chat.'
  - It also marks contact on the lead.

**Hand-back, three ways:**
1. The customer taps **Menu** (or types "menu"): `restart()`.
   - For a stranger this re-enters `greet`. See 3.12 and Issue 1.
2. Staff press **Release** (`chats.service.ts:release`): `state='menu'`, context reduced to `keepEntry({})`, `handedOverAt` and `handledByUserId` null. The customer is told nothing.
3. Auto hand-back (`chat-hand-back.ts`, run every 15 minutes by `crm/sales-checks.service.ts`):
   - Applies to `human` chats where no customer is waiting (`chatsWaitingSince`) and there has been no staff message for 240 working minutes since the hand-over or the last staff reply.
   - Result: `state='menu'`, with a history note "Handed back to the assistant (no reply for 4 working hours)". The customer is told nothing.
   - A customer's tap on a bot-owned button does not count as waiting.

---

## 2. Stranger (unknown number), by onboarding setting

### 2.1 Onboarding OFF (settings.enabled=false), or any message from a stranger with no lead and no `ob`

Reached from: hello or Menu → `greet` → `state='menu'` → `answer(chat,'')`. Any other typed text, media or tap from a no-lead stranger with onboarding off also lands here.

**2.1.1** Any such message → reply buttons:
> "Hello! This number is not linked to any of our customers yet. If you are interested in solar, tap "Call me back". If you are a customer with another number, please write from that number."
> [Call me back → `callback`] [Talk to a person → `human`]

Loop: every further message from this stranger, text or photo, gets the same two buttons.
- A photo or paper from a stranger with no lead is stored nowhere. The file is not kept, and `files.keep` finds no lead and logs "waits: no customer or lead".

**2.1.2** Tap "Call me back" (`callback`) → `callBack` (`stranger-flow.ts:147`):
- Calls `intake.receive` with:
  - name = WhatsApp profile name or "WhatsApp contact"
  - city "Not given"
  - source `whatsapp`
  - nextActionNote "Call back: asked on WhatsApp"
  - firstNote "Asked for a call back on WhatsApp."
  - the saved entry
- If an open lead already exists, no new lead is made:
  - Its next action is set to today and a note is added.
  - The owner is alerted.
- New lead: the owner is picked by rule. Staff alert (kind `lead_assigned`): title "New lead · WhatsApp", body "<name>, Not given. <campaign> Call back: asked on WhatsApp.". The lead throws a 409 error if nobody is eligible to own leads.
- `clearEntry`, then `toPerson`: the chat goes to `human` with no handover alert beyond the lead alert.
- Reply: "Thank you! Someone from our team will call you soon." [Menu → menu].
- Tap **Menu** → restart → clears the hold → state `menu` → the 2.1.1 buttons again.

**2.1.3** Tap "Talk to a person" (`human`) → `handOver(chat, 'leads.manage')`:
- No lead is created.
- Alert is the plain hand-over alert to the owner or the `leads.manage` desk.
- Reply: `WORDS.humanSoon` [Menu].
- Only a hello or Menu returns the stranger to the bot.

**2.1.4** While held, a stranger's typed words and files are silent plus a staff alert.
- Taps `callback` or `human` while held repeat the callback nudge or the hand-over.
- There is no lead for the typed words.

### 2.2 Onboarding ON, new number with no lead — the normal path

First message, whatever it is, e.g. "Hi", "I want solar", a photo, "Hi OneOhm DIWALI26". `onboarding.takes` is true, so `OnboardingFlowService.run` (`onboarding/onboarding-flow.ts`) runs under a row lock on the chat.

Per message `take()`:
1. A human-state chat that waited for the lock → ignore.
2. `current` = the state's step, or the first unanswered step.
3. Voice note or video → hand over (3.8).
4. Photo or paper → `takeFile` (3.6).
5. `current==='done'` → `afterEstimate` (3.11).
6. No incoming message ("hi"/resume) → `ask(current)`.
7. `wantsPerson` → hand over (3.8).
8. A tap whose id does not start with `ob:<current>:`, or typed words in a chat that is not on a step (first message, or first message after hand-back) → `ask(current)` silently.
9. "back" or a Back tap → previous step (3.3).
10. `readAnswer` → value, await (typed name or city) or **miss**.

The first reply to any first message is the language question (3.1).

### 2.3 Team-made lead (stranger with an open lead and no `ob`, onboarding on)

`takes()` is false, so `route()`:
- Hello or Menu → `greet` → `state='menu'` → 2.1.1 buttons. **See Issue 5.**
- Typed words or `other` → `passToOwner(chat, other? {summary: text})`:
  - Handover alert (summary only for `other`).
  - Reply "Thank you. {OwnerFirstName|Our team} will reply to you here." [Menu].
  - `state='human'`.
- Photo or paper → 3.7. Voice note or video → 3.7.
- Tap `callback` → 2.1.2 (nudge on the existing lead).
- Tap `human` → `handOver` with `WORDS.humanSoon`.
- Quote taps: the chat has no `customerId`, so Accept → `refuse(quoteChanged)` and a hand-over.
  - Reply "This quote has changed or is no longer open." then "Thank you. {name} will reply to you here." [Menu].
  - Quotes are only sent to customers (`quotation.customerPhone`), so this is an edge case.

### 2.4 `passToOwner` replies (reused everywhere)

- Text: "Thank you. {FirstName|Our team} will reply to you here." [Menu].
- The name is the first name of `answererFor(assignedUserId ?? handledByUserId)`.

---

## 3. Lead and onboarding, step by step

All replies are in the chosen language after step 3.1. Settings come from Settings → WhatsApp onboarding.
- `serviceCities` defaults to `[]`, so the default city question is typed free text.
- Default bill bands:

| Band id | Label | Max ₹ | System size |
|---|---|---|---|
| `up_to_1000` | Up to ₹1,000 | 1000 | 1000 Wp |
| `1000_2000` | ₹1,000–2,000 | 2000 | 2000 Wp |
| `2000_3000` | ₹2,000–3,000 | 3000 | 3000 Wp |
| `3000_5000` | ₹3,000–5,000 | 5000 | 5000 Wp |
| `over_5000` | Over ₹5,000 | none | none (expert prices it) |

- `tariffPaisePerUnit=800`, `unitsPerKwMonth=120`, `nudgeAfterHours=3`.

Generic wording (`onboard-words.ts`):
- **Retry prefix** after one unclear answer:
  - For taps: "Sorry, I did not get that. Please tap one option below."
  - For typed questions: "Sorry, I did not get that. Please type it again."
  - Then the question again.
- **Every question except the language question has "Talk to a person"** as the last row or button (`ob:person`). Most also have "Back" (`ob:<step>:back`), listed just above "Talk to a person". Lists drop Back only when they would exceed 10 rows. List button label: "Choose".
- **Two unclear answers in a row** (`misses>=2`) → hand-over (3.8). `misses` resets on any valid answer or hand-over.

### 3.1 Step `language`

Trigger: first message or "hi", with no known language.

Reply: buttons.
> "Welcome to OneOhm Solar 🙏 / OneOhm सोलरमध्ये आपले स्वागत 🙏 / OneOhm सोलर में आपका स्वागत है 🙏 / Please choose your language. / कृपया तुमची भाषा निवडा. / कृपया अपनी भाषा चुनें."
> [English → `ob:language:en`] [मराठी → `ob:language:mr`] [हिंदी → `ob:language:hi`]

Accepted: the three taps; typed "english"/"inglish", "marathi"/"मराठी", "hindi"/"हिंदी"/"हिन्दी"; 1, 2, 3. Anything else is a miss.
- Other typed text such as "ok" is a miss too.
- No "Back" or "Talk to a person" on this step.
- Typed "talk to a person" still hands over.

On answer: `wa_conversations.language` is saved. There is no lead yet. → Step 3.2.

### 3.2 Step `name`

- If the chat has a profile name:
  - > "Shall we call you {ProfileName in title case}?" [Yes → `ob:name:yes`] [Change → `ob:name:change`] [Talk to a person → `ob:person`]
  - Accepted: Yes, or typed yes, y, ok, okay, ho, haan, हो, होय, हां, हाँ → the name is the profile name.
  - Change, or typed no, change, nahi, नाही, नहीं, बदला, बदलें → "wait for a typed name".
    - > "Please type your name." [Talk to a person]
  - Any other typed text of 2–60 characters is accepted as the name (even digits).
- No profile name, or after Change: the "Please type your name." question with `[Talk to a person]` only.
- Tapping any other id is a miss.
- There is no Back button here. Typing "back" (or मागे, परत, पीछे, वापस) goes back to the language step.
  - "change", "बदला" and "बदलें" are never Back at this step.
- The name is `titleCaseName`'d. There is no lead yet.

### 3.3 Back and "back" typed (`onboarding-turn.ts:goesBack`)

- Goes to the previous step. At the first step it stays put.
- Typed `BACK` words: back, change, मागे, परत, पीछे, वापस, बदला, बदलें.
- From the typed-city prompt (after Other city) it returns to the city list.

### 3.4 Step `city`

- With a configured city list:
  > "Which city is your home or site in?" list rows: one per city (`ob:city:<City>`), "Other city" (`ob:city:other`), "Back", "Talk to a person". Button label "Choose".
  - A typed city name that matches a row, or a row number, works.
  - Any other typed text of 2–40 characters is also accepted as the city.
  - Tapping Other city → await city.
- With no list (the default), or after Other city:
  > "Please type your city name." [Back] [Talk to a person]
  - Anything 2–40 characters is accepted, including digits. A miss is anything shorter or longer.
- **On a valid city answer the lead is created** (`writeAnswer`, `onboarding-lead.ts`):
  - Calls `intake.receive` with:
    - name = answered name, else profile name, else "WhatsApp contact"
    - source `whatsapp`
    - firstNote "Started onboarding on WhatsApp"
    - nextActionNote "Finish onboarding"
    - the saved ad entry
  - The owner is chosen by rule (the city may matter) and alerted: "New lead · WhatsApp", body "<name>, <city>. Finish onboarding.".
  - A held bill (3.6) is filed onto the lead. `ob.pendingFile` is cleared and the object removed after commit.
  - `clearEntry`, since the entry is now on the lead.

### 3.5 Steps `site`, `bill`, `roof`, `floors`

All are lists, with Back and Talk to a person last. Each valid answer is written to the lead as a history note via `updateLeadFromChat` (source "WhatsApp", no user).

| Step | Question (verbatim) | Rows (title → id) | Typed shortcuts | Lead write |
|---|---|---|---|---|
| `site` | "Where do you want solar?" | Home → `ob:site:home`; Housing society → `ob:site:society`; Shop or business → `ob:site:business`; Farm → `ob:site:farm` | Words: home, house, ghar, flat, apartment, घर…; society, flat… ("flat" is ambiguous and is asked again); shop, business, office, factory, dukan…; farm, khet, शेत…; numbers 1–4. Two options named → miss. | Note "Site: …". `subsidyCategory`: individual, society or commercial. None for farm. |
| `bill` | "About how much is your monthly electricity bill?" | The configured bands' labels → `ob:bill:<bandId>` | A bare number ≤ number of bands = the option number. Otherwise an amount (₹, rs, k suffix, e.g. "2500", "3k") → the matching band. | Note "Bill: …". `estimatedWp` = the band's size. |
| `roof` | "What is the roof like?" | RCC slab → `ob:roof:rcc`; Tin sheet → `ob:roof:tin`; Other → `ob:roof:other` | rcc/slab/concrete, tin/sheet/shed/patra…, other/else | Written together with floors. |
| `floors` | "How many floors does the building have?" | Ground only → `ob:floors:1`; 2 floors → `ob:floors:2`; 3 or more → `ob:floors:3` | A number n or "g+n" → min(n, 3). | Note "Roof: <RCC/Tin sheet/Other roof>, <1 floor / N floors>". |

- The Back row on the first list after the name is "Back".
- Farm and housing society still get roof and floors questions; they only end at "no instant estimate" (3.10).

### 3.6 Step `photo` (bill photo)

> "Please send a photo of your latest electricity bill. It helps us size your system right." [Send later → `ob:photo:later`] [Back → `ob:photo:back`] [Talk to a person → `ob:person`]

- Typed "later", "skip", "no", "नंतर", "बाद में"… or 2 = later. Typed "sent" or 1 is never accepted.
- An image or document (PDF) is the real answer:
  - `files.download` → `receive`.
  - The lead exists by this step, so the file is filed as an `electricity_bill` document on the lead (`documents/lead-chat-files`). The chat message links to the document.
  - Reply (billThanks): "Thank you. File received — our team will check it."
  - Answer = `sent`.
- Unreadable or failed files are never counted as unclear answers (`misses` unchanged):
  - Too large: "This file is too large. Please send a smaller photo or PDF."
  - Download failed: "Sorry, we could not open that file. Please send it again in a little while."
  - Refused type or content: "Sorry, we could not use that file. Please send a clear photo or a PDF."
  - Unknown (null) file: "Sorry, I can only take photos and PDF papers here. Please write it in a few words, or tap "Talk to a person"."
  - After each, the same question is asked again.
- On "later": lead note "Bill photo: will send later".

**A photo or paper sent at any earlier step:**
- Lead exists: filed. The reply is "Thank you. File received — our team will check it.".
  - `photo` is then marked `sent`, so the photo question is skipped later. The current question is asked again.
- No lead yet: the file is held in object storage (`ob.pendingFile`) and the reply is "Thanks — let's first get a few details. We have your file.".
  - It is filed on the lead at the city answer.
  - A newer held file replaces the earlier one.
- A bill sent after the estimate (`done`) is also filed, and the owner is alerted. Alert kind `whatsapp_handover`, title "New bill received on WhatsApp", body "<name> · <phone>. New bill received after the estimate.".
  - The "What would you like to do next?" buttons are then sent again (Issue 10).

### 3.7 Lead made by the team, receiving files (no onboarding) — `fileOnLead` (`stranger-flow.ts:64`)

- Photo or paper: `ChatFilesService.receive` files it on the lead.
  - If filed: the lead owner (or the chat's assigned person) is alerted, title "New bill on WhatsApp", body "<name>, <city>. A new bill is filed on the lead.".
  - Reply is `fileWords(outcome)`, the same texts as above. For "unreadable" the reply is sent as buttons: "Sorry, I can only take photos and PDF papers here. …" [Talk to a person → `human`].
- Voice note or video → the lead's person via `passToOwner`:
  - Summary "Sent a voice note" or "Sent a video".
  - Reply "Thank you for the voice note. {Name|Our team} will listen to it and reply to you here." or "Thank you for the video. {Name|Our team} will watch it and reply to you here." [Menu].
- After the assistant, `files.keep` also stores the file on the newest lead (`leads/<id>/whatsapp/…`) if onboarding did not already link it, logs "Customer sent <photo/paper> on WhatsApp", and alerts. The shared alert key means the person hears once.
- For customers there are further file flows ("Which home?", "Which paper?") that this map does not cover.

### 3.8 Hand-over inside onboarding (`toPerson`, `onboarding-flow.ts:205`)

Triggers:
- The tap `ob:person`, `human` or `callback`.
- Typed exact opener ("Talk to a person" and its Marathi/Hindi forms).
- Two unclear answers in a row.
- A voice note or video.
- Typed words after the estimate (3.11).
- A site we cannot price (3.10).
- A "Menu" tap after the estimate (Issue 1).

Effects, all in one transaction:
- `ensureLead`: makes a lead if none exists.
  - Name is the answered name, else profile name, else "WhatsApp enquiry". City is the answered one or "Not given".
  - Next action is "Call — asked for a person during onboarding". For media it is "Call — sent a voice note during onboarding" or "Call — sent a video during onboarding".
  - A held bill is filed on it.
- `saveTurn` keeps `ob`.
- Hand-over alert with the summary "Onboarding answers so far: Language: English; Name: …; City: …; Site: …; Bill: … (about N kW); Roof: …; Floors: …; Bill photo: sent|will send later" (staff read English). For media it is prefixed "Sent a voice note." or "Sent a video.".
- The customer hears "Thank you. {Name|Our team} will reply to you here." [Menu], or the voice or video text from 3.7.

After the hand-over the chat is `human`. Typed words and files are silent plus a staff alert. `ob:*` taps are ignored with an alert. Menu or Hello (typed "menu" only) → 3.12.

### 3.9 Referral entry (message containing a customer's code)

Trigger: a stranger message with no `ob`, containing `code is RAME7K2Q` or `code: …` (6 to 8 alphanumerics) (`/packages/domain/src/incentives/referral-code.ts`).
- Customer-app text is typically "Hi OneOhm, my referral code is …".
- Lookup via `resolveReferralCode`.
- Unknown code, or the referrer's own number, → falls through to normal handling. That means onboarding, so the code text is treated as an answer or ignored.
- Valid code:
  - `portal.referByCode` makes a lead:
    - name = profile name or "WhatsApp contact", city "Not given", source `referral`, note "Referred by <referrer>: Messaged on WhatsApp with code <CODE>."
    - The ad entry is attached.
    - Staff alert "New lead · …" goes to the owner.
  - If an open lead already exists on the number, the customer is told "We are already in touch with this number. Thank you!" as plain text (the error message). The code consumption is aborted. The chat is otherwise not handed on.
  - Customer hears: "Welcome to {Company}! {ReferrerFirstName} referred you. Our team will call you on this number soon to plan your solar."
  - Then, if onboarding is on, `fromReferral`:
    - The name step is skipped, even when the lead's name is the placeholder "WhatsApp contact" (see Issue 8).
    - Language is skipped, so the chat is English.
    - The next open question is asked straight away, normally the city question: "Which city is your home or site in?" or the typed city prompt. The rest of the flow is as in 3.4 to 3.11.
  - Onboarding off: only the welcome. Later messages go to `passToOwner` (2.3).

### 3.10 Estimate (end of onboarding, `onboarding/estimate.service.ts`)

After `photo` is answered, `nextStep` returns `done` and `finish`:
- Ensures a lead exists. If its lead was closed along the way it makes a new one, with next action "Call — finished onboarding".
- State goes to `onboard:done`.
- `EstimateService.make` prices with the real quotation engine:
  - Panel is the owner's configured one or `suggestPanel`, plus an on-grid inverter mix. Distance is 0 km.
  - It writes a `lead_estimates` row.
  - It writes a note: "Estimate sent: {size}, {price} ({after} after subsidy)."
  - Next action is today: "Call — estimate sent ({size}, {price})".
- **Sent estimate:**
  1. A PDF (document, filename built from `customerPdfName`).
     - Caption: "Your solar estimate: {size}, {price} ({after} after subsidy). You could save up to {saving} a month.\nEstimate — final price in your quotation after a free call or visit."
     - The document link is a shared file URL (`file-links.ts`).
  2. Buttons: "What would you like to do next?" [Call me back → `ob:done:call`] [Talk to a person → `ob:person`] [Not now → `ob:done:notnow`].
- **Expert (no instant price):** bands with no `targetWp` (default "Over ₹5,000"), a farm site, a housing society, an "Other" roof, missing catalogue products, or a pricing error.
  - The lead's next action is today: "Call — price by hand (<reason>)", with a history note.
  - Hand-over with summary "…. No instant estimate: <reason>".
  - The customer gets: "Thank you! Our expert will prepare your price and call you." [Menu]. State is `human`.

### 3.11 After the estimate (`afterEstimate`, `estimate-next-steps.ts`)

Taps:
- **3.11.1 Call me back (`ob:done:call`).**
  - The lead's next action is today, or tomorrow if past 18:30 (using the tap's own time).
  - Note "Asked for a call today|tomorrow morning after the estimate". It is written once a day and is not repeated on a second tap the same day.
  - Staff alert kind `whatsapp_callback`, title "Call back today|tomorrow morning: asked after the estimate", body "<name> · <phone>", one per chat per day.
  - The customer hears: "Thank you. {Name|Our team} will call you today|tomorrow morning." [Talk to a person → `ob:person`].
  - The chat stays on `onboard:done`, not `human`.
- **3.11.2 Not now (`ob:done:notnow`).**
  - List: "When should we check back with you?" rows In 1 week (`ob:done:later:1w`), In 1 month (`ob:done:later:1m`), In 3 months (`ob:done:later:3m`), Talk to a person. Button "Choose".
  - A pick sets the lead's next action to that date: "Check back (customer chose)". History note "Not now after the estimate: check back in 1 week".
  - The customer hears: "Thank you! We will check back with you then." [Call me back] [Talk to a person].
  - Nothing is sent to the customer at check-back time. It is a staff task only.
- **3.11.3 Talk to a person (`ob:person`).** The 3.8 hand-over.
- **3.11.4 Anything else** (typed words, a sticker, a 👍 or reaction, an "ok", "thanks", an old `ob:*` tap, a "hi", "menu" or the nudge's Continue) → `toPerson` hand-over (3.8).
  - The customer hears "Thank you. {Name} will reply to you here." [Menu].
  - Staff are alerted with "Someone wants to talk on WhatsApp".
  - See Issue 1 and Issue 2.

### 3.12 Menu or "hi" after a hand-over (stranger or lead)

- `restart()` clears `handedOverAt` and `handledByUserId`, then `greet` → `onboarding.resume` → `run(chat, null)`.
- If answers are incomplete: the current open question is asked again, and state goes to `onboard:<step>`.
- If all questions are answered: `current==='done'` → 3.11.4, so it hands over again. See Issue 1.

### 3.13 Nudges and unattended chats (`onboarding-nudges.service.ts`, `onboarding-nudge-rules.ts`)

A job runs every 5 minutes, per chat under a lock.
- **Candidates:** state `onboard:<step>` and not `onboard:done`; no customer; silent less than 7 days; not an existing customer; opted-out chats are still candidates for a lead but never get a nudge.
- **Lead for a silent chat with none**, after `clamp(nudgeAfterHours, 3, 22)` hours:
  - `ensureLead` with next action "Call — stopped at <step> question".
  - Any held bill is filed.
  - `ob.followedUpAt` is set.
  - Staff get the usual "New lead · WhatsApp" alert.
- **One nudge**, only if:
  - `nudgeAfterHours > 0`
  - it is working time
  - the silence is between nudge-hours and 23 hours
  - there is an open lead
  - the chat was never nudged
  - not opted out
- Nudge text: "Shall we continue? It takes a minute." [Continue → `ob:continue`] [Talk to a person → `ob:person`].
  - Dedupe key `ob_nudge:<chatId>`. The nudge is a session message, so it only goes inside the 23-hour window.
  - The lead's next action becomes today: "Call — stopped at <step> question", with note "Customer stopped at the <step> question; nudged on WhatsApp".
- Tap Continue (`ob:continue`) → `ask(current)`. It does not start with `ob:<current>:`, so the question is simply asked again.
- Nothing nudges a chat that finished onboarding (`onboard:done`) or that a person holds (`human`).
- A run records its outcome in background runs (`onboarding_nudges`).
- "Run now" is `POST v1/whatsapp/onboarding-nudges/run`, for staff with `settings.manage`.

---

## 4. Hand-over and hand-back, what the customer hears

| When | What they hear | Staff side |
|---|---|---|
| Stranger taps `human` with onboarding off | `WORDS.humanSoon` (hours text) [Menu] | Alert "Someone wants to talk on WhatsApp"; no lead |
| Stranger taps `callback` | "Thank you! Someone from our team will call you soon." [Menu] | Lead made, or the existing lead nudged; no separate hand-over alert |
| Onboarding hand-over of any kind | "Thank you. {Name\|Our team} will reply to you here." [Menu] | Alert with summary; lead made if none |
| Voice note or video, first or at any step | "Thank you for the voice note. {Name\|Our team} will listen to it and reply to you here." or the video equivalent [Menu] | Alert with "Sent a voice note" or "Sent a video"; call lead |
| Expert-priced site | "Thank you! Our expert will prepare your price and call you." [Menu] | Alert; next action "Call — price by hand (<reason>)" |
| Typed words while held | Nothing | Staff alert per message; chat reminders at 30 min (owner) and 2 h (desk) |
| Typed words or a hello while held, outside hours | One calm reply a night, if the hand-over message was not already after 18:30: "Thank you. We reply from 9:30 am to 6:30 pm. Your message is with {name\|our team}." | Staff alert |
| Staff reply | Their text, or the `chat_follow_up` template after 23 hours | Chat set to `human`, owned and handled by the replier |
| Staff Release | Nothing | `state='menu'`, hold cleared |
| Auto hand-back after 4 working hours of quiet | Nothing (history note only) | State `menu` |
| Customer taps Menu | Onboarding question, or the stranger buttons (2.1.1); post-estimate: a new hand-over (Issue 1) | `handedOverAt` cleared |

---

## 5. Issues seen

1. **Menu or "hi" after the estimate re-hands-over (loop), and it is the same for "hi" or "menu" typed while not held.**
   - `onboarding-flow.ts:121` sends `current==='done'` to `afterEstimate`, and `:198` calls `toPerson` for anything that is not an estimate tap.
   - With `incoming=null` (resume), `estimate-next-steps.ts` returns false, so another "Someone wants to talk" alert goes out and the customer hears "Thank you. X will reply to you here." again.
   - Every Menu button on those replies leads straight back into another hand-over.
   - Reaching Menu from a held post-estimate chat is the common case.
   - This comes from reading the code. No acceptance test covers it.
2. **"ok", "thanks", "👍" and reactions after the estimate hand over** (`onboarding-flow.ts:121,198`).
   - `thanksOnly` and `isThanks` exist only on the customer branch (`assistant.service.ts:94`).
   - A reaction is kind `other`, quiet for the log but not quiet here, so it triggers a full hand-over alert.
3. **A reaction or sticker mid-onboarding counts as an unclear answer** (`onboarding-flow.ts:125-142`).
   - Kind `other` with text like "Reaction 👍" is passed to `readAnswer`, which returns a miss. Two in a row hand the chat over.
   - A location pin sent at the city step is a miss too.
   - Typed "ok", "yes please", "help", "call me" or "I want to talk" also count as misses, because `wantsPerson` only matches three exact opener phrases.
4. **Silent re-ask on a stale tap** (`onboarding-flow.ts:128`).
   - A tap on an old list row or old Back, or the nudge's Continue, just re-asks the current question with no explanation and no "retry" wording.
   - The customer taps and nothing seems to happen.
5. **A lead the team made gets the "not linked to any customer" text on a hello** (`assistant.service.ts:78`, `words.ts:28`).
   - `restartsChat` wins before `stranger()`, so a team-made lead who says "Hi" is told "This number is not linked to any of our customers yet. If you are interested in solar, tap "Call me back"…".
   - Typed non-greeting words go to their person, so the behaviour differs depending on the first word.
6. **Onboarding off: dead-end loop and silent file loss** (`stranger-flow.ts:106`).
   - Every message gets the same two buttons. A bill photo is neither stored nor acknowledged, except by those buttons. `files.keep` only logs it.
7. **"Talk to a person" with onboarding off creates no lead** (`stranger-flow.ts:109`).
   - It only alerts staff with the hand-over key. If nobody is on the desk the person is invisible in CRM.
8. **Referral entry skips the name step and the language step** (`onboarding-flow.ts:104`, `nextStep('name', …)`).
   - A referral with no profile name gets the lead name "WhatsApp contact", never asked.
   - The language question is never shown, so these customers are English-only unless the chat language already exists.
   - Marathi or Hindi referees also get "Welcome to {company}!" in English, since language is not known.
9. **Name step has no Back button** (`onboarding-replies.ts:60`).
   - A wrong language choice cannot be undone by tapping. Typing "back" works but is never offered. After onboarding there is no in-chat way to change language at all.
10. **A bill sent after the estimate re-sends the "What would you like to do next?" buttons** (`onboarding-flow.ts` `takeFile` then `ask(turn, 'done')`).
    - It also sends "Thank you. File received — our team will check it.". The call-back and not-now choices come back as if nothing was decided.
    - A customer who already chose "Call me back" sees the question again.
11. **Hours text is inconsistent and untrue on Sunday** (`words.ts:75`, `chat-rules.ts:46`).
    - `humanSoon` says "Monday to Saturday", but `isWorkingTime` has no day check, so Sunday counts as working time. Holidays do too.
    - Onboarding hand-over replies and `passedToOwner` give no hours at all.
    - Hours appear only in `humanSoon` and `nightReply`.
    - At night the hand-over reply counts as the "calm reply" (`hand-over.ts:155`), so `nightReply` (the one place that names hours) usually never fires after a night hand-over.
12. **STOP typed while held fires a staff alert and a night reply before the STOP confirmation** (`whatsapp-webhook.controller.ts:129-134`).
    - `handle()` alerts and runs `nightReply` before `assistant.handle` reaches `answerOptOut`.
    - The customer may get "Thank you. We reply from 9:30 am to 6:30 pm…" right after typing STOP.
13. **Opted-out numbers still get all conversational replies** (worker `delivery.activities.ts`).
    - Opt-out stops templates only. A stranger who sent STOP and then writes again is onboarded normally, with no reminder that they opted out.
    - The nudge is correctly suppressed.
    - Tapping Menu on the STOP/welcome-back message does not clear the opt-out. Only START or "Start again" does.
14. **Held chat swallows onboarding taps silently** (`handled-taps.ts:14,35`).
    - `STRANGER_TAPS` contains only `callback` and `human`. A tap on `ob:person` or any `ob:*` row while the chat is `human` is ignored (and alerts staff), instead of being treated as "I want a person".
    - After a staff reply, an earlier list the customer taps does nothing.
15. **Confusing, robotic or copy-driven wording:**
    - "Sorry, I did not get that. Please tap one option below." is shown even when the question is a typed one on the buttons variant (`notClear` vs `notClearTyped`). The language question uses the tap variant.
    - "Shall we call you {ProfileName}?" uses the raw WhatsApp profile name, which is often an emoji, initials or a brand name.
    - The Hindi hand-over for the estimate uses `{name ?? 'हमारी टीम'}`, while the Marathi differs in structure. Check parity.
    - "Thank you. File received — our team will check it." is the reply for both a bill and any paper, so it never says what was received.
    - The estimate caption carries a long second line: "Estimate — final price in your quotation after a free call or visit."
    - The estimate has no reply to "ok"/"thanks" (Issue 2).
16. **Quote taps from a lead or stranger** (`quote-actions.ts:~70`).
    - Anyone whose chat has no `customerId` gets "This quote has changed or is no longer open." plus a hand-over, whichever quote button they tap. This is unlikely in practice, since quotes are sent only to customers.
    - Quote sharing, acceptance and payment happen only once the lead is a customer (customer-side buttons "Accept quote", "I have a question", "Yes, accept", "Not yet", "Pay now"). See `quotation-message.ts` and `quote-actions.ts`.
17. **Late-tap drop is silent** (`inbound-retry.ts`, `whatsapp-webhook.controller.ts:~84`).
    - A tap older than the chat's newest message by 1 second or more is ignored with no reply. After a nudge or two quick taps, a legitimate tap can vanish.
18. **Failure handling is invisible to the customer** (`whatsapp-webhook.controller.ts:~103-122`).
    - If handling throws, the message is forgotten, staff are alerted ("A WhatsApp message was not handled") and Meta retries. The customer sees nothing, and the 500 can repeat.
19. **Coincidental sharing of "start".**
    - "start" is a greeting, a START opt-in word and a campaign non-code. For a non-opted-out chat it is a hello, so a person who types START meaning "begin" gets onboarding, which is fine, but for an opted-out one it gets "Welcome back!" first and the onboarding only on the next message.