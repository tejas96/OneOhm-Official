# WhatsApp assistant: files, papers and problems for a known customer, as the code stands

All paths below are under `/Volumes/works-space/oneohm-official/OneOhm-Official/.claude/worktrees/papers-per-home`. The API short path `W/` means `apps/api/src/modules/whatsapp`, and `W/a/` means `W/assistant`. Every customer-facing string also exists in Marathi and Hindi (`words-mr.ts`, `words-hi.ts`, `customer-message-mr.ts`, `customer-message-hi.ts`). The language comes from `customers.preferred_language`. Staff alerts are English only.

I read the code only; I did not run it. Where I infer behaviour, I say so.

---

## 0. Plumbing that runs before any reply (`W/whatsapp-webhook.controller.ts`)

Every inbound message goes through these steps in order.

- **P1. Chat lookup** (`:89`). The chat is upserted by phone and linked to the customer. A family contact's number maps to the same customer. The chat gets an owner via `ensureChatOwner`.
- **P2. Duplicate** (`:90`). If the `wamid` is already logged, the message is skipped silently.
- **P3. Assistant tap** (`:91`). If `assistantAnswers(chat, msg)` is true, the inbound row is flagged `assistantTap`, so it does not count as "customer waiting".
- **P4. Late tap** (`:92`, `W/inbound-retry.ts:12`). A button or list tap whose timestamp is at least 1 s older than the chat's newest inbound is dropped silently. The log says "Ignored a late tap". The customer hears nothing.
- **P5. Store the file first** (`:98`, `W/chat-file-keeper.ts:52`). For a known customer, every file is downloaded, type-checked from its bytes, and stored once. It is stored as a `documents` row with category `other`, no project, no home, under the customer. It is linked to the chat message. A Meta retry reuses the same document.
  - Allowed types: photos (JPEG, PNG, WebP, HEIC), PDF, audio, video, Word (.docx) and Excel (.xlsx). Word and Excel are kept but never count as an answer to a request.
  - Caps: audio 10 MB, video 60 MB, other 25 MB.
  - The live WhatsApp gateway caps every download at 25 MB (`W/media-gateway.ts:158`).
- **P6. If the chat is held** (`state='human'`) and the message is not one the assistant answers (`:132`):
  - The chat's people get an alert: kind `whatsapp_message`, title `WhatsApp from {profileName|phone}`, body = text (140 chars) or `Sent a photo` / `Sent a document` / `Sent a video` / `Sent a voice note` / `Sent a message`, key `wa_in:{wamid}`. They are the answerer and owner, else the `service.manage` desk.
  - Then `nightReply`: once per night, outside working hours, if the setting is on: `Thank you. We reply from 9:30 am to 6:30 pm. Your message is with {Name or "our team"}.`
- **P7. Assistant handles it** (see §1.2).
- **P8. On failure** (`:104-108`). The team gets an alert, kind `whatsapp_not_handled`, title `A WhatsApp message was not handled`, body `A WhatsApp message from {name} could not be handled — please check the chat. They sent: {text|a file}`. The inbound row is deleted so Meta's retry is processed, and the webhook returns 500. Replies already queued before the failure are not rolled back, so a retry can produce duplicates (inference from `queueReply` having no dedupe key by default).
- **P9. `settle`** (`:112`, `W/chat-file-keeper.ts:85`). Runs after the assistant for a customer's file.
  1. If the document answered a request or sits on a problem (`answersSomething`), do nothing. The asker or the complaint's people already heard.
  2. If the document is already filed (home set, on a problem, category not `other`, or it answers a request), only alert: `tellKept`.
  3. Otherwise, re-read the chat. If a home is now decidable (`homeForFile`), file it there as `other`. Voice notes, videos and Word/Excel always go in as `other`. If no home is decidable, it stays unfiled.
  - `tellKept` alert: kind `whatsapp_message`, title `WhatsApp from {name}`, body `Sent {a photo|a document|…}. Saved in Documents.` It appends `, to sort: no home yet` when unfiled. The key is `wa_in:{wamid}`, the same as P6, so a held chat hears once.
  - A non-held voice note or video skips `tellKept`, because the hand-over alert already went (`:220`).
  - On an exception: alert kind `whatsapp_file_failed`, title `WhatsApp file not filed`, body `{name} sent {a photo}. It is in their Documents, but could not be put on their home.`
- **Refused or unstorable file** (`W/chat-file-keeper.ts:199-209, 230`). The team gets an alert. Kind `whatsapp_file_failed`, title `WhatsApp file not saved`, body `{name} sent {a photo}, but it could not be saved ({reason}). Ask them to send it again.` Reason examples:
  - `Upload a photo, a PDF, a voice note (M4A, MP3, AAC, WebM, Ogg) or a video (MP4, MOV, WebM).`
  - `This voice note is larger than 10 MB.`
  - A gateway too-large error carries no reason.

---

## 1. Customer sends something (FILES)

### 1.1 Order of checks in `W/a/assistant.service.ts` `answer()`

1. STOP or START, handled in `handle()` before anything (`:62`).
2. `restartsChat` (`:78`). For media, the "word" is the caption or file name, and only the whole message counts.
   - If the caption is exactly `hi`, `hello`, `hey`, `start`, `namaste`, `menu` and similar, the assistant shows the menu list and the file is not offered to any flow. `settle` still files it.
   - In a held chat only `menu` counts.
3. `heldByPerson` (`:80, :121`). If `state==='human'` and the message is not one the assistant answers:
   - A customer's media goes to `media.receive(held=true)`.
   - Then the assistant returns silently.
   - For media, `assistantAnswers` is true only when the held step is `await_problem` (`handled-taps.ts:50`).
4. No customer, so the stranger/onboarding flow (out of scope).
5. Text equal to the "Talk to a person" opener goes straight to hand-over (§4).
6. `incoming.media` goes to `MediaIntakeService.receive` (§1.3).
7. `incoming.kind==='other'` goes to `tellSent` (§1.9).

### 1.2 Step state

- Steps: `await_home`, `await_problem`, `await_referral`, `await_comment`, `await_file_home`, `await_file_paper` (`chat-step.ts:5`).
- A step goes stale after 30 minutes (`STEP_MINUTES`). `stepOf` then reads it as `menu`.
- In a held chat the step lives in `context.step` and the state stays `human` (`setStep`, `:49-58`).
- `setState` keeps only these context keys: `entry`, `ob`, `paperWait`, `fileHome`, `filePaper` (`chat-store.ts:207-213`). Everything else is dropped on any `setState`, `setStep` or Menu tap: `toSort`, `pending`, `raised`, `projectId`, `filedMedia`, and so on.

### 1.3 `MediaIntakeService.receive` (`W/a/media-intake.ts:76`), per branch

**Definition of "held" here:** `held = state==='human' && stepOf(chat) !== 'await_problem'`.

#### 1.3.1 Voice note or video (`:86-91`)

- **Trigger:** `media.type` is `audio` or `video`, for any customer.
- **Step 1:** `homes.sortLater`. If the customer has 2+ homes with no decidable home, and the file was stored, the document is added to `context.toSort`. No question is asked. Otherwise nothing happens; `settle` later files it as `other` on the decidable home.
- **Step 2:** if held, return silently. The P6 alert and the night reply cover it.
- **Step 3 (not held), the words:**
  - Audio: `Thank you for the voice note. {FirstName|Our team} will listen to it and reply to you here.`
  - Video: `Thank you for the video. {FirstName|Our team} will watch it and reply to you here.`
  - The name is the answerer's first name (`answererName`).
- **Buttons:** `Menu` (id `menu`).
- **Side effects (`hand-over.ts:60-87`):**
  - `toPerson`: state becomes `human`, `context.step` is removed, `handedOverAt` is set.
  - A hand-over alert goes to the owner via `tellChatTeam`, or the `service.manage` desk if there is no owner. Kind `whatsapp_handover`, title `Someone wants to talk on WhatsApp`, body `{profileName|A customer} · {phone}. Sent a voice note` (or `Sent a video`). Key `wa_handover:{chatId}:{lastInboundWamid}`.
- **Gaps:**
  - The customer is told "will listen" even if the file was not stored (too large or refused). The staff alert from P5 is the only trace.
  - If sent during a complaint step, the step is wiped and the complaint is never raised.
  - If sent just after a complaint was raised, it is not attached. The app allows one video and one voice note per request.
  - Voice notes and videos are stored as `other` on a home or left unfiled. After 2 hours unfiled with 2+ homes, staff get the `papers_to_sort` alert (§2.7).

#### 1.3.2 Complaint step: `await_problem` and a photo, PDF or Word file (`:93-100`)

- **Trigger:** `stepOf==='await_problem'` (not stale).
- **If the file was not stored (`storedOrSay`, `:172`):**
  - Too large: `This file is too large. Please send a smaller photo or PDF.`
  - Any other failure, including an unsupported type: `Sorry, we could not open that file. Please send it again in a little while.`
  - Both are plain text with no buttons. The step stays `await_problem`.
- **Otherwise,** the pending earlier files are collected. These are files kept by `keepForProblem` in the last 60 minutes, at most 6. Words = the caption (empty if the "caption" is just the file name). It goes to `ProblemFlowService.raise` (§3.4).

#### 1.3.3 A problem was raised in the last 30 minutes (`:101-105`)

- **Trigger:** `context.raised` is set and younger than 30 min (`problem-flow.ts:16,25`), the step is not `await_problem`, and the media is not audio or video.
- **Effect:** ANY photo, PDF or Word file goes to `addPhoto`. The file is not offered to paper requests or "Which home?". This happens even when a person holds the chat.
- **Accepted:** photos only (`customer-request-photos.service.ts:81`), at most 6 per request, and the request must not be resolved.
- **Words if accepted:** `Thank you, the photo is added to your request.`
- **Words if refused** (a PDF, Word file, 7th photo, or resolved request): `We could not add the file to the request. Please send a photo of the problem.`
- **Buttons:** `My requests` (id `requests`), `Menu` (id `menu`).
- **Side effects:** the document is re-filed with category `site_photo` and `serviceRequestId`. `settle` then does nothing (`answersSomething`). There is no staff alert for each photo; staff only got the original `New service request` alert.
- **Burst behaviour:** each photo in a burst gets its own reply.

#### 1.3.4 Meta retry of a file just answered (`:106-109`)

- **Trigger:** `context.filedMedia.id === media.id`.
- **Words:** `Thank you! We got your {request title}. It is saved with your documents and the team is told.`
- **Buttons:** `Menu`.
- **Note:** `filedMedia` is dropped by any `setState`.

#### 1.3.5 Everything else: `forHome` (`:114-136`)

The home is decided by `homeForFile` (`W/a/file-home.ts:105`). A "home" here means a property with a live (non-cancelled) project or an open lead (`packages/database/src/customer-homes.ts:62`).

| Customer's homes | Decision |
|---|---|
| 0 homes | `choice=null` → §1.4.0 |
| 1 home | That home. No question. |
| 2+ homes | 1) The home picked in the last 30 min (`context.fileHome`), if still live. 2) Else, the only home with an open non-person request (Aadhaar and income-proof requests do not count). 3) Else `ask`. |

##### 1.4.0 No home at all (`:131-135`)

- **Held:** silent.
- **Otherwise:**
  - Words: `Thank you! We got your {photo|paper|video|voice note}. It is saved with your documents and the team is told.`
  - Buttons: `Menu`.
  - Side effect: the file reference is added to `context.pending` (60-minute window, at most 6), so a later "Report a problem" takes it.
  - `settle` leaves it unfiled and alerts `Sent a photo. Saved in Documents, to sort: no home yet.`

##### 1.4.1 "Which home is this for?" (`file-home-flow.ts:48-60, 131-151`)

- **Trigger:** the decision is `ask`, and the file was stored.
- **A held chat still gets the question** (`media-intake.ts:122-128` has no held check).
- **If step `await_file_home` is already open:** the document is silently appended to `context.toSort` (max 10, only those from the last 30 min). No new message.
- **Otherwise,** one list message goes out:
  - **Body:** `Which home is this for?`
  - **Button:** `Choose`
  - **Rows**, newest home first, at most 9:
    - id `fhome:{propertyId}`
    - title = the property label, else the town, cut to 24 chars with `…`
    - description = `{town}` plus ` · consumer no. ending {last 4}` when a consumer number exists, cut to 72 chars
  - **Last row:** id `fhome:person`, title `Aadhaar/PAN (all homes)`, no description.
  - There is no "Back" or "Menu" row.
- **Next:** state becomes `await_file_home` (30 min). The documents wait as `toSort`.
- **Race:** the home is re-decided inside the locked chat row. If a tap just picked the home, no question is asked and the file goes straight to that home.

##### 1.4.2 Tap on a "Which home?" row (`file-home-flow.ts:81-105`)

This is handled before the step check, and it works in a held chat (`handled-taps.ts:16`).

- **Home gone** (the property is no longer one of their homes):
  - Words: `That home is no longer active.` (plain text).
  - Then: the list again if 2+ homes remain; the single remaining home if 1; the step cleared if 0.
  - Nothing is filed.
- **Valid pick:**
  - The context becomes the old context minus `toSort`, `step` and `stepAt`, plus `fileHome={propertyId, at:now}` (remembered 30 min). The step becomes `menu`.
  - **No waiting files** (already filed, list stale after 30 min, or the step was wiped by Menu): the words are `Noted: files you send now are for *{home title}*.` For the person row the title is `Aadhaar/PAN (all homes)`. Button `Menu`. The earlier photos stay unfiled.
  - **Waiting files:** go to the paper flow (§1.5).

##### 1.4.3 Typed words while the home list is open

- `step()` returns false for `await_file_home` (`assistant.service.ts:156-163`). Then `setStep('menu')` (`:103`) clears the step and drops `toSort`.
- The text is then read as usual: a menu word, otherwise a hand-over (§4).
- The photos stay unfiled in Documents.
- A later tap on the old row gives the "Noted…" reply and files nothing.
- After 2 hours, staff get `Files to sort` (§2.7).
- The same happens on any Menu tap, hello, or another flow's `setStep`.

### 1.5 Paper flow on a known home (`W/a/file-paper-flow.ts`)

**Entry:** `fulfil` → `papers.receive`. That is the `file()` entry from the home tap or a single decidable home.

**Steps:**

1. Take a locked transaction. `unfiledFiles` skips anything already filed.
2. Compute `open = papersForHome(all open requests, choice, homeCount)` (`paper-match.ts:44`):
   - Choice = `person`: the open `customer_kyc` and `income_proof` requests.
   - Choice = a home: the non-person open requests whose project's property is that home, or have no project when the customer has one home.
   - If that is empty and the customer has exactly one home, the person requests are used instead.
3. Decide the match (`matchPaper`, `paper-match.ts:96`):
   - Step `await_file_paper` on the same home: `ask` (the file joins the waiting set).
   - Remembered "Something else" (`filePaper.requestId==='none'`, 30 min): `file`.
   - A paper answered less than 30 min ago on that home and now received: `same` (the next file is filed with it, "front and back").
   - If it is still open: answer it again.
   - 0 open: `file`.
   - 1 open: `answer`. **There is no check that the file is that paper.**
   - 2 or more open: `ask`.

**Outcomes:**

- **A. `ask` with a photo or PDF in the batch** (`:87-91`):
  - `fileAll` saves the files on the home as `other`. Voice notes and Word files too.
  - If a wait is already open, silently append the ids to `paperWait`. Otherwise send the §1.5.1 list.
  - No "Saved" text is sent.
- **B. `answer`** (`:184-205`):
  - `answerWithDocument`:
    - checks the type (photo or PDF only);
    - renames the document to the request title plus the extension;
    - sets category = the request's category, and project and property from the request's project;
    - calls `markRequestReceived` (§2.5).
  - A request with no project is moved to the home it was sent for.
  - Other files of the batch go to the same place as the answered one.
  - On an `AppError` (answered a second ago, or similar): `refused=title`, and the file stays on the home as `other`.
  - The chat remembers `filePaper` for 30 min, and `filedMedia`.
- **C. `file`:** everything saved on the home as `other` (§1.5.3 reply).
- **D. A Word or Excel file** is never `first`. It is saved as `other` on the home, and the reply still counts it as a "paper" (§1.5.2).

#### 1.5.1 "Which paper is this?" list (`file-paper-flow.ts:209-222`)

- **Trigger:** 2+ open requests on the home, and a photo or PDF arrives.
- **Body:** `Which paper is this?`
- **Button:** `Choose a paper`
- **Rows:** up to 9 open requests, oldest first. id `fpaper:{requestId}`, title = the request title cut to 24 chars with `…`. No description.
- **Last row:** id `fpaper:none`, title `Something else`.
- **Next:** state becomes `await_file_paper`. `paperWait={propertyId, at, ids}` is kept even through Menu (`keepEntry` retains it).
- **Further files** during the question are silently added.

#### 1.5.2 Replies after filing (`savedWords`, `paper-match.ts:136-155`)

Up to three parts, joined by a blank line.

- **Line 1, for a home:** `Saved: *{request title, else photo|paper|video|voice note}* for your home at *{home title}*.`
  - If the batch has several files, the kind carries a count, for example `photo (3)`.
  - A single-home customer gets this form too.
- **Line 1, for the person row** (`home=null`): `Thank you! We got your {kind}. It is saved with your documents and the team is told.`
- **Refusal:** `Sorry, we could not use that file for your {title}. Please send a clear photo or a PDF.`
- **Still needed:** `Still needed for this home: {titles, comma-separated}.`
  - For a customer with one home this lists ALL their open papers, including Aadhaar.
  - For a customer with 2+ homes it lists only that home's site papers, or the person papers for the person row.
- **Buttons:** `Menu`.
- **Silent cases** (`:104`):
  - `same`: the batch continues quietly.
  - Held chat with nothing answered or refused.

#### 1.5.3 Tap on a "Which paper?" row (`:113-146`)

This works even late. The waiting files are those in `paperWait.ids` that are not removed, not on a problem, and not already an answer.

- **None left:** `Your files are already saved. Nothing else was changed.` (plain text)
- **Home gone:** `That home is no longer active.`
- **Request not open anymore:** `That paper is no longer needed, or we have it already. Nothing was changed.`
  - Then the list is re-sent if other requests are open.
  - If none are open, it falls through and files the files as `other`, with a second reply.
- **Valid pick:** `Something else` also remembers `none` for 30 min. Then `file()` runs with the chosen match and sends the §1.5.2 reply.

### 1.6 Held chat summary (a person holds it)

- **P6 alert and night reply** (§0): sent for every message the assistant does not own.
- **Files:** filed normally.
- **"Which home?" and "Which paper?" questions:** go out.
- **Saved replies:** only an answered or refused paper is said; a plain save is silent.
- **Always sent in a held chat:**
  - the "too large / failed" texts;
  - the Meta-retry reply;
  - the `addPhoto` replies within 30 min of a problem;
  - the §1.4.2 "Noted…" reply.
- **Voice note or video:** silent (§1.3.1).
- **Taps always work in a held chat:** menu rows, quote buttons, `Menu`, `Start again`, `fhome:*`, `home:*`, `fpaper:*`, `rate:*` (`handled-taps.ts:15-37`).

### 1.7 Refused and too-large files, customer side

| Case | What the customer hears |
|---|---|
| Photo, PDF or Word, over the gateway cap (25 MB) | `This file is too large. Please send a smaller photo or PDF.` (text; needs a flow that calls `storedOrSay`) |
| Photo, PDF or Word, unsupported type or bad bytes | `Sorry, we could not open that file. Please send it again in a little while.` |
| Voice note or video, too large or refused | Nothing about the file. The customer still hears the "will listen / will watch" hand-over line. |
| Photo or PDF during the home question | `storedOrSay` runs first, so the failure text goes out; no list. |

Staff always get the `WhatsApp file not saved` alert (§0).

### 1.8 Stale taps and bursts, in brief

- **Late tap (older than the chat's newest inbound by 1 s or more):** dropped silently (P4).
- **Stale `fhome:` tap after 30 min or after Menu:** the "Noted: files you send now are for *X*." reply (§1.4.2); the photos stay unfiled.
- **`home:{id}` tap (complaint list) at any time,** even with no `await_home` step: restarts the complaint at "Please tell us the problem…" (§3.2).
- **Photo bursts:**
  - The first photo triggers the question. Later ones are appended silently.
  - One answer then files all of them as one paper, front and back. There is no per-photo choice.

### 1.9 Location, contact, sticker, reaction, unsupported

Handled in `assistant.service.ts:91`.

- **Location pin:** the team is told `📍 Location: {name, address }https://maps.google.com/?q={lat},{lng}`.
- **Contact card:** `👤 Contact: {name} {first phone}` (one line per card).
- **Sticker:** `Sticker`.
- **Unsupported:** `Unsupported message`.
- **Other types:** `Message ({type})` or `Message`.
- **Alert for all of the above (not held, `hand-over.ts:94`):** kind `whatsapp_message`, title `WhatsApp from {name}`, body the line (140 chars), key `wa_in:{wamid}`.
- **Customer reply:** none.
- **Chat state and any open step:** unchanged.
- **Reaction:** shown in the chat, no alert. In a held chat it does alert the person, because P6 ignores `quiet`.

### 1.10 Document-menu replies after a file (for completeness)

- `ok`, `thanks` or an emoji: `You’re welcome 🙏`, with `Menu`.
- A caption of exactly `hi` or `menu`: the menu list, with the greeting `Hello {FirstName}! I am the {Company }assistant. What would you like to see?` and the 10 menu rows (button `Choose`).

---

## 2. Staff asks for a paper (REQUESTS)

### 2.1 Staff action (web)

- **Where:** the project's Documents tab. Either the checklist "Ask the customer" button on a missing customer paper, or "Ask for a paper" in the "Asked from the customer" card.
- **Sheet** (`apps/web/messages/en-IN/documents.json`):
  - Title: `Ask the customer for a paper`
  - Description: `The customer gets a WhatsApp message and an alert in the OneOhm app, and sends a photo or PDF from there.`
  - Fields:
    - `What do you need?` with hint `The customer sees exactly this, for example "Latest electricity bill".`
    - `Kind of paper`, from these categories: `customer_kyc`, `electricity_bill`, `property`, `bank_loan`, `discom`, `subsidy`, `income_proof`, `other`.
    - `Note for the customer (optional)`.
    - Buttons: `Send request` / `Cancel`.
  - Success toast: `Request sent to the customer`.
- **Server** (`apps/api/src/modules/documents/document-requests.service.ts:42-93`):
  - The staff member needs the upload right.
  - The project must exist.
  - If the same kind for the same home is already open, it fails with 409 `already_asked`: `The customer has already been asked for this.` (for a person paper, the person's open request).
  - It inserts the `documentRequests` row (status `open`) and calls `askCustomer(round 0)`.
  - It writes the project log `Asked the customer for {title} (WhatsApp and app)` and the audit `document_request.created`.

### 2.2 What the customer receives (`packages/database/src/paper-requests.ts`)

**Template choice:** `paper_request` if its row in `message_templates` is active, otherwise `document_requested` (the default).

**Template payload:** `{customer, document=title, project=projectCode, home=homeName}`. `plainNames` then rewrites `project` as `{town} · {kW} kW`, for example `Sangli · 3.27 kW`. The home name is the site label, else the town, plus ` (consumer no. ending NNNN)` if another of their homes has the same name. `your home` is used if there is no project.

**WhatsApp template words** (`packages/domain/src/messaging/message-templates.ts:111-123`):

- `document_requested`: `Hello {customer}, please send your {document} for project {project}. Open the OneOhm app, go to Documents and tap Send.`
- `paper_request`: `Hello {customer}, please send your {document} for your solar at {home}. Reply here with a clear photo or PDF. You can also send it from the OneOhm app.`
- Neither template has buttons.
- The staff **note is not a template field**. It reaches the customer only in the app card.

**The same call also sends**, in `queueCustomerMessage`:

- An app inbox notice (`customer-message.ts:55-66`):
  - `document_requested`: title `Please send your {document}`, body `{project}: open Documents and tap Send to add a photo or PDF.`
  - `paper_request`: title `Please send your {document}`, body `For your solar at {home}. Send it from the OneOhm app, or give it to our team.`

### 2.3 Channel route and fallback (`packages/database/src/customer-channel.ts:31-85`, `packages/domain/src/messaging/contact-channels.ts`)

The customer's `contactChannel` and the checks below decide the channel.

- **WhatsApp:** the default.
- **SMS:** used when the number is flagged unreachable on WhatsApp (Meta error 131026), or when the customer said STOP (`whatsappOptIn=false`). `paper_request` and `document_requested` are not on the skipped-after-STOP list (`SKIPPED_AFTER_STOP`), so they go by SMS.
  - The SMS text is `{title}. {body} - {Brand}`, cut at 300 characters, with dedupe key `…:sms`.
  - `fallBackToSms` re-sends the same message once as SMS after a WhatsApp 131026 failure. It marks the customer unreachable, so later messages go straight to SMS.
- **In person:** a "tell them in person" item is queued for the team, unless the template is switched off in Settings.

**SMS replies cannot reach the assistant.** The SMS says to send from the app or give the paper to the team.

### 2.4 How the customer answers

- **WhatsApp reply with a photo or PDF.** The flow in §1.5 runs.
  - A reply of plain text such as "ok I will send" within 24 h of our template goes to a person (§4.2).
  - `ok` or `thanks` alone gets `You’re welcome 🙏`.
- **OneOhm app** (`apps/customer/src/features/documents/requested-section.tsx`). The card shows the title, the home name, the staff note, and three buttons: take photo, choose photo, choose file. It uses `answerWithDocument`'s sibling, `answer()`.
- **Give it to the team.** Staff upload it (§2.8).

### 2.5 What happens on a customer answer (`request-received.ts:21-71`)

- The request is claimed (`status='received'`). Two answers at once: the second gets `You have already sent this. Thank you.`
- Project log: `{customer} sent {title}`.
- The asker gets a notification, kind `document_received`, title `{customer} sent {title}`, body `It is filed in the project documents.` The key is round-specific.
- The owners of project tasks that wait on the customer are told (`tellWaitingOwners`), unless they are the asker.
- Audit `document_request.answered`.
- **The customer hears afterwards,** on WhatsApp, only the in-chat `Saved: *{title}* for your home at *{home}*.…` reply (§1.5.2). The app answer shows a toast. There is no extra message.

### 2.6 Reminders and the staff alert (`apps/worker/src/activities/paper-reminders.ts`)

- **Per request:** counted from the latest ask (creation, or the last "ask again").
- **Customer reminder:**
  - From 2 days up to 7 days, only in working hours of the business timezone, and only if the customer has not sent unmatched files (see below).
  - It re-sends `askForPaper` with key `paper_reminder:{id}:{round}` and the **same template and words** as the original, plus a second app inbox notice.
- **Staff alert** at 4 days (up to 14 days). The asker (else the project manager, covered via `notifyCover`; else all `projects.manage` holders) gets:
  - kind `paper_waiting`,
  - title `Still waiting for {title} from {customer}`,
  - body `The customer was asked more than 4 days ago and has not sent it. Please call them.`,
  - key `paper_waiting:{id}:{round}`, once per round.
- **Unmatched files:** if the customer sent files since the ask that answer nothing (category `other` on that home or no home; `paper-unmatched.ts`):
  - the customer is **not** chased;
  - the asker is told at day 2 with the body `{customer} sent 1 file on WhatsApp but did not say which paper. Open the chat and match them.` (or `N files`);
  - the same key blocks the day-4 alert for that round.
- Nothing is sent for a request older than 7 days (customer) or 14 days (staff) the first time the job runs.
- A cancelled project's requests are skipped.

### 2.7 Files left to sort (same worker file, `alertFilesToSort`)

- **Trigger:** a customer with 2+ homes has documents with no project, no property, category `other`, linked to a chat message, aged between 2 hours and 7 days.
- **Alert:** to the chat's owner or desk, kind `papers_to_sort`, title `Files to sort from {customer}`, body `A file has no home yet. Open the chat and move it to the right home.` (or `N files have no home yet. Open the chat and move them to the right home.`), key `paper_sort:{newest file}`.
- **The customer gets no reminder.**

### 2.8 Cancel, ask again, staff upload, move

- **Cancel** (`document-requests.service.ts:95-119`, open requests only):
  - Status becomes `cancelled`. Project log `Request for {title} cancelled`. Audit `document_request.cancelled`.
  - App inbox: title `{title} is no longer needed`, body `You do not need to send it.`
  - WhatsApp: only if the 24-hour chat window is open and the customer has not opted out, a plain text with the same words: `{title} is no longer needed. You do not need to send it.` Otherwise only the app notice.
- **Ask again** (`reask`, received requests only; button `Not right, ask again`, fields `What is wrong with it?`):
  - Blocked with `The customer has already been asked for this.` if a newer request for the same paper is open.
  - The request goes back to `open`, the staff note is stored, and the paper is removed from the project.
  - The customer gets the same template as the first time (§2.2), with key `…:reask:{n}`. The note is visible only in the app card.
  - Project log `Asked the customer again for {title}`. Audit `document_request.reasked`. The reminder clock restarts.
- **Staff upload that closes a request** (`closeRequestWithUpload`, called from `documents.service.ts:134` and from move):
  - Skipped if the file's category is `other`.
  - Closes the oldest open request for that kind on that home (or the person's, for ID/income papers).
  - Project log `{title} received: {staff} added it`, asker alert as in §2.5.
  - The customer is told **in the app only**: title `We have your {document}`, body `For your solar at {home}. Thank you.`
  - **No WhatsApp message.**
- **Move** (`document-move.service.ts`, `document-move-requests.ts`). Staff sheet `Move / change kind`, description `File this paper on another home of this customer, or as another kind. Nothing is sent to the customer, unless a request it answered is now asked again.`
  - The paper's project, home and category are changed. It is logged on both projects. Audit `document.moved`.
  - A request the paper answered that no longer matches is re-opened with the note `Filed on another home` and the customer is asked again (same template, new round). If a newer request for that paper is already open, the old one is cancelled quietly instead.
  - An open request that the paper now matches is closed (the staff-upload case above).

---

## 3. Report a problem (PROBLEMS)

### 3.1 Entry

Any of these is handled by `MenuAnswersService.choose('service')` → `startComplaint` (`complaint-start.ts:23`):

- The menu row `Report a problem` (id `service`, description `Raise a service request`).
- A typed menu word: `problem`, `complaint`, `तक्रार`, `समस्या`, `शिकायत`.
- A typed number `4`.

This works in a held chat. It does not check whether the customer has a project.

### 3.2 Which home (`complaint-start.ts`)

- **0 or 1 active home** (non-cancelled project): go to §3.3 directly. For 0 homes no project is attached.
- **2+ active homes:**
  - State becomes `await_home`, keeping any `pending` files of the last 60 min.
  - List body: `Which home is the problem at?`
  - Button: `Choose`.
  - Rows: up to 9, newest project first. id `home:{projectId}`, title = the town (cut to 24), description = the site label (cut to 72).
  - Last row: id `menu`, title `Back to menu`.
  - Two projects on the same property are two rows here.
- **Tap `home:{id}`:** if the project is no longer active, `That home is no longer active.` followed by the list again. Otherwise go to §3.3 with that project.

### 3.3 Describe the problem

- State becomes `await_problem` (30 min). `projectId` is stored in the context.
- **Words:** `Please tell us the problem in one message (for example "inverter shows an error since morning"). You can send a photo with a caption.`
- **Buttons:** `Menu`.

### 3.4 What the customer sends, then `ProblemFlowService.raise` (`problem-flow.ts:45-74`)

- **Typed text** (any text, even a menu word like `payments` or `documents`; only `menu`, hello, and the "talk to a person" openers are caught earlier): `problemText` → `raise`. The earlier pending files of the last 60 min are attached only if the text is 5 characters or longer.
- **Photo with or without caption:** §1.3.2.
- **Fewer than 5 characters and no file:** `Please write a few more words so we can help.` with `Menu`. The step stays open.
- **Photo, no words:** the description becomes `Photo or paper sent on WhatsApp.`
- **Category guess** (`guess-category.ts`), by regular expression on the text:
  - `inverter|error|fault|beep` → inverter
  - `no power/generation|not generating|zero|stopped` → no generation
  - `low|less|reduced` → low generation
  - `broken|damage|crack|leak|wire` → damage
  - `clean|dust|wash` → cleaning
  - `bill|net meter|meter` → bill or meter
  - `subsidy` → subsidy
  - Otherwise → service.
  - Marathi and Hindi words are included.
- **The request:** `raiseServiceRequest` saves description `{words} (via WhatsApp)`, on the picked project or the newest active one.
  - `openServiceRequest` sets service-level due times and assigns a person (Service role, not on leave, least busy, per Settings rules; null if none).
- **Staff get:** kind `service_request`, title `New service request`, body = the description (140 chars). It goes to every `service.manage` holder, and to the assignee under a second key. Kind `service_assigned` (title `Service request for you`) is only used when staff re-assign.
- **State after raising:** `menu`, with `raised={id, at}`.
- **Photos are attached** via `roomForStoredPhoto`: photos only, at most 6, re-filed as `site_photo`.
- **Reply, no photos:** `Thank you. Your {inverter|no generation|low generation|damage|cleaning|bill or meter|subsidy|service} request is raised. Our team will call you. Tap "My requests" to see its status.`
- **Reply, with photos:** `Thank you. Your {label} request is raised with your photo.` or `…with your 3 photos.` followed by `Our team will call you. Tap "My requests" to see its status.`
- **If some files could not be attached,** a second paragraph: `We could not add the file to the request. Please send a photo of the problem.`
- **Buttons:** `My requests` (id `requests`), `Menu` (id `menu`).

### 3.5 Photos after the complaint

For 30 minutes (`ADD_PHOTOS_MINUTES`), every photo, PDF or Word file is routed to the complaint (§1.3.3), one reply each. Voice notes and videos hand the chat to a person instead (§1.3.1).

### 3.6 What the customer hears later

- **My requests** (menu row, `Menu` taps, or typed `requests`): up to 5 requests, newest first.
  - Format per line: `• {description, first 60 chars} — *Open|Being worked on|Resolved*`.
  - Optional lines: `  Technician visit: {day}` and `  {resolution note}`.
  - If none: `You have no service requests.`
  - Buttons: `Menu`, `Talk to us`.
- **Status changes by staff or technician** (`service-desk.service.ts:122-133`, `service-visit-events.ts:30`):
  - Template `service_update`: `Hello {customer}, your service request "{topic}" is now {received|being worked on|resolved}. We will keep you posted here.`
  - `topic` is the lower-cased category label.
  - The app notice is `Service request update`, body `{topic}: {status}.`
- **Visit booked** (`service-visit-day.service.ts:45`): template `service_visit_booked`: `Hello {customer}, our technician will visit for your service request "{topic}" on {date}. They will call before they come.` The app notice is `Technician visit on {date}`.
- **Closing and feedback:** there is no complaint-specific feedback or follow-up message.
  - The `Rate us` menu row is per project and only offered once the system is switched on (`feedback-flow.ts`). Otherwise: `Thank you! We will ask for your rating once your solar system is switched on.`
  - If a project is rateable: list `How happy are you with us so far?`, with the rows `Very happy`, `Happy`, `Okay`, `Not happy`, `Very unhappy` (ids `rate:5` to `rate:1`, descriptions `5 of 5` to `1 of 5`) and `Back to menu`.
  - After a rating: `Thank you for rating us! Anything to add? Write it here, or tap "Menu".` Then a comment gets `Thank you, we have noted it. It helps the team do better.`; no comment or a skip word gets `Thank you for rating us! It helps the team.`
- **Staff-side SLA:** the worker alerts the service team for a request about to miss or past its response or resolution time (`service-sla.ts`), once per stage:
  - kind `service_sla_due_soon` or `service_sla_breached`;
  - title `Reply due soon`, `Reply time missed`, `Resolution due soon` or `Resolution time missed`;
  - body `{category} · {customer} · {project code}. Due {date}. With {assignee}.` (or `Nobody is on it yet.`).

---

## 4. Hand-over to a person from these paths

### 4.1 The mechanism (`hand-over.ts:60-87`, `passToOwner :106`)

- State becomes `human`, `context.step` is removed, `handedOverAt` is set.
- The chat's owner or answerer is alerted, else the desk (`service.manage` for a customer). Kind `whatsapp_handover`, title `Someone wants to talk on WhatsApp`, body `{profileName|A customer} · {phone}` plus an optional summary, key per last inbound message.
- The reply ends with the button `Menu` (id `menu`).
- The assistant then stays quiet except for its own taps and the words a step of its own waits for. Menu returns the chat to the assistant.
- Staff reply: state stays `human`. Past 24 h, a template goes out: `Hello {customer}, you have a new message from {staff} at OneOhm: "{message}" Please reply here to continue the chat.`
- Staff "Release" returns the chat to `menu`.

### 4.2 Triggers relevant to files, papers and problems, with the exact words

| Trigger | Words |
|---|---|
| Voice note or video | `Thank you for the voice note. {Name or "Our team"} will listen to it and reply to you here.` / `Thank you for the video. {Name or "Our team"} will watch it and reply to you here.` |
| `Talk to us` tap, menu row `Talk to a person` (`A team member replies here`), typed `help` / `मदत` / `मदद`, or the app's "Talk to a person" opener | `A team member will reply here soon (Monday to Saturday, 9:30 am to 6:30 pm). Tap "Menu" to go back to the assistant.` |
| Unknown typed text (including text typed after a photo, after a saved paper, or while the home list is open) | `Thank you. {Name or "Our team"} will reply to you here.` |
| Free text within 24 h of our last template message (including a reply to a paper request) | The same line as the row above, `Thank you. {Name or "Our team"} will reply to you here.` |
| Typed text that is neither a menu word nor a known step answer, while a person already holds the chat | No reply; the person gets the P6 alert. |

### 4.3 Typed text vs steps

- `ok`, `thanks` and similar: `You’re welcome 🙏`, with `Menu`. This does not hand over.
- During `await_home`, `await_file_home` and `await_file_paper`, typed text is not consumed by the step. It clears the step and is then read as usual (a menu word, otherwise a hand-over).
- During `await_problem`, typed text IS consumed as the problem description, except the whole-message `menu` / hello / "talk to a person" openers.

---

## 5. Issues seen

### 5.1 Dead ends

1. **One-home customer cannot answer an ID request while a site request is open** (`paper-match.ts:44-57`).
   - `papersForHome` returns the person papers only when no site paper is open.
   - A one-home customer is never shown the person row.
   - Their `Still needed…` reply still lists Aadhaar (`paper-match.ts:161-168`).
   - Sending the Aadhaar with one site paper open answers that site paper with the Aadhaar.
2. **Wrong-paper match:** with exactly one open request on the home, ANY photo or PDF answers it, with no confirmation (`paper-match.ts:109-111`). There is no check against the file content; a roof photo can close "Latest electricity bill". Staff must use "Not right, ask again".
3. **Silent glue for 30 minutes** (`paper-match.ts:103-108`, `file-paper-flow.ts:104`). After one paper is answered, the next file for that home within 30 minutes is treated as the same paper ("front and back") with NO reply. A customer asked for a bill and a roof photo, who sends both a few minutes apart, gets the second photo filed under the bill, hears nothing, and the second request stays open.
4. **Orphaned files:** any Menu tap, hello or other step (complaint, referral) drops `toSort` and `pending` (`chat-store.ts:207-213`). The "Which home?" photos stay unfiled; a late tap answers `Noted…` and files nothing (`file-home-flow.ts:96-100`). The customer is never told. Only staff are alerted, after 2 hours, and only for customers with 2+ homes (`paper-reminders.ts:185`).
5. **No customer nudge** for an unanswered "Which home?" or "Which paper?" list (§2.7).
6. **Person-paper request can be missed by a multi-home customer.** If they tap a home instead of the person row, the file is saved as `other` on that home, the reply says `Saved: *photo* for your home at *Pune*.` with no mention of Aadhaar, and the request stays open and keeps reminding.
7. **Location, contact and sticker during a step:** silent, and the step keeps waiting (`assistant.service.ts:91`).
8. **Voice or video during a complaint:** wipes the complaint step and raises nothing (`hand-over.ts:121`, `media-intake.ts:86`). After a complaint is raised, voice notes and videos are not attached even though the app allows one of each.
9. **Unsupported file type:** the customer hears the transient wording `Please send it again in a little while` (`words.ts:112`) for a file that will never be accepted. The accepted types are never listed to the customer (they are listed only to staff).
10. **Voice or video that failed to store:** the customer still hears "will listen / will watch" (`media-intake.ts:86-91`). Staff are told "Ask them to send it again" even for a too-large file (`chat-file-keeper.ts:234`).

### 5.2 Robotic or confusing wording

11. `Which home is this for?` arrives alone after one or several photos, with no acknowledgement of the photos or how many, and no way back. The complaint home list has a `Back to menu` row; this one does not (`file-home-flow.ts:141-148`).
12. `Aadhaar/PAN (all homes)` is a row among property rows. After the tap, the reply is `Noted: files you send now are for *Aadhaar/PAN (all homes)*.` (`words.ts:117`).
13. `Saved: *Aadhaar card* for your home at *Pune*.` is said to single-home customers for a person paper (decision 2 in `paper-match.ts:39`).
14. `Thank you! We got your photo. It is saved with your documents and the team is told.` (`words.ts:104`) is used for papers, photos, videos and voice notes alike, and promises that the team is told. The team is told by `settle`, but not for a held or answered case.
15. `Your no generation request is raised.`, `Your bill or meter request…`, `Your damage request…` (`words.ts:198-207`). The category labels read badly in the sentence.
16. **"My requests" shows `(via WhatsApp)` in every line** (`problem-flow.ts:62`, `answers.service.ts:87-96`).
17. **Row titles for "Which paper?"** are cut to 24 characters. Similar long titles collapse to identical rows (`paper-words.ts:7-9`, `paper-match.ts:123`).
18. **The staff UI and the `document_requested` template say "from the app"** (`documents.json` sheet, `message-templates.ts:114`). The assistant accepts photos in chat, and only `paper_request` says so (`:121`).
19. The staff **note never reaches WhatsApp** (§2.2). The placeholder suggests it matters ("the bill must show the consumer number").
20. **A reminder repeats the original words** (`paper-reminders.ts:125`), and sends a second app inbox notice. A "ask again" and a "Filed on another home" re-ask are likewise word-for-word the original, with no reason (`document-request-reopen.ts:51`, `document-move-requests.ts:56`).
21. The **hand-over hours are hard-coded text** (`words.ts:74-75`).

### 5.3 Steps that ask too much

22. Photo first, description after: a photo with no caption raises a request with the placeholder text, and the next description is then handed to a person instead of added to the request (`problem-flow.ts:53`, `assistant.service.ts:112`).
23. **Complaint with 2+ homes asks twice:** which home (list), then the problem (text). The customer who just sent a photo of a fault is not offered "use this photo".
24. **One reply per photo** in the 30-minute add-photos window, including up to 6 identical `Thank you, the photo is added to your request.` messages.
25. Cap messages are misleading: the 7th photo, a PDF, or a resolved request all say `Please send a photo of the problem.` (`words.ts:109`).
26. **A photo meant for a paper but unmatched** is silently re-used as complaint evidence (`keepForProblem`, `media-intake.ts:158,162`) if the customer reports a problem within 60 minutes. The same file was already reported to them as `Saved: …` on a home.

### 5.4 Person papers mixed with property choices

27. The home list mixes homes and the person row (`file-home-flow.ts:141-148`). The wording of the row is `Aadhaar/PAN (all homes)`, but the person row is only offered when 2+ homes and no decidable home.
28. The "decidable home" rule ignores person requests (`file-home.ts:84-99`). So a customer with two homes, an open Aadhaar request and an open bill request on one home, sends an Aadhaar photo: it goes to that home and answers the bill request.
29. **A person paper answered via a project:** `answerWithDocument` files it under the request's project and home (`customer-document-requests.service.ts:94-103`), not at person level, even though `placeOn(person)` says no home. The chat words, the staff project view and the person row do not agree.
30. The request template names a home for an ID paper: `…your Aadhaar card for your solar at Pune` (`message-templates.ts:121`).
31. The complaint home list and the file home list name the same home differently: complaint = town as title, label as description (`complaint-start.ts:36-42`); files = label (else town) as title, town as description (`customer-homes.ts:36`). They also use different home definitions: complaint uses projects (`active-projects.ts`), files use properties with a project or open lead (`customer-homes.ts:62`).

### 5.5 Unpredictable behaviour

32. **Remembered home for 30 minutes** (`file-home.ts:31-51`). The first "Which home?" tap sets the home for later files, so a photo for another home goes to the wrong one without a question. The "only home with open site requests" shortcut does the same.
33. **A caption of exactly `hi` or `menu`** swallows a photo into the menu (`assistant.service.ts:78`). It is saved by `settle`, but neither the customer nor staff are told in the reply.
34. **Typed menu words during `await_problem`** become the complaint text, for example `documents` raises a request described "documents (via WhatsApp)" (`assistant.service.ts:164`).
35. **Typed `help` during `await_problem`** gets `Please write a few more words so we can help.` rather than a person.
36. **Category guessing is by substring:** `low` matches `follow`, `slow` and `allow`; `less` matches `wireless`; `error`, `zero` and `fault` match inside other words (`guess-category.ts:6-16`).
37. **Held-chat inconsistencies:**
    - The questions go out but "Saved" replies do not.
    - `addPhoto` replies are sent while a person holds the chat (`media-intake.ts:101-105`).
    - A reaction alerts the person only in a held chat (`controller:132`).
    - `storedOrSay` failure texts are sent even when held.
38. **Reminder timing:** the customer reminder only goes in working hours, but the staff alert does not depend on it (`paper-reminders.ts:121-128`). Once the alert goes, the request is skipped forever (`:108`), so a reminder missed because of timing is never sent.
39. **Unmatched alert at day 2 blocks the day-4 alert** (same key, `paper-reminders.ts:64,108`).
40. **A gateway cap of 25 MB applies to video too** (`media-gateway.ts:158`), though the type cap is 60 MB (`media-type.ts:24`).
41. **A stale "Which home?" or complaint step (30 min)** reads the next file as new and may ask the question again, so the customer sees a second list.
42. **Burst replies are asymmetric:** the first photo gets the list or the save message, the others are silent, but each still produces a separate staff alert (`settle` per message, `chat-file-keeper.ts:97-114`).
43. **A one-line Word reply that claims "paper":** a Word file is filed as `other` and described as `paper`, followed by `Still needed for this home: …`, which can read as if it counted (`file-home.ts:163-175`).
44. **Meta retry of a failed message** can repeat replies already queued before the failure (`controller:104-108`, `chat-store.ts:111`).
45. **Late taps are dropped without a word** (`controller:92`). Combined with item 4, a customer who taps a list row after typing something sees nothing happen.