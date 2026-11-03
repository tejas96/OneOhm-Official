# WhatsApp sales cycle: from ad to paid advance — design

Date: 2026-11-03 · Status: draft for the owner

## Why

Leads are lost in the gaps between people and steps. A lead from an ad waits for a call,
sits with someone on leave, or is forgotten after the first chat. Sales people spend
their time asking basic questions and chasing electricity bills. The quote reaches the
customer as text only, with no PDF. Payment links are plain text in a message.

Customers already live on WhatsApp. The goal is a sales cycle that runs mostly on
WhatsApp, where the customer does the easy parts and our team does only the parts that
need a person. Every step the customer takes must change our records at once.

## The product philosophy this follows (PRD §1, §9)

1. Calm, premium, extremely easy. A customer who has never used an app can finish.
2. Zero learning curve for staff. No new screen to remember. Work comes to the person
   (Today) and lives with the record (lead, customer).
3. Complete control. Every step is traceable in the lead's or customer's history.
4. Smart automation. The system assigns, reminds and follows up.
5. Accuracy. Price, subsidy and payment come from the existing engines only.
6. Customers always know their status and next step.
7. Configurable by the owner without developers.
8. Simplicity. No unnecessary features, screens or settings.

## The one rule

**Nothing stays only in chat.** Every bot step calls the same domain service the web app
uses. That service writes the record, the history, the alert and the next action in one
transaction. The chat is a view on the work, never the place where data lives.

## Goals

- G1. The quote PDF reaches the customer on WhatsApp, with buttons to accept or ask.
- G2. A lead from an ad or a WhatsApp campaign onboards itself through a short guided
  chat. Answers fill the lead. The electricity bill photo is filed on the lead.
- G3. At the end of onboarding the customer gets an instant **estimate** PDF from the
  existing pricing engine.
- G4. Every new lead gets an owner at once by a configurable rule that skips people on
  approved leave.
- G5. The customer picks a call or visit slot on WhatsApp. The slot becomes the lead's
  next action on the owner's Today page, with reminders on both sides.
- G6. Each lead keeps the campaign it came from, so the owner sees which ads bring paying
  customers.
- G7. Payment links go out with a "Pay now" button that opens a web page. Payment
  updates everything: payment, receipt, ledger, history, thank-you message.
- G8. The whole journey is tested end to end with Razorpay test keys and the test number
  +91 8087823247.

## Non-goals

- Free-text AI chat. The bot is guided steps (buttons and lists). AI may come later, only
  to read messy free text into a clean answer. AI never touches price or money.
- Taking payment inside the app or inside WhatsApp (WhatsApp Pay). Payment is always on a
  web page, for tax reasons.
- A new "Campaigns" module, ad spend import, or a marketing dashboard. Only a source
  label per lead and one simple report.
- A calendar app. Slots come from working hours and the owner's own next actions.
- Changing how staff build quotes on the web.
- Group chats, chat search, media galleries.

## Anti-goals (a failure even if it works)

- A customer gets stuck in the bot with no way to reach a person.
- The bot asks for something we already know.
- An estimate is shown as a final, binding price.
- A lead goes to someone on leave, or has no next action.
- A paid link that does not show as paid in every place (lead, customer, project,
  finance, chat) within a minute.
- A new screen or a settings page full of switches.
- Messages that feel like spam: many nudges, or messages at night.

## The customer journey

### Step 0 — Entry

Ways in:

- A click-to-WhatsApp ad. Meta sends a `referral` object with the ad id and headline.
- A campaign link `wa.me/<number>?text=Hi OneOhm <CODE>`, used in posters, SMS and
  WhatsApp campaigns.
- A plain "Hi" from an unknown number.

Routing:

| Who is writing | What happens |
|---|---|
| Saved customer or family member | The existing customer menu. No onboarding. |
| Number with an open lead | The bot continues from the lead's state. It never asks again for what the lead already has. |
| Unknown number | Onboarding starts. A lead is made at the first answer, with the source and campaign. |

### Step 1 — Language

The bot greets the customer by brand name and asks: English, मराठी, हिंदी (3 buttons).
The language is saved on the chat and used for everything after.

### Step 2 — Short questions

The bot asks one question per message. Most answers are taps.

| # | Question | Answer type | Saved to |
|---|---|---|---|
| 1 | Your name | text (prefilled from the WhatsApp profile name, "Is this right?" Yes / Change) | lead.name |
| 2 | Your city or village | list of configured service cities, plus "Other" (text) | lead.city |
| 3 | Where do you want solar? | Home / Housing society / Shop or business / Farm | lead.subsidyCategory and site type |
| 4 | Average monthly electricity bill | list of ranges (Up to ₹1,000 · ₹1,000–2,000 · ₹2,000–3,000 · ₹3,000–5,000 · Over ₹5,000) | lead.estimatedWp, from configured bill→kW bands |
| 5 | Your roof | RCC / Tin sheet / Other, and floors (Ground+1 · +2 · +3 or more) | site facts for the estimate |
| 6 | Photo of your electricity bill | photo or PDF, or "Send later" | document `electricity_bill` on the lead |

Rules:

- Every message has a "Talk to a person" choice. Tapping it hands the chat to the lead
  owner with what was answered so far.
- Typing "menu", "back" or "change" goes back one step.
- If a free-text answer does not match, the bot asks again once, more simply. After a
  second miss it hands over to a person. It never loops.
- Each answer is saved at once. If the customer leaves halfway, nothing is lost.
- The bot asks only the questions the estimate needs. Optional facts come later.

### Step 3 — Instant estimate

- The bot builds the estimate from the existing pricing engine with the configured
  default products (panel, inverter, structure) for that site type and size.
- It sends an **Estimate** PDF: system size, price, expected subsidy, cost after subsidy,
  monthly saving, payback years. It is clearly marked "Estimate — final price in your quotation after a
  free call or visit".
- Buttons: **Book a free call or visit** · **Talk to a person** · **Not now**.
- The lead moves to "contacted" with a note in its history: "Estimate sent: 3 kW, ₹…".

If the engine cannot price (for example a farm, a society, or a size outside the bands),
the bot says "Our expert will prepare your price" and hands over with a next action for
today. It never sends a wrong number.

### Step 4 — Book a slot

- The bot shows the next free days (list, up to 7), then the free slots for that day
  (list, for example "10:00–11:00").
- Slots come from working hours, the slot length, the owner's existing timed next actions,
  and the owner's approved leave.
- If the owner has no free slot in the window, the slots of the backup or the team are
  offered. The lead moves to whoever takes the booking.
- On booking:
  - The lead's next action becomes "Site visit" or "Call" at that date and time.
  - A history note is written. The owner gets an alert. The slot shows on their Today page.
  - The customer gets a confirmation with **Change time** and **Cancel** buttons.
- Reminders: the owner before the slot (existing timed reminders), and the customer the
  evening before and 1 hour before.
- After the slot time, the owner is asked "How did it go?" on their Today page. This is
  the existing next-action flow, so a lead never sits without one.

"Not now" asks "When should we check back?": In 1 week · 1 month · 3 months. That sets the
lead's next action (or `revisitOn` when lost). The customer is never asked twice in a day.

### Step 5 — Final quote

- After the site visit, staff build the quote as today. Conversion to customer happens as
  today (it is needed before a quotation).
- When the quote is sent, the customer gets the **quote PDF** as a document on WhatsApp,
  with buttons **Accept quote** · **I have a question**.
- The same is true for revisions: the newest revision is the one sent.

### Step 6 — Customer accepts

- "Accept quote" asks to confirm once ("Accept quote QT-… for ₹…? Yes / Not yet").
- On yes, the quotation is marked accepted **by the customer**. The audit row names the
  customer and the channel. The lead moves to won as today.
- The lead owner and the project setup people get an alert: "Ravi accepted QT-… — start
  the project."
- The customer gets: "Thank you. Our team will start your project and send the advance
  payment link."
- "I have a question" hands the chat to the owner.

The accept button only works on the newest open revision. On an old or expired quote, the
bot says so and hands over.

### Step 7 — Pay

- When a milestone falls due (the advance falls due at project creation), the customer
  gets the payment message with a **Pay now** button that opens our pay page. The pay page
  then opens Razorpay. This is the existing pay-token page.
- After the customer pays:
  - The Razorpay webhook records the payment (receipt, ledger, fee), as today.
  - The customer gets "Payment received" with **View receipt** (the receipt PDF as a
    document).
  - A history note is written. The project's and finance's views update. The owner and
    accounts get an alert.
- If the link expires or fails, the customer gets one calm message with a new **Pay now**
  button. Staff see the failed or expired state on the milestone.
- The existing reminder schedule for overdue milestones uses the same Pay now button.
- From the customer menu, a new "Pay due amount" choice lists due milestones, each with
  Pay now.

### Step 8 — After the sale

The existing project updates, documents, service, warranty, referral and feedback flows
stay. They gain buttons where they help (for example "View" on a document message). The
"Documents" menu also lists sent quotes, not only accepted ones.

## The team's side

| Moment | What staff see | Where |
|---|---|---|
| Lead created by the bot | New lead alert with source and campaign; lead page shows answers, bill photo, estimate | Today, Lead page |
| Customer asks for a person | Chat needs a reply, with "answered so far" summary | Today → Chats, Lead page |
| Slot booked, changed or cancelled | Next action set or moved; alert | Today, Lead page |
| Customer goes quiet mid-onboarding | After the nudge, the lead gets a next action "Call — stopped at bill question" | Today |
| Quote accepted on WhatsApp | Alert: start the project | Today, Quotation |
| Payment made | Alert; milestone paid; receipt filed | Project, Finance, Customer page |
| Link expired or failed | Milestone shows it; one alert to the owner | Project |

No new pages. Everything lands on existing places.

## Assignment (G4)

- Lead assignment gets its own rule in **Settings → Assignment** (the page that already
  has rules for tasks): strategy (fewest open leads / round robin), and optional "by
  city" (a list of cities per sales person).
- "On leave" means **approved leave covering today**, plus the existing manual switch.
  People on leave are **skipped**, not just sorted last. If everyone is away, the lead goes
  to the sales desk (people with `leads.manage`) with an alert, never to nobody.
- The same rule assigns every new lead from every source (website, WhatsApp, referral),
  not only bot leads.
- When someone goes on leave, the existing handover already moves their lead follow-ups
  to the backup. Booked slots in the leave period move too, and the customer gets a short
  message only if the time changes.

## Campaigns and sources (G6)

- New lead fields: campaign code, ad id and ad headline (from the Meta referral), and
  landing page and UTM fields from the website form.
- **Settings → Lead sources**: a short list of campaign codes with a name ("Diwali poster
  2026"). Unknown codes are kept as typed.
- One report on the existing sales dashboard: leads, estimates, visits, quotes, won and
  money collected, by source and campaign. No ad spend.

## Messages and the 24-hour window

- Inside the 24-hour window, the bot uses free interactive messages (buttons, lists,
  documents, URL buttons).
- Outside it, only approved templates can be sent. New or changed templates:

| Template | Use | Header / button |
|---|---|---|
| `quotation_sent` (changed) | Quote sent | Document header (the PDF); quick replies Accept / Question |
| `estimate_ready` | Estimate sent after the window closed | Document header |
| `slot_confirmed` | Booking made or moved by staff | Quick replies Change / Cancel |
| `slot_reminder` | Evening before and 1 hour before | Quick reply Change |
| `payment_link` (changed) | Pay link | URL button "Pay now" with the token as a dynamic suffix |
| `payment_received` (changed) | Thank-you | Document header (receipt) |
| `onboarding_nudge` | One nudge for an unfinished onboarding | Quick reply Continue |

- Every template is drafted in `docs/whatsapp-templates.md` for Meta, in English, with
  Marathi and Hindi versions where the language mapping already allows.
- Until Meta approves a changed template, the old text version is used (the PDF link goes
  in the text). The app never fails a send because a template is missing.

## Configuration (all in existing Settings sections, sensible defaults on)

- Onboarding bot: on or off; service cities; bill→kW bands; default products per site
  type for estimates.
- Slots: slot length, how many days ahead, which slot types (call, visit), lead time
  (no slot sooner than N hours).
- Customer reminders before a slot: on or off.
- Nudges: on or off, how many hours after the customer stops (default 3 hours, and only
  inside working hours).
- Lead assignment: strategy, by-city list, skip leave (always on).
- Campaign codes.

## The connections to keep (the loop)

Every customer action must fan out to all of these, in one transaction where it changes
data:

| Customer action | Record | History | Alert | Next action | Message out | Audit |
|---|---|---|---|---|---|---|
| First answer | lead created, owner set | lead note | owner | "Finish onboarding" today | — | — |
| Bill photo | document on lead | lead note | — | — | thanks | — |
| Estimate | estimate stored on lead | lead note | — | — | PDF | — |
| Slot booked / moved / cancelled | next action | lead note | owner | set / moved | confirmation | — |
| Accept quote | quotation accepted, lead won | lead + customer notes | owner, project setup | "Start project" | thank-you | yes |
| Pay | payment, receipt, ledger | customer/project note | owner, accounts | — | thank-you + receipt | yes |
| Ask for a person | chat owner set | chat | owner | reply due | warm hand-over | — |

Existing loops that must keep working: lead conversion writes history and audit; quote
sent moves the lead to quoted; acceptance moves it to won; the system-papers sweep files
the accepted quote; leave handover moves follow-ups; the command centre counts late
chats; delivery receipts update the outbox.

## Testing (G8)

- Unit tests for each new rule (assignment with leave, slot finding, bill→kW, step
  parsing).
- Acceptance scenarios (the existing `pnpm test:acceptance` suite) for: unknown number to
  estimate; slot booking with an owner on leave; quote sent with PDF; accept on WhatsApp;
  pay by link to receipt; expired link.
- One live run on a test setup:
  - WhatsApp in live mode, limited to +91 8087823247 through `WHATSAPP_TEST_NUMBERS`.
  - Razorpay test keys (`rzp_test_…`) against the real Razorpay test API, with a webhook
    to a public tunnel.
  - Walk the whole journey from "Hi OneOhm TEST" to receipt, and check every row of the
    loop table above.
- The owner adds the keys and approves templates on Meta. Claude does not enter keys or
  passwords.

## Delivery order

1. **Quote PDF and payments** (G1, G7): biggest money effect, smallest change.
2. **Assignment and sources** (G4, G6): needed before bot leads flow in.
3. **Onboarding bot and estimate** (G2, G3).
4. **Slot booking** (G5).
5. **End-to-end live test** (G8), with a short test after each part.

Each part ships on its own and leaves the app working.

## Decided by the owner

- Guided steps, not AI, for now.
- Payment only on a web page, never in the app.
- The test number is +91 8087823247.
- The delivery order above (Claude's recommendation, accepted with "go with your
  recommendations").
- **Keep today's flow.** The slot the customer books is a call or a visit with the
  **sales lead owner**, and slots come from that person's calendar. Sales sends the quote,
  the customer accepts, the project starts, and the site survey happens after that, as
  today. The survey may still change the price within the tolerance band (existing
  survey repricing). So the estimate says "final price in your quotation", and the quote
  says a small change is possible after the site survey. Step 4's "site visit" means this
  sales call or visit, never the project survey.

## Builder's calls (not decided by the owner)

- The estimate is a separate record on the lead, not a quotation, because a quotation
  needs a customer and a site, and making customers from unfinished chats would fill the
  customer list with strangers.
- Customer acceptance on WhatsApp does **not** create the project by itself. Staff still
  start the project (UX task 4), and that makes the advance due and sends Pay now. This
  keeps one way to start a project.
- No booking payment before the quote is accepted (payment links need a project
  milestone today; adding a second kind is out of scope).
- Exact wording of every bot message, plain and short, in three languages.
- Bill bands, default slot length (60 minutes) and the 7-day window are starting defaults
  in Settings.
- The PDF goes to Meta as a link to our short-lived signed file URL (Meta fetches it), so
  no media upload store is needed. It falls back to the link in text if Meta cannot fetch
  it.
- Razorpay test keys are allowed with live gateway calls outside production, so the real
  test API can be used.
- **Referral code and campaign code together:** the referral wins. The existing referral
  lead is made (with the referrer kept), and then the friend gets the same onboarding and
  estimate. The source is "referral" and the campaign code is kept as a note.
- **Matching an old lead:** an open lead (any stage except won or lost) is continued. A
  number that matches only a lost or won lead gets a new lead with the new source and
  campaign, and the new lead links to the old one in its history. The assignment rule
  runs for the new lead. A saved customer always gets the customer menu.
- **Family members:** they can see the quote and pay. Only the customer's own number can
  tap "Accept quote". From a family number, the tap hands the chat to the owner. The
  audit row for a customer acceptance names the customer, the phone and the channel.
- **Booking moves the lead:** if the slot is taken from a backup or a team member, the
  lead moves to that person, with a history note.
