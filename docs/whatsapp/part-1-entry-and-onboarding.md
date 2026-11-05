# WhatsApp conversation map: everything before a person is a known customer, plus routing

> **Updated after the redesign (phase 7, 2026-11-05).** This page describes the stranger, lead and onboarding flows as they are now;
> the changes against the old map are marked **(new)**, and section 5 lists every old issue with what became of it. For the
> customer side see [flow-map.md](flow-map.md) and [redesign.md](redesign.md).

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
   - `isLateTap`: a button or list tap at least 1 second older than the chat's newest inbound. **(new)** It is answered, never dropped: "That was an
     earlier message — here is the latest." and then the question the chat is on (strangers) or Home (customers); in a held chat only the first line.
   - Customers' files are stored before the assistant runs (`files.keep`).
   - `handle()`:
     - If `state==='human'` and the assistant does not own this message, **staff are alerted** (`tellAnswerer`) and `nightReply` runs
       (**new:** not for STOP — the confirmation comes first and alone).
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
   - **(new)** A stranger who stopped and writes again hears once (per STOP) "You stopped our WhatsApp messages earlier… Tap "Start again"" with
     [Start again]; their words are still answered (`tellOptedOut`).
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
      - Owned means: the taps `menu`, `start`, a quote tap, a stranger's `callback`, `human` or **(new)** `ob:person`, and (customers only) menu ids, paper taps, ratings and home or paper rows.
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
- `isWorkingTime` knows Sunday: **(new)** no working minutes on a Sunday (holidays are not known). `replyTime` says "now", "today from 9:30",
  "tomorrow from 9:30" or "on Monday from 9:30" (after Saturday evening and all Sunday).
- **Customer-facing hours text (new):** every hand-over reply names who replies and when: "{name} will reply here (Mon–Sat, 9:30–6:30)" or
  "…tomorrow from 9:30" (`CHAT_WORDS.talkReply`, `passed`, `passedUnknown`, `nightReply`); the promised call says today, tomorrow morning or
  on Monday morning. The old `humanSoon` text is gone.
- **`nightReply`** (`hand-over.ts`): runs only for a held chat when the customer writes something the assistant does not own, outside working hours,
  with Settings → Reminders → `whatsappNightReply` on, and only once a night (our side has not already sent a non-note, non-staff message since the
  last 18:30; the hand-over reply counts). It is sent after the staff alert, in the customer's language. **(new)** Never for STOP.
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

### 2.1 Onboarding OFF (settings.enabled=false), or a stranger with no lead and no `ob`

A hello, Menu or any typed text → reply buttons: "Hello! This number is not linked to any of our customers yet. If you are interested in solar, tap
"Call me back". If you are a customer with another number, please write from that number." [Call me back → `callback`] [Talk to a person → `human`].

- **Call me back** → `callBack`: a lead (`intake.receive`; name = a usable profile name, else "WhatsApp contact"; city "Not given"; note "Call back:
  asked on WhatsApp"), owner by rule and alerted, the chat goes to `human`; "Thank you! Someone from our team will call you soon." [Menu].
- **Talk to a person** → **(new)** `talkToPerson`: makes the lead the same way when there is none ("Call — asked for a person on WhatsApp"), or
  passes the chat to the lead's person ("Thank you. {name} will reply to you here (Mon–Sat…)"); a held chat tapping it again (also the onboarding
  `ob:person`) is answered the same way, not swallowed.
- **A photo, paper, voice note or video (new):** a lead is made when there is none ("Call — sent a file on WhatsApp"), the file is filed on it (bill
  document) and the reply is honest: "Thank you. We have your file and our team will check it and call you." Voice notes and videos go to the
  lead's person as in onboarding.
- While held, typed words and files are silent plus a staff alert, as before.

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
- **Hello or Menu (new)** → `greet` → "Hi {first name} 👋 {owner} from OneOhm is helping you." [Talk to {owner}] [Quick estimate] (the team when nobody
  owns it). Never "not linked to any customer". **[Quick estimate]** (`ob:quick`) starts the onboarding questions on that lead (the language first).
- Typed words or `other` → `passToOwner` ("Thank you. {FirstName} will reply to you here (Mon–Sat…)", state `human`, summary only for `other`).
- Photo or paper → filed on the lead (3.7). Voice note or video → the lead's person.
- Tap `callback` → the nudge on the existing lead; tap `human` → `passToOwner`.
- Quote taps from a chat with no customer get "This quote has changed or is no longer open." and a hand-over (quotes are only sent to customers).

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

- If the WhatsApp profile name is a name we may use **(new, `usableName`)** — at least two letters, no digits or emoji, no business word (solar,
  energy, traders, enterprises…) — "Shall we call you {Name in title case}?" [Yes] [Change] [Talk to a person].
  - Yes (or typed yes, y, ok, ho, haan, हो, होय, हां) → that name. Change (or no, nahi, नाही, नहीं, बदला, बदलें) → "Please type your name."
- No usable profile name (an emoji, initials, a shop), or after Change: "Please type your name." with [Back] [Talk to a person]. A typed answer must
  pass the same check; otherwise "Sorry, we did not get that…" and "Please type your name in letters, like Suresh Patil." (**new:** Back is offered).
- Typed "back" (or मागे, परत, पीछे, वापस) goes back to the language step; "change", "बदला", "बदलें" are never Back here.
- The name is `titleCaseName`'d. There is no lead yet.

### 3.3 Back and "back" typed (`onboarding-turn.ts:goesBack`)

- Goes to the previous step. At the first step it stays put.
- Typed `BACK` words: back, change, मागे, परत, पीछे, वापस, बदला, बदलें.
- From the typed-city prompt (after Other city) it returns to the city list.

### 3.4 Step `city`

- With a configured city list: "Which city is your home or site in?" rows: one per city (`ob:city:<City>`), **(new) "📍 Send location"** (`ob:city:pin`,
  left out only when the list is full), "Other city", "Back", "Talk to a person". With no list (the default) or after Other city: "Please type your
  city name." [📍 Send location] [Back] [Talk to a person].
- **[📍 Send location] (new):** WhatsApp's own location button ("Tap the button to share your location. We use it to find your city."). A pin whose
  place name or address contains a served city fills the city; any other pin is kept ("Thanks, we have your location. Which city is it in?" and the
  question again) and lands on the lead as the note "Location pin: https://maps.google.com/?q=lat,lng" when the city makes it. No unclear answer.
  A reaction or a sticker is also never an unclear answer.
- A typed city name that matches a row, or a row number, works; any other text of 2–40 characters is also accepted as the city.
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
- Real words after the estimate (3.11); "ok", thanks, 👍 and Menu are not hand-overs any more.
- A site we cannot price (3.10).

Effects, all in one transaction:
- `ensureLead`: makes a lead if none exists.
  - Name is the answered name, else profile name, else "WhatsApp enquiry". City is the answered one or "Not given".
  - Next action is "Call — asked for a person during onboarding". For media it is "Call — sent a voice note during onboarding" or "Call — sent a video during onboarding".
  - A held bill is filed on it.
- `saveTurn` keeps `ob`.
- Hand-over alert with the summary "Onboarding answers so far: Language: English; Name: …; City: …; Site: …; Bill: … (about N kW); Roof: …; Floors: …; Bill photo: sent|will send later" (staff read English). For media it is prefixed "Sent a voice note." or "Sent a video.".
- The customer hears "Thank you. {Name|Our team} will reply to you here." [Menu], or the voice or video text from 3.7.

After the hand-over the chat is `human`. Typed words and files are silent plus a staff alert. **(new)** `ob:person` is answered again (not swallowed); other old `ob:*` taps are ignored with an alert. Menu or Hello (typed "menu" only) → 3.12.

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
    - **(new)** The first open question is asked straight away: the language if the chat has none, then the name when the lead's name is the placeholder
      "WhatsApp contact" or the profile name cannot be used, then the city it lacks. The lead's name is a usable profile name or the placeholder (never
      an emoji). The welcome itself is in English because the language is not known yet. The rest of the flow is as in 3.4 to 3.11.
  - Onboarding off: only the welcome. Later messages go to `passToOwner` (2.3).

### 3.10 Estimate (end of onboarding, `onboarding/estimate.service.ts`)

After `photo` is answered, `nextStep` returns `done` and `finish`: it ensures a lead (a new one with next action "Call — finished onboarding" if it was closed
on the way), prices with the real quotation engine (the owner's panel or `suggestPanel`, on-grid inverter mix, distance 0), writes a `lead_estimates` row, a
note "Estimate sent: {size}, {price} ({after} after subsidy)." and the next action today "Call — estimate sent (…)".

- **Sent estimate:** the PDF with its caption, then "What would you like to do next?" **[Book a visit] [Call me] [Not now]** (new; ids `ob:done:visit`,
  `ob:done:call`, `ob:done:notnow`). "Talk to a person" is typed or follows each answer.
- **Expert (no instant price):** a band with no size, a farm, a housing society, an "Other" roof, missing catalogue products or a pricing error → next action
  "Call — price by hand (reason)", a hand-over with "No instant estimate: reason"; the customer hears "Thank you! Our expert will prepare your price and call you." [Menu].

### 3.11 After the estimate (`onboarding-after.ts`, `estimate-next-steps.ts`, `estimate-visit.ts`)

- **Book a visit (new):** a new contact has no customer record yet, so the visit cannot be a visit record. The free days of the lead's owner (the same days as a
  customer's pick, leave and booked slots excluded, Mon–Sat, 45 days) are a list with [Talk to a person]; a day gives [Morning] [Afternoon] for what is free;
  the pick sets the lead's next action to that day ("Confirm the site visit the customer picked"), a history note, an alert to the owner, and tells the customer
  "{name} will confirm your visit by 6:30 pm today / tomorrow 12 noon / Monday 12 noon". Nothing is reserved until the owner books the visit. A past, Sunday or
  taken day is refused with the list again. Once the lead has a customer record the usual visit ask (Send to customer) applies.
- **Call me:** next action today (or the next working morning by the tap's time), note "Asked for a call today|tomorrow morning|on Monday morning after the
  estimate" (once a day), alert `whatsapp_callback` once a day, "Thank you. {name} will call you …" [Talk to a person]. The chat stays on `onboard:done`.
- **Not now:** "When should we check back with you?" [In 1 week] [In 1 month] [In 3 months] [Talk to a person] → next action that date ("Check back (customer
  chose)"); "Thank you! We will check back with you then." [Call me] [Talk to a person]. Nothing is sent to the customer at check-back time; it is a staff task.
- **Anything else (new):** "ok", "thanks", 👍, a sticker → "You are welcome! Tap an option whenever you are ready."; a reaction → nothing; "hi" or Menu → the
  three options again, once; an old tap → "That was an earlier message — here is the latest." and the options; a bill → filed, "Thank you. File received…",
  the owner told, **no** option buttons again; real typed words → the 3.8 hand-over to the owner. No hand-over loop, no alert for small talk.

### 3.12 Menu or "hi" after a hand-over (stranger or lead)

`restart()` clears `handedOverAt` and `handledByUserId`, then `greet`: onboarding resumes at the open question; a finished onboarding shows the estimate options
(3.11); a team-made lead gets the hello (2.3); a stranger with onboarding off gets the two buttons (2.1).

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
| Stranger taps `human` with onboarding off | "{name} will reply here (Mon–Sat, 9:30–6:30)" [Menu] | Lead made or updated, alert "Someone wants to talk on WhatsApp" |
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

## 5. Issues seen in the old map, and what happened to each

All 19 issues of the old map were fixed or removed in phase 7 (acceptance `71-onboarding-fixes`, `71-onboarding-flow`).

| # | Issue | Now |
|---|---|---|
| 1 | Menu or "hi" after the estimate re-hands-over (loop) | Shows the three options again; no hand-over, no alert |
| 2 | "ok", "thanks", 👍, reactions after the estimate hand over | One short word (a reaction: nothing); only real words reach the owner |
| 3 | A reaction, sticker or pin mid-onboarding counts as an unclear answer | Never a miss; a pin at the city question is the city; others ask the question again |
| 4 | Silent re-ask on a stale tap | "That was an earlier message — here is the latest." then the question |
| 5 | A team-made lead saying "hi" is told "not linked to any customer" | "Hi {name} 👋 {owner} from OneOhm is helping you." [Talk to {owner}] [Quick estimate] |
| 6 | Onboarding off: dead end, bills lost | A bill or voice note makes/updates a lead, is filed on it and the reply says so |
| 7 | "Talk to a person" with onboarding off creates no lead | Creates or updates the lead, then the hand-over |
| 8 | Referral entry skips language and name, silently "WhatsApp contact" | Asks the language, then the name when unknown (never an emoji name) |
| 9 | Name step has no Back | The typed-name question offers [Back]; language is changed under More once a customer |
| 10 | A bill after the estimate re-sends the next-step buttons | Thank-you and owner alert only |
| 11 | Hours text untrue on Sunday and missing in replies | Mon–Sat 9:30–6:30 in every hand-over reply; Sunday says Monday |
| 12 | STOP while held sends a night reply first | STOP is confirmed alone (staff are still told the customer wrote) |
| 13 | Opted-out strangers writing again are not told | Told once per STOP how to start again [Start again] |
| 14 | Held chat swallows an onboarding "Talk to a person" tap | `ob:person` is the bot's own tap: answered, person told again |
| 15 | Robot wording (I / "File received") | "We" voice; names only when usable; emoji/brand names asked to type |
| 16 | Quote taps from a lead or stranger | Unchanged: quotes are only sent to customers |
| 17 | Late-tap drop is silent | Answered with the "earlier message" line (strangers and customers) |
| 18 | Failure handling invisible to the customer | Unchanged: staff are alerted and Meta retries (no customer-facing text on purpose) |
| 19 | Coincidental sharing of "start" | Unchanged: START only counts for an opted-out chat |
