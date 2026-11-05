# WhatsApp flow map (as built after the redesign)

Date: 2026-11-05 · Branch: `feat/whatsapp-redesign` · Replaces the old three-part map of the ten-row menu.
The design and its reasons are in [redesign.md](redesign.md) (sections 1 to 22j); the rules every message follows
are in [conversation-principles.md](conversation-principles.md). Entry, strangers and onboarding are described step by step
in [part-1-entry-and-onboarding.md](part-1-entry-and-onboarding.md). Templates and their Meta status are in
[../whatsapp-templates.md](../whatsapp-templates.md). Parts 2 and 3 (the old customer menu, files and complaint maps) are gone:
every flow they described has been replaced by the flows below.

---

## 1. Who is talking (decided on every message)

```
Message comes in
├─ STOP / START typed ............ opt out / back in (always first; a stranger who stopped and writes again is told once)
├─ "hi", "hello", "menu" ......... Home for a customer · the onboarding question for a new contact · the hello for a team-made lead
├─ Chat held by a person ......... bot stays quiet and the person is alerted — except the bot's own taps (Menu, Talk to a person,
│                                  forms, the buttons of its messages); STOP gets no night reply first
├─ Late tap (older than the chat's newest message) ... "That was an earlier message — here is the latest." + the current step
├─ Unknown number (stranger)
│   ├─ Onboarding ON (default) ... onboarding by taps (section 3)
│   ├─ Onboarding OFF ............ buttons [Call me back] [Talk to a person]; a bill or voice note still makes/updates a lead
│   └─ Lead made by the team ..... "Hi {name} 👋 {owner} from OneOhm is helping you." [Talk to {owner}] [Quick estimate]
└─ Known customer ................ Home, asks, papers, problems (sections 2 and 4 to 9)
```

Languages: English, Marathi, Hindi everywhere. A new contact chooses with 3 buttons; a customer changes it under More → Language;
typing in Devanagari switches automatically (asked once when Marathi and Hindi cannot be told apart).
Hours text is always "Mon–Sat, 9:30 am–6:30 pm"; on Sunday a person "replies on Monday from 9:30".

## 2. Home and More (customers)

"Hi {name} 👋" + the one thing that matters now (first that applies): open ask → money due → visit in 3 days → open problem → quote
waiting → "How can we help today?". Buttons: [the action] [Project update] [More]. Two or more things → "2 things need you" [See them].
[More]: Project update · Payments · Documents · Send a paper · Report a problem · My problems · Warranty & AMC · Refer a friend ·
Talk to {name} · Language. Small talk ("ok", "thanks", 👍) gets a short word back; unknown text gets "Sorry, we didn't get that."
[Talk to {name}] [Project update] [More]; a second unknown message in a row goes to the person, said clearly.

## 3. New contacts (redesign §16)

```
Language [English] [मराठी] [हिंदी] → "Shall we call you Suresh?" [Yes] [Change]   (emoji, initials, shop names: asked to type)
→ City: list + [📍 Send location]     (a pin that names a served city fills it; else the city is asked and the pin kept on the lead)
→ Site: Home / Society / Shop / Farm → Monthly bill bands → Roof → Floors → Bill photo [Send later]
→ Estimate PDF → [Book a visit] [Call me] [Not now]
     Book a visit → free days list → Morning/Afternoon → lead next action + owner alert (no customer record yet, so no reservation)
     Call me      → "{owner} will call you today / tomorrow morning / on Monday morning" (lead next action + alert)
     Not now      → [1 week] [1 month] [3 months] → check-back date on the lead
After the estimate: "ok / thanks / 👍 / sticker / reaction" → one short word; "hi" or Menu → the three options again;
a bill → filed, one thank-you, no buttons again; real words → the lead's owner.
```

Every question has [Back] and [Talk to a person]; two unclear answers hand over. A reaction, sticker or pin is never an unclear
answer. An old tap gets the "earlier message" line. Silent for 3 hours → lead made + one "Shall we continue?" nudge.
A referral code message makes the lead, welcomes in English, then asks language and (if unknown) name.

## 4. Customer actions — one status system (redesign §2)

Every ask of a customer is one record: `paper · location · self_survey · visit_pick · presence · signature · pay · confirm · rating ·
payout · callback`, with the status line *Sent → Done by customer → Checked / Ask again → Closed* (or Cancelled), reminders at 2 days,
staff checks at 1 and 2 working days, and its channel (`whatsapp`, `sms` or `in_person`). Home, "Asked from the customer" and the
reminders read the same rows. Staff send and cancel everything from **Send to customer** (redesign §18).

## 5. Papers, location, payments, documents

- **Papers:** a file is first "What is this?" (the paper) then "Which home?" only when it matters; staff Looks good / Ask again.
- **Location:** [📍 Send location] (a single-button message); a pin is a suggestion staff check when it conflicts.
- **Payments:** [Pay ₹X] opens our pay page; "I paid another way" is a form (amount, day, photo) → finance records.
- **Documents:** ours to the customer (quote, invoice, receipts, handover pack) from Documents.

## 6. Visits and the journey (redesign §4, §8)

Visit pick (free days → slot → proposed → staff confirm → Booked), day-before [Confirm] [Change day], DISCOM presence
[I'll be there] [Change day]; journey steps with buttons (agreement signature, roof ready, installation finished, handover pack,
subsidy, loan, layout); self site survey with a discount (form, approve, credit on the next instalment).

## 7. Quote, problems, rating, referral, AMC (phase 6)

Quote: [Accept quote] [I have a question] (a list of fixed answers + Call me) · Not yet → check-back. Problem: form or taps
(home · what · since · photos), a named person and a time, a call task; "Fixed ✅ Is it working now?" → Still a problem reopens.
Rating: 5 taps, one system. Referral: friend form; reward approved → "Share your UPI ID" → staff check → paid (a payout ask closes
when its reward is paid another way, rejected or cancelled). AMC: renewal offer 30 days before the end.

## 8. Customers not on WhatsApp (redesign §17)

| Action | Path (SMS customer) | Path (customer on neither) |
|---|---|---|
| Paper, rating | SMS text: "send it from the OneOhm app, or give it to our team" | In person |
| Payment | SMS with the pay link | In person |
| Location, self survey, visit pick, signature, site ready, installation check, subsidy, bank sign, call-back, UPI, payment proof, AMC renewal | In person | In person |
| Quote accept | In person (staff mark it accepted with the customer) | In person |
| News (document, receipt, crew, delay, pack, layout) | The approved message's SMS | Customer handovers list |

"In person" is a task on **Customers → to share in person** for the owner. The Send-to-customer sheet shows which path will be used
and the action keeps it in `payload.channel`.

## 9. Held chats, hand-back, hours

Talk to a person: "{name} will reply here (Mon–Sat, 9:30–6:30)" or "…tomorrow from 9:30". The person's hold ends with Menu, Release
or 4 working hours of silence; the customer is told only if they wrote meanwhile ("{name} is away now — we're here to help.").
A held chat still answers the bot's own taps (including an onboarding "Talk to a person").
