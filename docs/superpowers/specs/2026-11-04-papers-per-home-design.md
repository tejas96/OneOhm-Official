# Papers per home, WhatsApp first — design

Date: 2026-11-04 · Status: draft for owner approval

## Why

A customer can have more than one home (property) with OneOhm, each with its own project and its
own electricity connection. Papers and photos must land on the home they belong to, or a checklist
shows a paper as "on file" for the wrong home and the DISCOM / subsidy file goes out wrong.

About 98% of customers use WhatsApp, so WhatsApp is the main way papers come in. The customer app
already works for the rest and does not change. The flow must be fast and accurate for the
customer, every paper must close what it answers (request, checklist, progress), nothing may go
silent, and nothing extra gets built.

## What is true today (from the code)

- Only `electricity_bill` and `property` count as "per home" (`packages/domain/src/documents/site-papers.ts`).
  Every other category (site photos, survey, DISCOM, subsidy, loan, commissioning, warranty…) on
  home 1 also ticks home 2's checklist.
- Files from WhatsApp and the customer app never set `documents.property_id`.
- WhatsApp files that answer nothing go to the customer's newest project as `other`
  (`whatsapp/chat-file-keeper.ts`, added today).
- A WhatsApp file answers the **oldest open request of any home** (`media-intake.ts` `fulfil`).
- An open request for a category blocks a request for the same category on another home
  (`document-requests.service.ts`, duplicate check is per customer, not per project).
- Staff cannot move a paper to another home or fix its kind; only replace or remove.
- A staff upload of a paper does not close the open request for it.
- The request template says "Open the OneOhm app… tap Send" and does not name the home.
- WhatsApp already has a "Which home?" list for complaints (`assistant/complaint-start.ts`).

## The rule (one rule, used everywhere)

- **Person papers** serve every home: `customer_kyc` (Aadhaar, PAN), `income_proof`.
- **Everything else belongs to one home.** `SITE_DOCUMENT_CATEGORIES` becomes "every category
  except the person ones". `countsForSite` stays as it is and so the checklist, open requests and
  change requests follow automatically.
- Every paper that belongs to a home stores both `project_id` and `property_id`.
- Lead stage does not change: papers on a lead may stay mixed.

## Flows

### 1. The team asks for a paper (web "Ask the customer")
- Duplicate check becomes per project (home), not per customer.
- New WhatsApp template `paper_request` names the home:
  > Hello {{1}}, please send your {{2}} for your solar at {{3}}. Reply here with a clear photo or PDF. You can also send it from the OneOhm app.
  Fields: customer, document, home (home = site label, else city; with the project code).
- The old `document_requested` template is retired in the app (marked inactive) once `paper_request`
  is approved. The owner deletes it in Meta Business Manager; the app cannot. Until approval the
  app keeps sending the old one, so nothing breaks.
- SMS and app inbox words say the same thing.

### 2. A customer sends a file on WhatsApp
Decided in this order:
1. **One home** (most customers): the file goes to that home. Open requests on that home are
   answered as today (see 3).
2. **Two or more homes, and only one home has open requests**: the file goes to that home.
3. **Two or more homes otherwise**: the assistant asks once, as a WhatsApp list:
   "Which home is this for?" Rows: one per active home (title = site label or city; description
   = city · consumer no. ending 1234), plus "Aadhaar / PAN (all homes)". The answer covers every
   file sent in the next 30 minutes, so a burst of photos asks once.
   - While waiting, the files are kept at once under the customer (no home yet, category `other`),
     show in the chat, and are listed as "To sort".
   - If there is no answer in 2 hours, the chat's person gets an alert "Files to sort".
   - A person holding the chat sees the same list question go out; they may also sort it themselves.
4. Voice notes and videos: kept on the home as above, and still passed to a person (as today).

### 3. A file answers an open request
- Requests are only matched **within the chosen home**.
- One open request on that home: the file answers it.
- Two or more open requests on that home: the assistant asks "Which paper is this?" as buttons /
  list with the request titles, plus "Something else".
- Answering sets the request to received, files the paper with the request's category on that
  home (project + property), and:
  - tells the person who asked (as today), and the owners of that project's tasks that are
    waiting on the customer;
  - writes a project log line;
  - the customer gets "Saved, thank you" and what is still needed **for that home**.

### 4. Staff fix mistakes (web, on the paper)
- **Move / change kind**: one small sheet on a paper — choose home and kind. Both projects get a
  log line, the audit log records it, checklists update by themselves. If the paper answered a
  request on the old home, that request opens again.
- **Not right, ask again** (on a received request): the request opens again, the paper is taken
  off, the customer gets the request message again.
- **Staff upload closes the request**: a staff upload of the same kind on the same home closes
  that home's open request for it (paper collected on site, or sent by email).

### 5. Alerts that were missing (from today's review)
- Location pin, contact card or sticker from a customer: the chat shows what it is (map link,
  name and number) and the chat's person gets an alert.
- Any of our WhatsApp messages to a customer that fails: the chat's person gets one alert for it
  (today only files alert). "Not on WhatsApp" keeps falling back to SMS as today.
- A bill photo filed on a lead outside onboarding: the lead's owner gets an alert.
- A bill kept before the lead existed shows in the chat once it is filed.
- Word and Excel files are accepted (stored, shown as a file link; no preview).

## Decisions made by Claude (owner to check)

1. **What a "home" is.** A home is a **property** of the customer that has a project that is not
   cancelled (finished and running systems count, for warranty and AMC papers) or an open lead.
   Two projects on one property are one home. WhatsApp, the checklist and the "Which home?" list
   all use this one count. A repeat customer with a finished home and a new lead on a second house
   has two homes, so they are asked.
2. **Person papers (Aadhaar, PAN, income proof).** Their requests keep the per-customer duplicate
   check (asked once, serve every home). They do not count as "this home has open requests" in
   flow 2. They are answered when the customer picks "Aadhaar / PAN (all homes)", or when they are
   the only open requests and the customer has one home.
3. **A batch of files.** The home answer and the "which paper" answer both cover the next 30
   minutes. A request is answered by the first file; more files in the same batch are filed on the
   same home with the same kind (for example Aadhaar front and back, or a 3-page bill). No question
   is sent per file.
4. **Files that answer nothing.** The old "Report a problem / Talk to a person" question for a stray
   file goes away. The file is filed on the chosen home (kind `other`), the customer gets "Saved
   for your home at …", and the chat's person gets one alert, as today. Photos sent while
   reporting a problem still go on the complaint (unchanged). Complaints still start from the menu.
5. **Lead papers when the lead becomes a project.** Papers on the lead get that project and its
   property when the project is made, so the new project's checklist sees them. Papers on other
   leads are left alone.

## Production review (2026-11-04)

Checked against everything discussed in the session: WhatsApp files in chat (built today), papers
per home, wrong-home sends, customers without WhatsApp, the 6 earlier gaps, templates, statuses,
progress, alerts, no over-engineering.

### A. Both sides always see the same truth
Every paper has one place and one status, and both sides are told in plain words:

| Moment | Customer sees | Team sees |
|---|---|---|
| Team asks for a paper | WhatsApp `paper_request` naming the paper and the home (SMS + app inbox when not on WhatsApp) | Request "Open" on the home; project log line |
| Customer sends a file | Reply: "Saved: *Electricity bill* for your home at *Pune*. Still needed for this home: …" | File in the chat with a label under it: "Filed: Electricity bill · Pune home" (or "To sort"); one alert |
| Customer sends nothing | One reminder after 2 days (same template) | After 4 days, the person who asked gets "Still waiting for … from …" |
| Staff upload (paper given by hand, email, field visit) | App inbox: "We have your … for … Thank you." | Request "Received"; project log line |
| Staff: "Not right, ask again" | The request again, with the staff note in the app | Request "Open" again; log line |
| Staff cancels a request | App inbox (and WhatsApp text if the chat is open): "… is no longer needed. You do not need to send it." | Request "Cancelled"; log line |
| Staff moves a paper | Nothing (internal), unless it reopens a request (then as "ask again") | Log line on both projects |

- In the customer app, a request shows the **home name** (site label or city), not only the project
  code. This is the only app change (a label from the API).

### B. One file, stored once
- A WhatsApp file is stored the moment it arrives (as built today in `ChatFileKeeper`, moved to run
  first). Choosing the home, answering a request or adding it to a complaint only **updates where
  the same document is filed** (project, property, category, request). No second download, no
  second copy, nothing to soft-remove. This replaces today's "re-download and remove the copy".

### C. Reminders that were missing
- Open requests had no reminder anywhere. One daily worker job: customer reminder at 2 days (once),
  staff alert at 4 days (once). Nothing more.

### D. Customers without WhatsApp (about 2%)
- Request goes by SMS and app inbox (existing routing). Words: "Send it from the OneOhm app, or give
  it to our team."
- The customer answers in the app (unchanged), or staff upload it for them; a staff upload of the
  same kind on the same home closes the request and tells the customer in the app.

### E. Going live safely
1. Migration: fill `documents.property_id` from `project_id` where it is empty (14 rows in dev).
2. The rule change can lower "on file" counts for customers with 2+ homes, where a paper was counted
   for the wrong home. Before release, run a count of such customers in production and list their
   papers with no home; they show as "To sort" for staff. (Dev has 0 such customers.)
3. Templates: add `paper_request` (en, mr, hi) to `docs/whatsapp-templates.md`; owner submits to
   Meta. The app keeps sending `document_requested` until `paper_request` is set active in
   Settings → WhatsApp messages; then the owner deletes the old one in Meta.
4. Today's work (WhatsApp files in chat and Documents, project log lines for requests) is the base
   and ships with this.

## Goals
- Every customer paper is on the right home, or visibly waiting to be sorted with someone told.
- Requests, checklists and progress update by themselves from where the paper is filed.
- The customer answers one WhatsApp question at most per batch of files.

## Non-goals
- Reading the consumer number from a bill photo automatically.
- Changes to the customer app.
- Moving papers between customers.
- Sorting old papers already filed (they stay where they are; staff can move them with the new action).

## Anti-goals (a failure even if it works)
- The customer is asked "which home?" when they have only one home.
- A paper silently lands on a home nobody chose.
- New screens or settings for this.

## Left to the builder
- Exact words in English, Marathi and Hindi (follow `assistant/words*.ts` and the template guide
  `docs/whatsapp-templates.md`; add `paper_request` there).
- Whether "To sort" is a filter on the customer's Documents or a badge; use what the gallery
  already supports.
- Where the 30-minute "home chosen" memory lives (the chat `context`, like `pending` today).
- How the 2-hour "files to sort" alert runs (an existing worker reminder job).
- Tests: acceptance scenarios for each flow above, in the style of
  `apps/api/test/acceptance/scenarios/56-whatsapp-chat-files.acceptance.ts`.
