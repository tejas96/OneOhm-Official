# OneOhm on WhatsApp — the redesign (v2)

Date: 2026-11-04 · Status: **draft for owner approval**
Rules: [conversation-principles.md](conversation-principles.md) · Today: [flow-map.md](flow-map.md)
v2 adds the fixes from an independent gap review (44 gaps, 17 serious) — all are covered below.

**How to read:** short sections; each says *customer sees* · *behind* · *edge cases*. Mark ✅ / ❌ /
comment anywhere. My decisions are marked **[my call]** and listed in §20; questions for you in §21.

---

## 0. In one page

**Goal:** anyone finishes anything with OneOhm in a few taps; typing only when a tap is impossible.
**Promise:** every ask is tracked from *sent* to *closed*; statuses, tasks and stages move by
themselves; when they can't, a named person is told with a deadline; nothing goes silent.

**The one idea that makes it work — "Customer actions" (§2):** everything we ask a customer to do
(send a paper, share location, do a survey, pick a date, sign, pay, confirm, rate, share UPI) is
**one kind of record** with one status line. Home, reminders, staff alerts, task waits and the web
all read from it. No parallel status systems.

**Kept from today:** papers per home (person papers vs home papers), store-once files, Move / change
kind, team alerts, pay page and receipts, estimate PDF, STOP/START, ad and referral capture.

**Removed:** 10-row menu first, "Which home?" with an Aadhaar row, silent matching of photos to
requests, silent hand-over on unknown text, 30-minute "glue", "Talk to a person" vs "Talk to us",
"Back to menu" rows, internal words ("request raised", "(via WhatsApp)", codes), late taps dropped
in silence, "We'll call you" with no task behind it.

**New:** Home greeting, customer actions with staff "Send to customer" menu, paper check by staff,
property location, self survey with discount, visit booking with confirmation, signatures,
DISCOM inspection, subsidy steps, loan updates, handover pack, AMC visits, problem reopen, one
rating system, payment proof, referral payout.

---

## 1. WhatsApp rules we must follow (hard limits)

| Rule | What it means for design |
|---|---|
| Reply buttons: max 3, title ≤ 20 chars (all 3 languages) | Short verbs; a length test for every title in en/mr/hi |
| List: ≤ 10 rows, row ≤ 24, description ≤ 72 | Long lists → "More" |
| **Pay link, Form and 📍 Location are single-button messages** | They can't sit with other buttons. Pattern: short text with reply buttons, and a tap on e.g. **[Pay ₹45,000]** answers with the pay-link message |
| Outside 24 h only templates (Meta-approved, 3 languages) | Every staff action has a template with quick-reply / link / form button. Location and lists only inside 24 h → the template's button opens the chat step that sends them |
| Template category | Survey discount offer, referral, AMC renewal = **marketing** (cost, skipped after STOP). Everything else = utility |
| Forms (WhatsApp Flows) | Published in WhatsApp Manager; uploads arrive encrypted → we decrypt and store through the **store-once** document path with the same type/size checks |
| Forms / location may not show on WhatsApp Web/Desktop/old apps | Every form step has a fallback: "Or just send the photo here" (inbound file path) |
| Read receipts optional | "Opened" is info only; never drives reminders |
| File cap 25 MB (all types) | Said clearly when exceeded |
| SMS (not on WhatsApp / after STOP) needs DLT templates; SMS replies can't reach us | Non-WhatsApp path per action (§17) |

---

## 2. Customer actions — one status system

### 2.1 Types

| Type | Customer does | Done when | Staff check? |
|---|---|---|---|
| `paper` | Sends a paper (checklist item) | File received | **Yes** — Looks good / Ask again |
| `location` | 📍 Send location | Pin received | Only if conflicts (§6) |
| `self_survey` | Fills the survey form | Form sent | **Yes** — Approve / Ask again |
| `visit_pick` | Picks day + slot | Picked | **Yes** — Confirm (crew free) |
| `presence` | "I'll be there" for inspection / visit | Confirmed | No |
| `signature` | Agrees / sends signed copy | Agreed + copy received | **Yes** |
| `pay` | Pays (online or proof) | Paid / proof recorded | Proof → finance records |
| `confirm` | Yes/No (installation done, subsidy reached bank, problem fixed, site ready) | Answered | No (No → task) |
| `rating` | 5 taps | Rated | Low → alert |
| `payout` | Shares UPI / bank for reward | Shared | **Yes** |
| `callback` | Picks a call time | Picked | Follow-up task created |

### 2.2 Status line (same for all)

`Sent → (Opened) → Done by customer → Checked ✅ / Ask again ↩︎ → Closed`
plus `Cancelled` (by staff, or automatically when the project is cancelled / lead lost — customer told once).

### 2.3 Automatic behaviour (all types)

- **Reminders:** customer at 2 days (working hours), staff alert at 4 days; windows as built
  (customer 2–7 d, staff 4–14 d); escalate to manager at 7 d.
- **Staff deadlines:** anything waiting for a staff check (paper, survey, visit confirm, signature,
  payout) → alert to the owner after 1 working day, manager after 2.
- **Task link:** when staff set a task to "waiting on customer" they pick the action(s) it waits for
  (or the app suggests them). When the last one is **Checked**, the wait ends automatically, the task
  owner is told, the project log says so.
- **Home** (§3) shows only open actions + money due + booked visits + open problems — one source.
- **Every change** writes the project log (or lead log) and audit; customer gets one short message.
- **Paper requests** built today become `paper` actions (data migrated; no second system).

### 2.4 Who may answer (family numbers, two customers on one phone)

- Family number may: send paper, location, survey, pick visit, confirm presence, pay, rate.
  Only the customer's own number may: accept quote, sign. Blocked tap → "Only Tejas's own number can
  accept this. [Talk to Priya]".
- Two customer records on one phone: ask once per chat "Who is this about?" (names list); remember.

---

## 3. Home (greeting) — replaces the 10-row menu

**Customer sees** ("hi", Menu, or unknown text):

> Hi Tejas 👋 Your **Sangli** solar is at **Installation** (4 of 7 steps).
> We need your **electricity bill**.
> **[Send it now]** **[Project update]** **[More]**

"What matters now" — first that applies: open action → money due → visit in 3 days → open problem →
quote waiting → "How can we help today?". 2+ items → "2 things need you" **[See them]** (list).
**[Send it now]** / **[Pay ₹45,000]** are reply buttons; the tap answers with the form / pay-link
message (§1).

**[More]** list: Project update · Payments · Documents · Send a paper · Report a problem · My
problems · Warranty & AMC · Refer a friend · Talk to Priya · Language.

**Edge cases:** no project yet → "We are preparing your solar plan. Priya will call you by **{time}**."
(creates a follow-up task, §2.3). Old menu ids from earlier messages map to new answers for 30 days.
Number shortcuts 1–10 are dropped (they would now mean other rows).

---

## 4. The journey — every stage, every touchpoint

| Stage | Customer gets / does on WhatsApp | Staff action | Automatic update |
|---|---|---|---|
| **Lead** | Onboarding taps (§16), bill photo | Lead screen: send estimate, book survey, ask paper | Lead made; bill → lead checklist; moves to project later |
| **Estimate** | PDF + [Self survey −₹1000] [Book a visit] [Call me] | — | Lead next action set; Call me → callback action |
| **Survey (visit)** | Pick day/slot → confirmed; day-before [Confirm] [Change day] | Ask to pick a date; confirm | Lead `survey_scheduled`; survey task date |
| **Survey (self)** | Form (§7) | Approve / Ask again | Survey task done on Approve |
| **Quotation** | PDF + [Accept] [I have a question] (+ Call me inside questions) | Send quote / **send revision (what changed)** | Accept → lead won; Not yet → check-back date |
| **After accept** | "Thank you ✅ Priya starts your project and sends the payment link **by {time}**." | Create project | Follow-up task; escalate if no project in 1 working day; advance-due message has **[Pay ₹X]** |
| **Advance payment** | [Pay ₹X] → pay link; or **send payment proof** | Payment reminder / receipt / ask proof | Paid → instalment paid; proof → finance "Record payment", reminders paused 2 days |
| **Design** (optional) | "Your layout" PDF + [Looks good] [I have a question] | Send layout | Recorded on design task |
| **Loan** (if any) | Loan papers (one action per item), "Sign at bank on …" [I'll be there], updates: sanctioned / disbursing / rejected | Ask loan papers (lender list) | Papers checked → loan task wait ends; loan status → customer message |
| **Agreements** | Model / net-metering agreement PDF + [I agree] [I have a question] → send signed copy | Send for signature | Signed + checked → evidence complete on the task |
| **Before dispatch** | "Is the roof ready?" [Yes, ready] [Not yet] | Site readiness check | Not yet → task waits on customer |
| **Dispatch payment** | [Pay ₹X] | Payment reminder | As advance |
| **Installation** | Visit pick/confirm; crew contact ("Ravi is coming, 98…"); "Is installation finished?" [Yes] [Not yet] | Share crew contact; confirm finished | `installation_started` (exists); Yes → completion confirmed; Not yet → alert |
| **DISCOM application** | Paper actions (bill, name change, etc.) | Ask papers | Papers checked → DISCOM task wait ends |
| **DISCOM inspection / net meter** | "Inspection on **Thu 6 Nov**, please be at home." [I'll be there] [Change day] | Tell inspection date | Change day → liaisoning owner alert; no reply in 1 day → alert |
| **Switch-on (commissioning)** | "Your solar is ON ☀️" + [Pay ₹X] (final) | — | `commissioning_completed` (exists) now carries pay button |
| **Subsidy** | Register on PM Surya Ghar guide [Done] [Need help]; send bank passbook; "Did ₹78,000 reach your bank?" [Yes, received] [Not yet] | Ask passbook / registration; mark released | Yes → subsidy step done; Not yet after N days → owner alert |
| **Handover** | Handover pack (warranty cards, WCR, manuals, invoice) "Your 4 handover papers" + [Documents]; sign | Send pack / for signature | Checklist row done when sent and signed |
| **Rating** | 5 taps after switch-on (stage rating, now on WhatsApp) | Re-send pending rating | Low (1–2) → alert + call task |
| **Warranty / AMC** | AMC visit due → [Confirm] [Change day]; renewal 30 d before end (marketing) | AMC confirm / renewal offer | Visit confirmed on AMC record |
| **Service problem** | Form (§12); updates; "Is it working now?" [Yes] [Still a problem] | Visit day, crew contact | Still a problem → **reopen**; Yes → rating |
| **Referral** | Refer form; reward approved → "Share your UPI" form | Ask UPI | Payout record; staff check |

---

## 5. Papers (property-specific) — the main part

### 5.1 What belongs where (kept rule)

- **Person papers:** Aadhaar/PAN (`customer_kyc`), income proof — one per customer, all homes.
- **Home papers:** everything else — per property (bill, property papers, DISCOM, subsidy bank,
  loan, agreements, site photos …).

### 5.2 When a file arrives

| Situation | Question |
|---|---|
| Exactly one paper asked (any home) | "Is this your **electricity bill** for Sangli?" **[Yes]** **[No, something else]** |
| 2+ asked | List "What is this?" = the asked papers |
| Nothing asked | List "What is this?" built from **this customer's missing checklist items first** (per home, from the document rules by DISCOM / loan / subsidy / name change), then fixed rows: **Payment proof** · **Problem photo** · **Something else** |
| Home paper and 2+ homes, home not known from the item | List "For which home?" (homes only; title = label else town; description "consumer no. …1234") |
| Person paper | Never ask the home |

- **Burst:** we wait until **15 s after the last file** before asking (one question for all). The
  list has a row **"They're different"** → we ask about each file.
- **Saved reply:** "Saved ✅ **Electricity bill** · Sangli home. We'll check it." **[Change]** **[Menu]**
- **Payment proof** → finance task "Record payment" (§10). **Problem photo** → starts §12 with the photo.

### 5.3 Staff check closes the loop

- Every received paper shows on the web as **"Received – to check"** with **[Looks good]** **[Not right — ask again (reason)]**.
- Looks good → checklist "Checked ✓", action Closed, task wait ends (§2.3), customer:
  "Your **electricity bill** is checked ✅".
- Ask again → customer: "Please send your bill again: **the consumer number is not visible**."
  **[Send it now]** (reason now reaches WhatsApp; template has a reason field).
- Not checked in 1 working day → owner alert; 2 → manager.

### 5.4 Rules fixed from today

- Duplicate check by **checklist item** (`requirementKey`), not by kind — so Aadhaar and PAN, or
  several loan papers, can be asked together.
- **Leads:** paper actions work on a lead (+ property); moved to the project when it is made.
- **Expiry:** per checklist item in Settings (e.g. bill 90 days). Before the DISCOM application a
  stale bill turns "missing" and a new ask goes out automatically.
- **Single-home and multi-home** use the same flow; ID papers never mention a home.
- Word/Excel: kept as "Something else", never answer a paper (as today).

### 5.5 One-tap "Send a paper"

[Send it now] → **form** "Electricity bill — Sangli": up to **4 files** **[Send]** (fallback: "Or
send the photo here"). Unknown paper → "What do you want to send?" (same list as 5.2) → form.

---

## 6. Property location

> Please share the location of your **Sangli** home so our team finds it easily.
> **[📍 Send location]**  → "Thank you ✅ Location saved for Sangli home."

- **Behind:** if the property has **no location**, save it (`location_source = whatsapp_pin`).
  If it **already has one** (surveyor GPS or map pin), save as a **suggestion** and show staff
  "Check location" — a customer pin never overwrites a surveyor's point.
- 2+ homes and not asked for one → "Which home is this location for?". Unasked location → same.
- Location request works only inside 24 h; the template button "Share location" opens the chat step
  that sends it.

---

## 7. Self site survey with a discount

- **When offered:** only once a **project exists** at the Survey stage (needs the project survey
  task), by staff action or Home. At lead stage the estimate offers **[Book a visit]** and
  **[Call me]**; the self survey is offered right after the project is made. **[my call]**
- **Form:** roof type · floors · photos (roof corner A, roof corner B, meter with number, main switch
  board) · shade (tap) · roof size range (tap) · consumer number (typed, only if missing).
  Location by the separate 📍 step if missing.
- **Behind:** saved as the project **survey report** (same place as a field survey) — photos as site
  photos on the home, answers as report fields. Engineer: **[Approve]** (fills cable length,
  shade-free area etc. in the same screen, or **[Book a visit]**) / **[Ask again: item]** (only the
  missing item is re-asked).
- **Discount:** after Approve, **₹1,000 credit on the next instalment** (not a quote line — a quote
  line would block acceptance and re-pricing). Customer: "Survey approved ✅ ₹1,000 off your next
  payment." **[my call]**
- Engineer deadline: 1 working day → alert, 2 → manager. Unfinished form → Home "Finish your
  survey" for 7 days.

---

## 8. Visits (survey, installation, AMC, service)

1. "When can our team visit **Sangli** for **installation**?" list: next working days where the crew
   is free (and material is ready for installation) + "Talk to Priya".
2. [Morning] [Afternoon] → "Thanks — we'll confirm by **{time}**." (a **proposal**)
3. Staff **Confirm** → "Booked ✅ **Thu 6 Nov, morning**. Ravi will call before coming." + crew contact.
4. Day before: "Our team visits tomorrow morning." **[Confirm]** **[Change day]**
5. Change day → back to step 1; staff alerted. Staff cancel/reschedule always tells the customer.

**Behind:** new visit record (project/task, day, slot, crew, proposed/confirmed). Service visits
keep their own date (exists) and get the same messages.

---

## 9. Quote

> Your quotation for **Sangli · 3.3 kW** (PDF above)
> Total **₹1,20,000** · after subsidy **₹42,000**
> Pay in 3 parts: ₹36,000 on accepting · ₹45,000 **before dispatch** · ₹39,000 after switch-on
> **[Accept]** **[I have a question]**

- Wording uses the real payment triggers (accept, dispatch, switch-on, loan disbursement).
- **[I have a question]** → list: Subsidy · Payment plan · Panels & brand · Warranty · Timeline ·
  **Call me** · Something else (→ Talk to Priya). Answers are fixed text from the quote's own data.
- **[Accept]** → "Accept for ₹1,20,000?" [Yes, accept] [Not yet] → §4 "After accept".
- **[Not yet]** → "When should we check back?" [1 week] [1 month] [Talk to Priya].
- **Revision:** staff send with "What changed" → customer sees the change line first.
- Built template `quotation_sent` keeps 2 buttons (Call me lives inside the question list).

---

## 10. Payments

> **Sangli solar** — ₹1,20,000 total
> ✅ ₹36,000 paid · 🔴 **₹45,000 due now** · ⚪ ₹39,000 after switch-on
> **[Pay ₹45,000]** **[Receipts]** **[I paid another way]**

- [Pay ₹45,000] → pay-link message. Two homes due → one message each (max 2).
- **[I paid another way]** → form: amount (prefilled), date, proof photo → finance task "Record
  payment"; reminders for that instalment paused 2 days; customer: "Thanks, we'll confirm within 1
  working day." Recorded → receipt sent automatically.
- After paying online: receipt + "₹45,000 received ✅ Next: dispatch." [Project update] [Menu].
- Bank loan part: "₹60,000 by bank loan".

---

## 11. Documents (ours to the customer)

1 paper → sent with one-line caption. 2+ → list (newest first). Gone → "That paper is not available
any more — here is the latest list." Staff can **send any document** from the web (row action).

---

## 12. Problems

**Form:** home (2+ homes) · what is wrong (tap: Inverter error · No power · Low power · Damage ·
Cleaning · Bill/meter · Other) · since when (Today · This week · Longer) · up to **3** photos/videos ·
anything to add (optional).

> Thank you ✅ Noted: **Inverter error · Sangli**. **{Name}** will call you by **{time}**.
> **[My problems]** **[Menu]**

- Name = assignee, else the service desk cover person; time-aware ("tomorrow from 9:30"). A call
  task is created; missed → escalation.
- Updates: visit day [Confirm] [Change day]; "Fixed ✅ Is it working now?" [Yes, working]
  [Still a problem] → **reopen** (status open, response clock restarts, assignee alerted).
  Yes → problem rating (5 taps).
- Voice note during a problem → attached, no hand-over.

---

## 13. Rating — one system

- Stage rating requests (built) move to WhatsApp 5 taps (no "rate it in the app").
- Problem ratings after "Yes, working".
- Staff "Ask for a rating" only re-sends the pending one.
- 1–2 stars → "Sorry to hear that. Priya will call you by {time}." + alert + call task.

---

## 14. Talk to a person, language, unknown text, small talk

- **Talk to Priya:** "Priya will reply here. She is available Mon–Sat, 9:30–6:30." Outside hours:
  "…will reply tomorrow from 9:30." [Menu]. Bot stays usable.
- **Hand-back** (Release / 4 working hours / Menu): told only if the customer wrote meanwhile:
  "Priya is away now — we're here to help." [Menu].
- **Language:** More → Language; typing in Devanagari switches automatically (ask once if Marathi
  vs Hindi unclear).
- **Small talk** ("ok", "thanks", 👍, "good morning") → short reply, no buttons, no alert.
- **Known words** (grown lists en/mr/hi: when/kab/kevha, how much/kitna/kiti, visit, bill, paid,
  subsidy, problem …) → the matching answer.
- **Unknown text** → "Sorry, we didn't get that. Pick one below." [Talk to Priya] [Project update]
  [More]. **Second unknown in a row** → handed to Priya with the text, said clearly.
- **Callback:** "When should Priya call?" [Morning] [Afternoon] [Evening] → follow-up task.
- **Late or old tap** → "That was an earlier message — here is the latest." + current step (no
  silent drop).

---

## 15. Referral and rewards

- Refer: form — friend's name, mobile (typed), city (tap) → "Thank you! We'll call Suresh. You get
  ₹2,000 when their solar is installed." [My rewards] [Share my link].
- Reward approved → "Share your UPI ID to receive ₹2,000." form → payout record → staff check →
  paid → "₹2,000 sent to your UPI ✅".

---

## 16. New contacts (strangers and leads)

1. Language (3 buttons) 2. "Shall we call you **Tejas**?" [Yes] [Change] (type name — only typing)
3. City list + [📍 Send location] (fills city) 4. Where: Home / Society / Shop / Farm 5. Monthly
bill bands 6. Roof + floors (one form) 7. Bill photo [Send bill] / [Later]
8. Estimate PDF → **[Book a visit]** **[Call me]** **[Not now]**

Fixes: "ok/thanks/👍" after the estimate → short reply (no hand-over loop); team-made lead saying
"hi" → "Hi Suresh 👋 Priya from OneOhm is helping you." [Talk to Priya] [Quick estimate]; onboarding
off still stores bill photos on the lead.

---

## 17. Customers not on WhatsApp (about 2%)

| Action | Path |
|---|---|
| Paper, rating, problem | OneOhm app (exists) or SMS "Send it from the OneOhm app, or give it to our team" |
| Location, survey, visit pick, signature, confirm, payout | **In person**: a task "Do with customer in person" for the owner (customer handovers list) |
| Pay | SMS pay link |
| Quote accept | In person (owner) |

SMS texts need DLT registration (owner).

---

## 18. Staff side — "Send to customer"

One button **"Send to customer"** on the customer, project, lead, chat, task and ticket screens;
each opens a short sheet (preview of exactly what the customer gets).

| # | Action | Where it also appears |
|---|---|---|
| 1 | Ask for paper(s) — pick checklist items | Documents checklist "Ask" |
| 2 | Ask location | Property card |
| 3 | Offer self survey | Survey task |
| 4 | Ask to pick a visit date | Survey / installation / AMC task |
| 5 | Confirm / reschedule / cancel visit | Visit record |
| 6 | Share crew / technician contact | Task assignment, service ticket |
| 7 | Send quote / revision (what changed) | Quotations |
| 8 | Payment reminder / ask payment proof / send receipt | Finance → Receivables |
| 9 | Send a document (invoice, WCR, warranty …) | Documents row |
| 10 | Send for signature | Paperwork, handover task |
| 11 | Ask loan papers | Finance → Loans |
| 12 | Tell DISCOM inspection / net-meter date | DISCOM task, DISCOM desk |
| 13 | Site readiness check | Dispatch task |
| 14 | Confirm installation finished | Installation task |
| 15 | Subsidy: registration help / passbook / confirm credit | Subsidy task |
| 16 | Handover pack | Handover task |
| 17 | Delay notice with reason | When a task is set to waiting |
| 18 | AMC visit confirm / renewal offer | Customer → Aftercare |
| 19 | Ask callback time | Chat |
| 20 | Ask UPI for reward | Rewards |
| 21 | Re-send pending rating | Customer → Feedback |
| 22 | Lead: send estimate / book survey | Lead screen |

Every action → a customer action record (§2) shown in one **"Asked from the customer"** card on the
customer and project pages, with status, reminders, cancel (tells the customer) and audit.

---

## 19. Automatic messages (sent by the system)

| Event | Message + buttons |
|---|---|
| Project created | "Your project has started. Priya is your project manager." [Pay ₹X] (advance) |
| Instalment due (dispatch, switch-on) | "₹45,000 is due before dispatch." [Pay ₹45,000] [I paid another way] |
| Payment received | Receipt PDF + next step |
| Task waiting on customer | "We need **{item}** to continue." [Send it now] |
| Task waiting on DISCOM/bank | "Waiting for the electricity board since 2 Nov. We'll update you." |
| Installation started | "Our team started installing at Sangli today." |
| Switch-on | "Your solar is ON ☀️" [Pay ₹X] / [Warranty & AMC] |
| Handover | Pack + [Documents] |
| Problem status / visit | Status line + [Confirm] [Change day] / "Is it working now?" |
| Stage rating | 5 taps |
| AMC due | [Confirm] [Change day] |

---

## 20. Decisions I made (please check)

1. **One "customer actions" system** replaces separate paper requests, task-wait links and rating
   asks (existing paper requests migrate into it).
2. **Staff check** on papers, survey, visit, signature and payout; deadlines 1 / 2 working days.
3. **Self survey** only after a project exists; discount = **₹1,000 credit on the next instalment**
   (amount in Settings).
4. **Customer location pin** never overwrites a surveyor's point; it becomes a suggestion.
5. **Burst** = wait 15 s after the last file; "They're different" row.
6. **Unknown text**: sorry + choices; person on the 2nd unknown in a row.
7. **Visit pick** is a proposal until staff confirm.
8. **Number shortcuts** 1–10 dropped; old menu ids work 30 days.
9. **Rating**: one system on WhatsApp; stage ratings stop pointing to the app.
10. **File limits**: papers 4, problems 3, survey photos 1 per item.
11. Voice is **"we"** everywhere (never "I"); principles §10 updated to allow the staff
    "Send to customer" menu and check screens.

## 21. Owner answers (2026-11-04) — plan approved

1. **Self-survey discount:** configurable in Settings (the place where survey and pricing rules
   live). Default ₹1,000 credit on the next instalment; the owner can change the amount or switch
   the offer off.
2. **Referral reward:** already configurable (Settings → referral program: amount, per referral or
   per kW, qualifying event, budget, per-customer caps, eligible project types); rewards are tracked
   pending → approved → paid with method and reference. Missing piece we add: the customer's **UPI
   ID** (UPI only), asked on approval, checked by staff, shown on the reward, used when marking paid.
3. **Bill validity:** 90 days default, configurable per checklist item.

## 21a. Product philosophy check (PRD v2, §1 principles)

| PRD principle | How this redesign meets it |
|---|---|
| Exceptional, calm UX | 3-line messages, one idea each, real names, tap-first |
| Zero learning curve | Home shows what matters now; every reply offers the next step |
| Complete business control | Every customer action has a status, audit and owner |
| Smart automation | Reminders, task waits, escalations, auto-cancel, receipts run by themselves |
| Operational accuracy | One status system; papers, payments, survey and stage stay connected |
| Customer experience | Customer always sees status, payments, subsidy, next step on WhatsApp |
| Configurability | Discount, expiry, reminders, rewards, templates and per-task customer messages in Settings |
| Simplicity | One "Send to customer" button and one "Asked from the customer" card; no other new screens |

**PRD rule kept:** internal tasks never message customers automatically — the automatic messages in
§19 only go out for tasks/events switched on in the task template's customer-message settings.

## 22. What changes in what we built today (papers per home)

Replaced: "only home with open requests → auto-file", 30-min batch glue, the Aadhaar/PAN row in
"Which home?", "stray file → other + Saved" (now "What is this?"). Code: `paper-match.ts`,
`file-home.ts`, `file-home-flow.ts`, `file-paper-flow.ts`, `media-intake.ts`, `paper-reminders.ts`,
document requests → customer actions.

### 22a. Built in phase 1b (customer actions)

- Table `customer_actions` (type, status `open → received → closed`, `cancelled`) replaced
  `document_requests`; migration `0073` copies every row (ids, times, files, notes, askers), takes all
  papers already on file as checked, then drops the old table. Only type `paper` has a flow.
- Audit: new rows use entity `customer_action` and actions `customer_action.{created,answered,reasked,
  cancelled,checked,superseded}`; rows written before 0073 keep `document_request.*` (readers count both).
  Project log kinds (`document_request`, `document_received`) are unchanged.
- A paper the customer sends arrives unchecked (`documents.checked_at` empty); the team's own uploads
  are checked on upload and close the request at once. `POST /documents/:id/check` (Looks good) closes
  the request and tells the customer; `POST /document-requests/:id/reask` (Ask again, reason 2..300)
  reopens it and tells the customer the reason.
- Duplicate rule: the same open `requirement_key` on the same home (a person's paper: same customer);
  a caller with no key is compared by kind. The ask sheet keys free asks by kind and words, so Aadhaar
  and PAN can be asked together.
- Paper asks may be made on a lead with a site; they move to the project when it is made.

### 22b. Built in phase 2a (papers: first what, then where)

- A photo or PDF from a known customer is stored at once and **waits** (`filesWait` in the chat's
  context; `assistant/files-wait.ts`). Nothing is filed until the customer says what it is.
- **The question** (`file-questions.ts`, `what-question.ts`): one paper asked → "Is this your *bill* for
  Sangli?" [Yes] [Something else]; two or more → list of them; nothing asked → the customer's missing
  checklist papers (per home, ID papers once) then Payment proof, Problem photo, Something else. A
  home paper asks "For which home?" only with two or more homes. ID papers never ask.
- **Burst**: the question goes 15 s after the last file (`FILE_WAIT_SECONDS`). The due time is in the
  chat context; the API looks for due questions every 2 s (`FILE_QUESTION_TIMER`, the same kind of
  timer as the onboarding nudge), so a restart loses nothing. `POST /v1/whatsapp/file-questions/run`
  runs it by hand with a pretend clock (the acceptance suite). "They're different" asks about each file.
- **Saved ✅** + [Change] [Menu] (`what-answer.ts`, `what-saved.ts`); [Change] works for 24 h on papers
  the team has not checked yet (`DocumentMoveService.release`: audit, project log, a request the paper
  answered is asked again quietly). "We still need your X" [Send it now] when that home still waits.
- **Payment proof** → document kind `payment_proof` (customer-visible, never on a checklist), alert to
  `finance.record_payments` holders, `payment_milestones.reminders_paused_until` = +2 days (ends when a
  payment is recorded; the worker's reminder job skips it). **Problem photo** → the Report-a-problem
  flow with the photo.
- **Home** says "You have {n} files not saved yet." [What are they?]; after 2 h the staff alert
  "Files to sort" (now for every customer, not only those with two homes).
- **Expiry**: `document_requirements.max_age_days` (Settings → required papers; the electricity bill is 90
  days). A paper older than that shows "Too old — ask again" and counts as missing; when the DISCOM
  application task starts, a stale paper is asked for again with "We need your latest electricity bill
  for {home}. The one we have is from {month}."
- Removed: remembered-home filing, "only home with open requests", the 30-minute glue, the Aadhaar/PAN
  home row, "stray file → other + Saved" (`file-home*.ts`, `file-paper-flow.ts`, `paper-steps.ts`).

## 23. Build order (each phase tested live on your phone)

1. **Foundation:** words dictionary + length tests; Home + More; small talk; unknown text; hand-over /
   hand-back wording; language; late-tap reply; customer actions table + "Asked from the customer"
   card; migrate paper requests.
2. **Papers:** "What is this?" from checklist, staff check, reason on re-ask, expiry, leads,
   burst timer, [Change], forms + fallback.
3. **Send to customer** menu (actions 1, 2, 4–9, 17, 19) + location + visits + payment proof.
4. **Journey steps:** signatures, DISCOM inspection, subsidy, loan, readiness, installation
   finished, handover pack, automatic messages with buttons.
5. **Self survey** + discount credit + engineer approve.
6. **Quote questions**, problems form + reopen, rating unification, referral payout, AMC.
7. **Onboarding refresh**, non-WhatsApp paths, clean-up of old code/words/tests, full acceptance +
   live check.

**Owner tasks with Meta / telecom:** about 20 templates × 3 languages (I prepare all texts); publish
forms in WhatsApp Manager (I prepare them); SMS DLT templates.

---

## 22c. Phase 2b — forms (WhatsApp Flows) and "Send a paper"

- **Where:** `apps/api/src/modules/whatsapp/forms/`. The form list is `form-registry.ts`; the
  Flow JSON of "Send a paper" is `send-paper.flow.ts` (version 2.0, Flow JSON 6.0). Two
  screens, because a picker's files cannot travel in a navigate action: SEND_PAPER (a
  PhotoPicker, camera or gallery, 1 to 4 photos, Send, and the link "Have a PDF instead?") and
  SEND_PDF (a DocumentPicker, PDFs only, 1 to 2). All words come from the start data
  (`form-words.ts`), so one published flow serves English, Marathi and Hindi. No data
  endpoint: the message opens the first screen with `flow_action: navigate` and the files come
  back in the `nfm_reply` webhook under `photos` or `pdfs`.
- **Sending:** `FormSendService.sendForm(chat, customerId, formKey, start, fallbackText)` queues an
  outbox session kind `flow`. No flow id (Settings → WhatsApp messages → Forms) or a chat
  outside 24 h: the fallback text goes. The form message ends "Or just send the photo here."
  If WhatsApp refuses the form, the worker sends the same fallback text as a plain message
  (`flow-fallback.ts`) and the team's alert stays.
- **Which paper:** one paper asked (Send it now, More → Send a paper, "We still need" button) opens
  its form. Otherwise "What do you want to send?" lists the asked and the missing checklist
  papers (per home), and a row opens that paper's form (`form-pick.ts`).
- **Token:** every form carries a random `flow_token` in `wa_flow_tokens` (form, chat, customer,
  what it is for, 7-day expiry, used once; the daily clean-up removes spent ones). Unknown,
  used, expired or another chat's: "That form is old — please try again." and Home (not in a
  chat a person holds). A valid token with no readable file asks for the photo in the chat and
  alerts the team.
- **Files:** WhatsApp posts form files as media ids (name, type, SHA-256); each is downloaded
  like a chat file, its SHA-256 checked, then the same type/size/empty checks and the store-once
  path. A failure tells the customer the true reason once and alerts the team.
- **Answer:** the files answer the paper the form was sent for (no "What is this?"), then the
  normal Saved reply with [Change]. If that paper is gone or its home unknown, nothing is
  guessed: the files wait for "What is this?".
- **Publishing:** `pnpm --filter @oneohm/api forms:publish` prints what it would do; with `--yes`
  it creates (a draft is reused; a published name gets a new dated flow), uploads, publishes and
  prints the flow id.


## 22d. Phase 3a — "Send to customer", location, payment proof, documents

- **One button, one sheet** (`apps/web/src/features/send-to-customer/`): the same
  `SendToCustomerButton` on the customer header, project header, lead header, chat header and
  task panel. The sheet lists the actions that fit the place (`sendActionsFor`, domain: papers only
  on a project or lead; payments, crew and delay notices never on a lead; the delay notice only
  from a task). Each offer shows the customer's exact message (words, buttons, language, and
  "approved message" when the chat is closed); the same builder (`send-messages.ts`) makes the preview
  and the send. Papers: the sheet opens the existing ask sheet (no second paper UI). A document row
  has its own Send icon.
- **Rights** (any one; `rightsFor` / `rightsForAsk` in the domain, used by the server and the web): papers and
  documents `documents.upload`/`documents.manage`; location `customers.manage` or `projects.manage`;
  call-back `customers.manage`, `leads.manage` or `projects.manage`; payment reminder, receipt and proof
  `finance.record_payments` or `projects.manage`; crew and delay notice `projects.manage`. Cancelling,
  "Check location" and "Called" need the rights of sending that kind of ask.
- **Asks are customer actions** (`location`, `pay`, `callback`): status, project/lead log, audit
  (`customer_action.*`), reminders (a location is asked again at 2 days with its template; the asker is
  told at 4 days for all three; payments are chased by the payment reminders already), and a cancel that
  tells the customer in the chat (window open) and the app inbox. Documents, crew contact and delay
  notices need no action: log line and audit only.
- **Location (§6):** inside 24 h WhatsApp's own location request message; outside, the
  `location_request` template whose button (`locreq:<id>`) opens the chat step that sends it. A pin on a
  home with no point is saved (`location_source = whatsapp_pin`) and closes the ask; on a home that has
  a point it waits as a suggestion (action `received`, "Check location" on the card with the distance:
  Use this location / Ignore; the earlier point is kept to put back); with 2+ homes and no ask the
  customer picks the home from a list. A pin that answers nothing in a chat a person holds is theirs.
- **I paid another way (§10):** on the Payments answer ([Pay ₹X] [Receipts] [I paid another way]), on
  the staff payment reminder and the proof ask. It opens the `paid_another_way` form (one screen:
  amount, day, photo; `forms:publish` publishes it like the paper form); without a published form the chat
  asks for the photo. The reply files a payment proof on the instalment's project, alerts finance
  ("Record payment", with the amount and day), pauses the reminders 2 days, moves the `pay` action to "To
  check" and thanks the customer. Recording the payment closes the action; the receipt goes as built.
- **Call-back (§14):** Morning / Afternoon / Evening. A pick makes the ask "To call" (waiting for the team,
  not closed); staff close it with "Called", or by logging a call on the lead. The open lead's next action
  (10:00, 14:00 or 17:30 business time; tomorrow if the slot has started) is set only when it has none or a
  later one, otherwise the ask is logged beside it. The chat's person (project manager, else lead owner, else
  the desk) is told. A customer with no open lead has no follow-up list, so that alert is the follow-up.
  A call time never picked is asked again at 2 days.
- **Staff checks:** a received location suggestion, a payment proof and a "To call" wait for the team: after
  1 day the person who asked is told, after 2 days the project manager. A pin waiting for its home for a day
  alerts the chat's person.
- **Delay notice:** offered from a task that waits, only when the task's customer messages are on.
- **Phase 2b gap:** an asked paper with no known home and 2+ homes asks "For which home?" first, then
  opens that home's form (`form:h:` rows; the home rides in the token).
- **Review round 1:** one id per press of Send (a double tap sends once); a pin picked for a home closes the
  team's ask for it; automatic payment reminders and pay links carry the same [I paid another way] quick reply;
  Home lists open location and call-back asks ([📍 Send location], [Pick a time]); a pin in a chat a person holds
  is saved and told to the person, with no bot reply; a template row missing counts as off.
- **Review round 2:** the [I paid another way] quick reply on payment_reminder / payment_link has its own switch
  (`message_templates.quick_replies_approved`, off by default, in the message's settings dialog): off keeps the
  older shape (the Pay link alone at position 0) so a live template never breaks; submit the newer version to
  Meta first, then switch on. A missing template row is off for the Send to customer templates, by one rule
  (`templateIsOn`) in both the staff preview and the worker.

## 22e. Phase 3b — visits (pick a day, confirm, remind, change, DISCOM presence)

- **One visit record** (`visits`, migration 0080): kind (survey, installation, inspection, net_meter, amc, service),
  the task / lead / service request / AMC visit it belongs to, home, day, slot (morning or afternoon), crew,
  `proposed` (the customer's pick) → `confirmed` → `done`, or `cancelled` / `missed`. One open visit per task, per
  service request and per lead survey (partial unique indexes). A service request's own `visit_on` mirrors its open
  visit, so ticket screens keep working and no screen shows two dates; the migration turns every booked service day
  into a visit.
- **Ask to pick a day** (Send to customer `ask_visit`, also the "Ask the customer to pick a day" button in the visit
  card on a task, ticket and lead): the list of the next 9 working days the person who comes is free (Monday to
  Saturday, not on leave, at least one of the two slots not held by another open visit of theirs) plus "Talk to
  {name}", then [Morning] [Afternoon] (only free slots). Material readiness for an installation is **not** checked: the
  data is not kept per project. The pick makes the visit `proposed`, the ask `received` (Staff check: Confirm), alerts the owner, and
  answers "Thanks — we'll confirm by …". Only for tasks whose template allows customer messages; service, AMC and
  lead surveys always.
- **Staff steps** (visit card, `/visits`): Confirm (the proposed day), set or move a day (checked against the crew's
  slots), Mark done, Cancel. Confirm sets the task's start date to the day (due date moves out if earlier), closes the
  ask and tells the customer "Booked ✅ Fri 6 Nov, morning. Ravi will call before coming" with [Okay] [Change day];
  a move says "We have moved your visit"; cancel tells the customer (chat while open, always the app inbox). A visit
  the team sets without a pick is confirmed straight away. A survey on a lead moves an early lead to
  `survey_scheduled` and sets the day as its next action.
- **Day-before reminder** (worker, working hours): the working day before (Saturday for Monday), once, only if the
  booking is older than that day, by the `visit_reminder` template [Confirm] [Change day]. Confirm is logged
  (`customer_confirmed_at`). Change day cancels the visit, opens a new ask, answers with the list again ("No problem.")
  and alerts the owner. No confirmation by the visit morning alerts the owner once.
- **DISCOM inspection and net meter** (`presence`): staff set the date in the visit card ("Tell the customer the DISCOM
  date") — the customer gets [I'll be there] [Change day]. Change day does not reopen a pick (the board chose the
  day): the person who liaises (task assignee, else the project manager) is alerted that the customer cannot be there;
  no answer in 1 working day alerts too.
- **Service and AMC**: the service desk's visit day goes through the record (the first free slot of the person
  assigned; the desk chooses days, not times) and the same messages; the older `service_visit_booked` message still
  goes outside the window until `visit_booked` is switched on. An AMC visit due (a week ahead) asks "Your free AMC visit
  for Sangli is due. Pick a day:" by `visit_pick` once that template is on, otherwise the older notice. Unanswered asks
  are repeated at 2 days and reach the asker at 4 days like the other asks; a picked day nobody confirms reaches the
  owner at 1 working day, the manager at 2.
- **Loop closing**: every change writes the project log or lead timeline and an audit row (`visit.*`); a visit not
  marked done by 6:30 pm of its day is `missed` and the owner is told, unless its task is completed or its request
  resolved (then it is `done`); "Asked from the customer" shows the ask ("To confirm"); Home lists the visits of the
  next three days from the record and an unanswered ask ([Pick a day]); [Visit details] lists the next 30 days.


## 22f. Phase 4a — journey steps (signature, roof ready, installation finished, handover pack, buttons on automatic messages)

- **Four more Send to customer actions** (project and task places; `apps/api/src/modules/journey/`): `send_signature`
  (documents rights), `ask_site_ready`, `ask_installation_check`, `send_handover_pack` (projects rights). A step that is
  asked about (the task) must have its template's customer messages on (§21a); the roof question belongs to the dispatch step,
  the installation question to the installation step. Each is a customer action (`signature`, `confirm`) with status, project
  log, audit (`customer_action.*`), a cancel that tells the customer, and the "Asked from the customer" card.
- **Signature:** PDF, then "Please read your *paper* for home." [I agree] [I have a question]. Only the customer's own number
  agrees (a family number: "Only Tejas's own number can agree to this." + Talk to {name}); the agreement is logged with who, the
  number and the time, then "Please send a photo of the signed page." [Send photo]. The signed copy is a paper of its own (the
  existing paper flow: form or chat, then Looks good / Ask again with a reason). Done = agreed + copy checked; the ask closes
  and, when it came from a task that needs a signature, the checked copy becomes that task's signature evidence. A question
  goes to the chat's person with the paper named. Cancel cancels the waiting copy too.
- **Roof ready (`confirm`)**: goes by itself when the dispatch step becomes ready (if its template allows) and from the task.
  Yes closes; Not yet keeps the ask open, sets the dispatch step "waiting on the customer" (the existing wait, kept stretch),
  alerts the step's owner, Home lists it with [It's ready now], which closes it and opens the step again.
- **Installation finished (`confirm`)**: goes by itself when the installation step is completed (if allowed). Yes is logged.
  Something is wrong tells the project manager and starts Report a problem on this home ("Installation: …").
- **Handover pack:** every handover paper (warranty cards, commissioning papers, manuals, the saved Work Completion Report when
  customers may see it, the invoice; at most 8) as documents in one go + "Your n handover papers … are above." [Documents]
  [Warranty & AMC]; sent by itself when the handover step is done (if allowed) or by staff. Outside 24 h the `handover_pack`
  template's [Documents] sends the papers. "Handover pack sent" is the project fact `handover_pack_sent` (day) and a log line.
- **Automatic messages with buttons (§19):** inside 24 h the chat message, outside it the existing template (whose newer version
  carries the same buttons behind its own quick-reply switch, default off): installation started [Project update]; switch-on
  [Pay ₹X] (final instalment due) and [Warranty & AMC]; a step waiting on the customer "We need *item* to continue." [Send it now]
  linking the step's open ask (paper, location, payment, signature, question), free text only when there is none; waiting on the
  bank or DISCOM one info line. Project created keeps its plain message: the advance-due message that follows it already has [Pay].
- **Reminders:** the roof and installation questions are asked again at 2 days (template, working hours) and the asker hears at
  4 days; a paper to agree to is chased through the asker alert at 4 days, and once agreed its signed copy is chased as a paper.
- **Review round 1:** the chat version of an automatic message follows the template's on/off switch and the customer's WhatsApp
  opt-in (else the template path); "I have a question"/the link of a waiting message resend the paper itself with its two
  buttons; a roof ask cancelled after "Not yet" opens its step again (only the wait that ask started); a roof or installation
  ask whose step is done closes quietly; waiting-on-customer names what is needed ("your roof check", "your signature on …",
  or the step); the handover pack offer says "Sent on …/Not sent yet" and the fact is set only when the papers really went;
  reminders for "Not yet" count from the answer (`site_ready_reminder`), a paper not agreed gets `signature_reminder` at 2 days;
  cancelling only the signed copy reopens the signature; the signed copy is filed in the paper's own folder (else DISCOM papers).

## 22g. Phase 4b — subsidy, loan and layout steps

- **Four more Send to customer actions** (project and task places; `apps/api/src/modules/journey/step-*.ts`): `ask_subsidy_register`,
  `ask_subsidy_credit`, `ask_bank_sign`, `send_layout` (rights: projects; the layout also documents). Each asks about one task
  of the project (subsidy application, subsidy release, loan sanction, system design) and needs that task's customer messages on
  (§21a). Each is a `confirm` customer action whose payload names its kind (`subsidy_register`, `subsidy_credit`, `bank_sign`,
  `layout`), with status, project log (on the step's own history), audit, reminders, a cancel that tells the customer, a row in
  "Asked from the customer" and a Home line. Taps `stp:ok|alt|now:<id>`.
- **PM Surya Ghar registration:** "Please register on the PM Surya Ghar portal for your *home* solar. It takes 5 minutes:" with three
  short steps and pmsuryaghar.gov.in; [Done] [Need help]. Done: logged on the subsidy step, closes, the step's owner is told. Need
  help: closes and the chat goes to its person (hand-over alert "Needs help to register…").
- **Bank passbook:** the existing paper ask on the `subsidy_bank` checklist row, one tap in the Send to customer sheet of a subsidy
  step (web "Ask for these papers" row; no new API).
- **Did the subsidy reach your bank?** "Did the *₹78,000* subsidy for *home* reach your bank account?" [Yes, received] [Not yet].
  Goes by itself when the subsidy release step is done (if its template allows) and from the step once it is done. Yes: closes,
  project fact `subsidy_received`, owner told. Not yet: stays open with [It has arrived] (also on Home); after the days in
  Settings → Reminders (default 15, counted from the answer) the owner of the step is told once ("says the subsidy has not
  reached them"). The project update line still reads the subsidy status from the tasks, so it is the same status.
- **Loan papers:** the loan card's Send to customer sheet lists the lender's papers still to come (else the checklist item
  "Bank loan papers"), each asked with one tap or all at once: one paper action each (existing flow). When the last loan paper is
  checked (Looks good, or a staff upload) the "Collect loan documents" step stops waiting on the customer and its owner is told.
- **Loan news:** sanctioned, money sent (each disbursement) and not approved go to the customer by themselves when the loan step
  ("Bank loan sanction") allows messages: chat inside 24 h if the template is on, else the approved template (off by default).
  Not approved also alerts the chat's person to call. Once per status or payment; the project log says what really went.
- **Sign at the bank:** staff give the branch and the day in the sheet; "Please visit *bank, branch* on *day* to sign the loan
  papers." [I'll go] [Change day]. Change day tells the loan step's owner and closes the ask.
- **Layout approval:** a report or uploaded document (layout/design files first) + "Here is how the panels will sit on your *home*
  roof." [Looks good] [I have a question]. Looks good: logged on the design task, owner told. A question goes to the chat's person
  and the ask stays open, so the customer can still approve.
- **Templates (inactive by default, migration 0083, docs 42-48):** `subsidy_register_help`, `subsidy_credit_check`, `bank_sign_visit`,
  `layout_approval` (quick replies), `loan_sanctioned`, `loan_disbursed`, `loan_rejected`. The 2-day reminders reuse the ask's own
  template (the layout reminder uses `signature_reminder`, whose button shows the layout again).
