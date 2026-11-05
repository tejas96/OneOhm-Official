# OneOhm on WhatsApp — the full flow, end to end (as built)

Date: 2026-11-05 · Branch: `feat/whatsapp-redesign`
This is the one document for **what happens, step by step**, in every WhatsApp flow: what the customer
sees, what they tap, which status changes, what staff see, and what happens when nobody acts.
The reasons behind each choice are in [redesign.md](redesign.md). The rules every message follows are in
[conversation-principles.md](conversation-principles.md). New contacts step by step are in
[part-1-entry-and-onboarding.md](part-1-entry-and-onboarding.md). Templates and their Meta status are in
[../whatsapp-templates.md](../whatsapp-templates.md). Release steps are in [../DEPLOYMENT.md](../DEPLOYMENT.md).

How to read each flow:

| Row | Meaning |
|---|---|
| **Starts when** | The event or tap that begins the flow |
| **Customer sees** | The exact message and buttons (English shown; Marathi and Hindi say the same) |
| **Customer taps** | What each button does |
| **Status** | The customer action record and the other records that change |
| **Staff see** | Screen, alert or task, and who gets it |
| **If nobody acts** | Reminders and escalation |
| **Not on WhatsApp** | What happens for a customer we cannot reach on WhatsApp (§20) |

---

## 0. Rules that apply to every flow

1. **Inside the 24-hour window** (the customer wrote to us in the last 24 hours) we send a chat message
   with buttons. **Outside it** we send the Meta-approved template; its quick-reply button opens the same
   chat step. A template switched off in Settings is never sent.
2. **Every ask is one customer action** with one status line:
   `Sent → Done by customer → Checked ✅ / Ask again ↩︎ → Closed`, or `Cancelled`.
   Types: paper · location · self_survey · visit_pick · presence · signature · pay · confirm · rating ·
   payout · callback.
3. **Every change** writes the project (or lead) log and the audit, and the customer gets one short message.
4. **Reminders** (worker, every few minutes, working hours only):
   - Customer: one reminder at 2 days.
   - Asker: alert at 4 days. Manager: alert at 7 days.
   - Waiting for a staff check (paper, survey, visit confirm, signature, payout, payment proof):
     owner alert after 1 working day, manager after 2. A re-check after "Ask again" is chased again.
5. **A step waiting on the customer opens again by itself** when an ask of that project (or of that step)
   was closed after the wait began and none is still open or waiting for the check. The step owner is
   told and the log says so. Ratings, call-backs and UPI asks never hold a step.
6. **Asks cancel by themselves** when the lead is lost; the customer is told once.
7. **Family numbers** may do everything except accept a quote and sign. A blocked tap gets
   "Only Tejas's own number can accept this quote." and the chat goes to their person.
8. **Buttons:** at most 3, each ≤ 20 characters. Lists: ≤ 10 rows. A pay link, a form and 📍 location
   are one-button messages, so a reply button (for example **[Pay ₹45,000]**) answers with them.
9. **Marketing messages** (self-survey offer and reminder, AMC renewal) are skipped after STOP and never
   go by SMS.
10. **A message WhatsApp cannot pass on** ("Unsupported message", for example some videos) always gets
    "Sorry, we couldn't open that. Please send it again as a photo, PDF or text." **[More]**
    **[Talk to {name}]**, once per burst, also in a chat a person holds. A new contact hears it, then the
    onboarding question they were on.

---

## 1. Who is talking (decided on every message)

```
Message comes in
├─ STOP / START ............... opt out / back in (always first)
├─ "hi", "hello", "menu" ...... Home (customer) · onboarding (new contact) · hello (lead made by the team)
├─ Chat held by a person ...... bot stays quiet, the person is alerted
│                               except: the bot's own taps, forms, files during a problem report,
│                               and messages WhatsApp could not pass on
├─ Late tap ................... "That was an earlier message — here is the latest." + the current step
├─ Unknown number ............. onboarding by taps (§3)
└─ Known customer ............. Home and every flow below
```

Languages: English, Marathi, Hindi. A new contact picks with 3 buttons. A customer changes it under
More → Language. Typing in Devanagari switches by itself (asked once when Marathi and Hindi can't be told
apart). Hours text: "Mon–Sat, 9:30 am–6:30 pm"; on Sunday a person "replies on Monday from 9:30".

---

## 2. Home and More

| | |
|---|---|
| **Starts when** | "hi", Menu, or the first message of the day |
| **Customer sees** | "Hi Tejas 👋" + the one thing that matters now, first that applies: open ask → money due → visit in 3 days → open problem → quote waiting → "How can we help today?". Buttons: **[the action]** **[Project update]** **[More]**. Two or more things → "2 things need you" **[See them]**. |
| **More list** | Project update · Payments · Documents · Send a paper · Report a problem · My problems · Warranty & AMC · Refer a friend · Talk to {name} · Language |
| **No project yet** | "We are preparing your solar plan. {Name} will call you {when}." **[Talk to {name}]** **[More]**. Staff: alert + a **call task** (chased when late), once a day per chat. |
| **Small talk** | "ok", "thanks", 👍 → a short word back, no buttons, no alert |
| **Unknown words** | "Sorry, we didn't get that." **[Talk to {name}]** **[Project update]** **[More]**. The 2nd unknown message in a row goes to the person, said clearly. |

---

## 3. New contacts (onboarding)

| Step | Customer sees | Taps |
|---|---|---|
| 1 | Language | **[English]** **[मराठी]** **[हिंदी]** |
| 2 | "Shall we call you Suresh?" | **[Yes]** **[Change]** (Change → type the name) |
| 3 | City | List + **[📍 Send location]** (a pin in a served city fills it) |
| 4 | Site | Home / Society / Shop / Farm |
| 5 | Monthly bill | Bill bands |
| 6 | Roof, then floors | Two lists |
| 7 | Bill photo | Send the photo, or **[Send later]** |
| 8 | Estimate PDF | **[Book a visit]** **[Call me]** **[Not now]** |

- **Book a visit** → free days → Morning / Afternoon → lead next action + owner alert.
- **Call me** → "{owner} will call you today / tomorrow morning / on Monday morning" + lead next action + alert.
- **Not now** → **[1 week]** **[1 month]** **[3 months]** → check-back date on the lead.
- Every step has **[Back]** and **[Talk to a person]**. Two unclear answers → a person. Stickers,
  reactions and pins are never "unclear". Silent for 3 hours → the lead is made + one "Shall we continue?".
- After the estimate: "ok / thanks / 👍" → a short word; a bill → filed, one thank-you.
- **Lead made by the team** says "hi" → "Hi Suresh 👋 Priya from OneOhm is helping you."
  **[Talk to Priya]** **[Quick estimate]**.
- **Onboarding switched off** → **[Call me back]** **[Talk to a person]**; a bill photo still makes or
  updates the lead.
- **Referral code** in the first message → lead linked to the friend, then language and name.

---

## 4. Papers (the customer sends a paper)

### 4.1 Staff ask for a paper

| | |
|---|---|
| **Starts when** | Staff: **Send to customer → Ask for a paper**, or Documents checklist **Ask** |
| **Customer sees** | In window: "Please send your *Electricity bill* for your Sangli home." **[Send it now]**. Outside: template `document_requested` with the same button. |
| **Customer taps** | **[Send it now]** → form "Electricity bill — Sangli", up to 4 photos or 2 PDFs **[Send]**. Fallback: "Or just send the photo here." |
| **Status** | paper action `Sent` → `Done by customer` when the file arrives |
| **Customer told** | "Saved ✅ *Electricity bill* · Sangli home. We'll check it." **[Change]** **[Menu]** |

### 4.2 A file arrives in the chat (asked or not)

We wait 15 seconds after the last file, then ask one question for the whole burst.

| Situation | Question |
|---|---|
| One paper asked | "Is this your *electricity bill* for Sangli?" **[Yes]** **[Something else]** |
| 2+ asked | List "What is this?" with the asked papers |
| Nothing asked | List: this customer's missing checklist items first, then Payment proof · Problem photo · Something else |
| Home paper, 2+ homes | "For which home?" (homes only) |
| Person paper (Aadhaar, PAN) | Never asks the home |
| Files differ | Row **"They're different"** → one question per file |

- A file with no kind is saved as "Saved ✅ Your file · Sangli. We'll check it."
- **Payment proof** → §8.3. **Problem photo** → starts §10 with the photo.

### 4.3 Staff check (closes the loop)

| | |
|---|---|
| **Staff see** | Documents and the "Asked from the customer" card: **Received – to check** with **[Looks good]** **[Ask again (reason)]** |
| **Looks good** | Checklist "Checked ✓", action `Closed`, a waiting step opens again (rule 5), customer: "Your *electricity bill* is checked ✅" |
| **Ask again** | Customer: "Please send your bill again: *the consumer number is not visible*." **[Send it now]**; action back to `Sent` |
| **If nobody acts** | Customer reminder at 2 days; asker at 4; manager at 7. Not checked: owner after 1 working day, manager after 2. |
| **Not on WhatsApp** | SMS "Send it from the OneOhm app, or give it to our team" (DLT text) |

Rules: duplicates are checked per checklist item; a lead's papers move to the project when it is made;
a stale bill (older than its validity, default 90 days, set per checklist item) turns "missing" again.

---

## 5. Location of a home

| | |
|---|---|
| **Starts when** | Staff: **Ask location**, or a pin sent by the customer |
| **Customer sees** | "Please share the location of your Sangli home so our team finds it easily." **[📍 Send location]** |
| **Status** | location action `Sent` → `Closed` when the pin arrives |
| **Behind** | No location yet → saved (`whatsapp_pin`). Already has one → saved as a suggestion; staff see "Check location". A customer pin never overwrites a surveyor's point. |
| **Customer told** | "Thank you ✅ Location saved for Sangli home." |
| **Not on WhatsApp** | In-person task for the owner |

---

## 6. Visits (survey, installation, AMC, service)

| Step | Customer sees | Status |
|---|---|---|
| 1. Staff **Ask to pick a day** | "When can our team visit Sangli for installation?" list of free working days + Talk to {name} | visit_pick `Sent` |
| 2. Day, then slot | **[Morning]** **[Afternoon]** → "Thanks — we'll confirm by {time}." | visit `proposed`, action `Done by customer` |
| 3. Staff **Confirm** | "Booked ✅ Thu 6 Nov, morning. Ravi will call before coming." + crew contact | visit `confirmed`, action `Closed` |
| 4. Day before | "Our team visits tomorrow morning." **[Confirm]** **[Change day]** | |
| 5. Change day | Back to step 1; staff alerted | |

- Staff cancel or move a visit → the customer is always told.
- Not confirmed by staff: owner after 1 working day, manager after 2.
- Morning check: a visit today with no answer → the crew is alerted ("No reminder reached them" when none went).
- **DISCOM inspection:** "Inspection on Thu 6 Nov, please be at home." **[I'll be there]** **[Change day]**
  (presence action). Change day → liaisoning owner alert.
- The day list shows days the crew is free. (Material readiness is not stored per project yet; see §21.)
- **Not on WhatsApp:** in-person task; the visit reminder goes as an SMS text when that is possible.

---

## 7. Quote

| | |
|---|---|
| **Starts when** | Staff send the quote (or a revision with "What changed") |
| **Customer sees** | PDF, then: "Your solar quotation is above. Full price ₹1,83,969, paid in 3 parts: ₹45,992 on acceptance, ₹1,19,579 before dispatch, ₹18,398 after installation. Subsidy ₹78,000 comes back to your bank after switch-on, so your cost is ₹1,05,969. Happy to go ahead?" **[Accept quote]** **[I have a question]**. A revision shows the change line first. |
| **Accept quote** | "Accept your solar quotation for ₹1,83,969? The 1st instalment, ₹45,992, is due on acceptance." **[Yes, accept]** **[Not yet]** |
| **Yes, accept** | Lead `won`, audit (by customer, WhatsApp). Customer: "Thank you ✅ Priya will start your project and send the advance payment link today (or the next working day)." Staff: "Start the project" alert. No project after 1 working day → escalation. |
| **Not yet** | "When should we check back?" **[1 week]** **[1 month]** **[Talk to {name}]** → lead next action |
| **I have a question** | List: Subsidy · Payment plan · Panels & brand · Warranty · Timeline · Call me · Something else. Answers are built from this quote. Call me → call task + alert. Something else → the person. |
| **Family number** | "Only Tejas's own number can accept this quote." → their person takes the chat |
| **Not on WhatsApp** | Staff mark it accepted with the customer in person |

---

## 8. Payments

### 8.1 Project started and instalments due

| | |
|---|---|
| **Project created** | In window: "Your solar project (*Sangli*) has started ✅ Priya is your project manager and will keep you posted here." Outside: template `project_started`. |
| **Instalment due** (advance, dispatch, switch-on) | In window: "*₹45,000* is due for your Sangli home." **[Pay ₹45,000]** **[I paid another way]**. Outside: template `payment_link` / `payment_due`. |
| **Pay ₹X** | Answers with the pay-link message → our pay page → Razorpay |
| **Paid online** | Receipt PDF + "₹45,000 received ✅ Next: dispatch." **[View receipt]** **[Project update]** **[Menu]** |
| **If nobody pays** | Payment reminders (worker) unless paused |

### 8.2 Payments from More

"Sangli solar — ₹1,20,000 total. ✅ ₹36,000 paid · 🔴 ₹45,000 due now · ⚪ ₹39,000 after switch-on"
**[Pay ₹45,000]** **[Receipts]** **[I paid another way]**. Two homes due → one message each (max 2).
Bank loan part: "₹60,000 by bank loan".

### 8.3 "I paid another way" (payment proof)

| | |
|---|---|
| **Customer taps** | **[I paid another way]** → form: amount (prefilled), date, proof photo. Fallback: send the photo in the chat. |
| **Status** | The pay ask for that instalment → `Done by customer` (to check). With no ask, a new pay item is made in that state, so it is tracked too. |
| **Behind** | Proof filed as "Payment proof" on the project; reminders for **that instalment** pause 2 days (all due ones when the customer named none). |
| **Customer told** | "Thanks — we'll confirm your payment within 1 working day." |
| **Staff see** | Finance (record-payments right): "Record payment: Tejas sent payment proof (₹12,000 on 3 Nov)". |
| **Finance records it** | Pay item `Closed`, receipt sent automatically. |
| **If nobody acts** | Owner alert after 1 working day, manager after 2. |
| **Not on WhatsApp** | SMS pay link; proof in person |

---

## 9. Journey steps (after the project starts)

| Step | Customer sees | Taps → result |
|---|---|---|
| Layout (optional) | "Your layout" PDF | **[Looks good]** **[I have a question]** → recorded on the design task |
| Agreement signature | Agreement PDF | **[I agree]** **[I have a question]** → then the signed copy (paper check) → evidence complete |
| Site ready (before dispatch) | "Is the roof ready?" | **[Yes, ready]** → the step goes on · **[Not yet]** → the step waits on the customer, owner alerted |
| Crew contact | "Ravi from OneOhm will come for your Sangli installation. You can call them on +91…" | — |
| Installation started | "Our team started installing at Sangli today." **[Project update]** | — |
| Installation finished | "Is the installation finished?" | **[Yes]** → completion confirmed · **[Something's wrong]** → alert |
| Switch-on | "Your solar is ON ☀️" | **[Pay ₹X]** (final due) or **[Warranty & AMC]** |
| Subsidy | PM Surya Ghar registration guide; bank passbook; "Did ₹78,000 reach your bank?" | **[Done]** **[Need help]** · **[Yes, received]** **[Not yet]** → owner alert after N days |
| Bank loan | Loan papers (one ask each); "Sign at the bank on …" | **[I'll be there]**; loan status updates (sanctioned / disbursing / rejected) |
| Handover pack | "Your 4 handover papers" | **[Documents]** |
| Waiting on DISCOM / bank | "Waiting for the electricity board since 2 Nov. We'll update you." | Only for steps allowed to message the customer (Settings → Task templates) |
| Waiting on the customer | "We need *{item}* to continue." **[Send it now]** | The wait ends by itself when the asks are done (rule 5) |
| In person (staff) | The ask card shows **Done in person**: Yes, or Not yet (roof question only) | Logged and audited "(in person)" with the staff name |

---

## 10. Problems (service)

| | |
|---|---|
| **Starts when** | More → Report a problem, a "Problem photo" answer, or words like "problem" |
| **Form** | Which home (2+ homes) · What is wrong (Inverter error · No power · Low power · Damage · Cleaning · Bill or meter · Something else) · Since when (Today · This week · Longer) · up to 3 photos · anything to add. Videos go in the chat. |
| **Chat fallback** | One tap question at a time, then "Send up to 3 photos or a few words if you like, then tap Done." **[Done]** |
| **Customer told** | "Thank you ✅ Noted: *Cleaning · Home*. *Sunil* will call you by 5:23 pm today." **[My problems]** **[Menu]** |
| **Files after Done** | Photos, videos and voice notes that arrive during the report, or up to **2 minutes** after it, join the problem with one reply: "Added 2 photos and 1 video to your problem ✅". Later ones get "Are these for the problem you told us about?" |
| **Status** | Service request `open`; a **call task** with the promised time |
| **Staff see** | Service desk + assignee alert. The named caller (when not the assignee) gets a "Call about a problem" alert. Ticket screen: **Send to customer** (visit day, technician's number, call-back). |
| **If nobody acts** | Late call → the person, then the service desk |
| **Visit day** | **[Confirm]** **[Change day]** (§6) |
| **Fixed** | "Fixed ✅ Is it working now?" **[Yes, working]** **[Still a problem]** |
| **Still a problem** | Reopened: status open, the response clock restarts, assignee alerted, call promised |
| **Yes, working** | Problem rating (§11) |
| **Not on WhatsApp** | OneOhm app, or SMS pointing to the app |

---

## 11. Ratings (one system)

| | |
|---|---|
| **Starts when** | A finished stage, a fixed problem, or staff **Ask for a rating** (re-sends only the pending one) |
| **Customer sees** | "How was our help with …?" list of 5 → 1 stars |
| **4–5 stars** | "Thank you for rating us" |
| **1–2 stars** | "Sorry to hear that. Priya will call you by {time}." + alert + call task. For a problem the service desk is told too. |
| **Twice / old list** | "You rated this already" — nothing changes |
| **Outside window** | Template with **[Rate now]**, which opens the 5 taps |
| **Unanswered** | Expires after 30 days, quietly |

---

## 12. Self site survey with a discount

| | |
|---|---|
| **Starts when** | Staff offer it on a project at the survey stage (Settings: switch and amount, default ₹1,000) |
| **Customer sees** | Offer (marketing template outside the window) → form: roof type, floors, 4 photos (roof corners, meter, switch board), shade, roof size, consumer number (only if missing) |
| **Status** | self_survey `Done by customer` → engineer **[Approve]** / **[Ask again: item]** |
| **Approve** | Survey report saved like a field survey; "Survey approved ✅ ₹1,000 off your next payment." A credit goes on the next instalment (GST-inclusive; the last instalment takes the remainder). |
| **If nobody acts** | Engineer: 1 working day → alert, 2 → manager. Unfinished form → Home "Finish your survey" for 7 days. |
| **Not on WhatsApp** | In person |

---

## 13. Documents (ours to the customer)

One paper → the file with a one-line caption. Two or more → a list, newest first. A paper that is gone →
"That paper is not available any more — here is the latest list." Staff send any document from the
Documents row. Outside the window → template `document_share` with the link.

---

## 14. Talk to a person, hand-back, call-back

- **Talk to {name}:** "{Name} will reply here (Mon–Sat, 9:30–6:30)" or "…tomorrow from 9:30". The bot stays usable.
- **While held:** the bot answers only its own taps, forms, files during a problem report, and messages
  WhatsApp could not pass on. Everything else alerts the person.
- **Hand-back:** Menu, staff **Release**, or 4 working hours of silence. Told only if they wrote meanwhile:
  "{Name} is away now — we're here to help." **[Menu]**
- **Call-back:** "When should {name} call?" **[Morning]** **[Afternoon]** **[Evening]** → callback action +
  lead next action + alert.

---

## 15. Referral and reward payout (UPI only)

| Step | What happens |
|---|---|
| Refer | Form (friend's name, mobile, city) → lead → "Thank you! We'll call Suresh. You get ₹2,000 when their solar is installed." **[My rewards]** **[Share my link]** (amount from Settings → Referral programme) |
| Reward approved | "Share your UPI ID to receive ₹2,000." (form or chat; format checked) → payout action `Done by customer` |
| Staff check | **[Looks good]** / **[Ask again]** on the reward. Paying by UPI needs a checked ID. |
| Paid | "₹2,000 sent to your UPI ✅"; payout action `Closed`. Paid another way, rejected or cancelled → the ask closes too. |
| If nobody acts | Customer reminder; finance (record-payments right) alerted after 1 working day |

---

## 16. Warranty and AMC

- AMC visit due → visit pick (§6) **[Confirm]** **[Change day]**.
- Renewal offer 30 days before the AMC ends (marketing) **[Renew AMC]** **[Talk to {name}]** → staff follow-up.

---

## 17. Staff side — "Send to customer"

One button on the **customer, project, lead, chat, task and ticket** screens. It opens a sheet with a
preview of exactly what the customer gets and which path will be used (WhatsApp, SMS or in person).

| Action | Places |
|---|---|
| Ask for a paper | Customer, project, task, lead; Documents checklist |
| Ask location | Customer, project, task, lead, chat |
| Self survey | Survey task / project |
| Ask to pick a visit day | Project, task, lead (with a customer), ticket |
| Share crew / technician contact | Project, task, ticket |
| Payment reminder / ask proof / send receipt | Customer, project, task |
| Send a document | Everywhere; Documents row |
| Signature, site ready, installation check, handover pack, subsidy, bank sign, layout | Project and their task |
| Delay notice | A waiting task |
| Call-back time | Everywhere |
| Rating (the pending one) | Everywhere |
| AMC renewal | Project, task |
| UPI for a reward | Everywhere; Finance → Payouts |

Every action shows in the **"Asked from the customer"** card (customer and project pages) with status,
reminders, **Cancel** (tells the customer) and audit.

---

## 18. Automatic messages (by the system)

| Event | Message |
|---|---|
| Project created | Started + the project manager's name (window) / `project_started` |
| Instalment due | **[Pay ₹X]** **[I paid another way]** (window) / pay template |
| Payment received | Receipt PDF + next step |
| Step waiting on the customer | "We need {item} to continue." **[Send it now]** |
| Step waiting on DISCOM / bank | "Waiting for … since …" (steps allowed to message only) |
| Installation started | + **[Project update]** |
| Switch-on | + **[Pay ₹X]** or **[Warranty & AMC]** |
| Handover | Pack + **[Documents]** |
| Problem status / visit | Status line + **[Confirm]** **[Change day]** / "Is it working now?" |
| Stage finished | Rating, 5 taps |
| AMC due | **[Confirm]** **[Change day]** |

---

## 19. Fixes from the live phone test (2026-11-05)

- "Home home" wording → the home's name is printed once.
- A paper ask inside the window is a chat message with **[Send it now]** (not the template).
- Photos, videos and voice notes up to 2 minutes after **Done** join the problem with one reply.
- "Unsupported message" gets a reply, also in a held chat.
- "Saved ✅ *Other file*" → "Saved ✅ Your file".
- The form reader accepts media ids sent as numbers, plain text or JSON strings.

---

## 20. Customers not on WhatsApp

| Action | SMS customer | On neither |
|---|---|---|
| Paper, rating, problem | SMS: "send it from the OneOhm app, or give it to our team" | In person |
| Payment | SMS with the pay link | In person |
| Location, self survey, visit pick, signature, site ready, installation check, subsidy, bank sign, call-back, UPI, payment proof, AMC renewal | In person | In person |
| Quote accept | In person (staff mark it accepted) | In person |
| News (document, receipt, crew, delay, pack, layout, visit reminder) | The approved message's SMS | Customer handovers list |

"In person" is a task under **Customers → to share in person** for the owner. Ticking it closes the ask
(with the rights for that ask). The ask keeps its path in `payload.channel`. The delivery note says what
happened: sent by SMS, task made, or not sent. SMS texts need DLT registration (owner).

---

## 21. Not built yet (needs an owner decision)

| Gap | Why it is open | Suggested choice |
|---|---|---|
| "Who is this about?" when one phone has two customer records | Rare; today the phone's own customer wins | Build when the first real case appears |
| Asks cancel when a **project** is cancelled | There is no project-cancel action in the app yet | Add with the cancel feature |
| Visit day list checks **material ready** | Material stock per project is not stored | Keep crew-free only |
| Lead screen: staff **send estimate** | The estimate goes at the end of onboarding; a lead without a customer record can't use Send to customer | Add a "Send estimate again" button on the lead estimate card |
| Lead with no customer record: staff **book survey** | Needs the site first ("Add the site to this lead") | Keep: add the site, then ask |
| "Send to customer" also on Property card, Receivables, DISCOM desk, Aftercare, Feedback | The same actions are one tap away on the customer / project sheet | Optional shortcuts |
| Onboarding **[Send bill]** button | The customer just sends the photo; **[Send later]** skips | Keep as is |
| Problem rating outside 24 h uses the stage rating template | Works; the wording names the topic | Add a problem template when submitting to Meta |
| "Opened" (read) state | Read receipts are optional in WhatsApp | Info only, not built |
