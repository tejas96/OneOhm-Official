# WhatsApp flow map (as built today)

Date: 2026-11-04 · Branch: `feat/papers-per-home` · Read from code, not run.

This page is the short overview. The full step-by-step maps, with every message word for word,
every button and list row, and every staff alert, are in:

- [Part 1 — Entry, strangers, leads, onboarding, hand-over](part-1-entry-and-onboarding.md)
- [Part 2 — Customer menu and every option](part-2-customer-menu.md)
- [Part 3 — Files, papers, requests, problems](part-3-files-papers-problems.md)

---

## 1. Who is talking (decided on every message)

```
Message comes in
├─ STOP / START typed ............ opt out / back in (always first)
├─ "hi", "hello", "menu" ......... start over (menu for customers, onboarding/buttons for others)
├─ Chat held by a person ......... bot stays quiet, person is alerted (except bot's own taps)
├─ Unknown number (stranger)
│   ├─ Onboarding ON (default) ... onboarding questions → estimate
│   ├─ Onboarding OFF ............ "This number is not linked…" [Call me back] [Talk to a person]
│   └─ Lead made by the team ..... typed words → passed to their salesperson
└─ Known customer ................ customer menu, files, papers, problems
```

## 2. Stranger → lead: onboarding (Part 1, §3)

```
1. Language   [English] [मराठी] [हिंदी]
2. Name       "Shall we call you Tejas?" [Yes] [Change] [Talk to a person]
3. City       list or typed city            → lead is created here, salesperson alerted
4. Site       Home / Society / Shop or business / Farm
5. Bill       ₹ bands (Up to ₹1,000 … Over ₹5,000)
6. Roof       RCC slab / Tin sheet / Other
7. Floors     Ground only / 2 floors / 3 or more
8. Bill photo send it, or [Send later]
9. Estimate   PDF + "What would you like to do next?" [Call me back] [Talk to a person] [Not now]
              (farm, society, big bill, other roof → "Our expert will prepare your price and call you.")
Every step: [Back] [Talk to a person]; 2 unclear answers → handed to a person.
Silent for 3 h → lead made + one "Shall we continue?" nudge.
Referral code message → lead + "X referred you" → skips language and name.
```

## 3. Customer menu (Part 2, §1–2)

"Hello {name}! I am the OneOhm assistant. What would you like to see?" [Choose]

| # | Row | What happens |
|---|---|---|
| 1 | Project progress | All projects in one text: stage, next step, waiting on, subsidy. [Menu] [Pay now] [Talk to us] |
| 2 | Payments | Instalment list, then one "Pay now" card per due amount, then "What next?" |
| 3 | Documents | 0 → "No documents yet"; 1 → sent straight away; 2+ → "Which paper would you like?" list |
| 4 | Report a problem | 2+ homes → "Which home is the problem at?" → "Please tell us the problem…" → request raised |
| 5 | My requests | Up to 5 requests with status |
| 6 | Warranty and AMC | Cover per project |
| 7 | Refer a friend | "Send your friend's name and number…" → lead made |
| 8 | My rewards | Referrals and rewards |
| 9 | Rate us | 5-step list → "Anything to add?" |
| 10 | Talk to a person | Handed to a person: "A team member will reply here soon (Mon–Sat, 9:30–6:30)…" |

Quote buttons (sent by the team): [Accept quote] → "Accept … for ₹T?" [Yes, accept] [Not yet]; [I have a question] → person.
Any other typed text → handed to a person: "Thank you. {Name} will reply to you here."

## 4. Files, papers, problems (Part 3)

```
Customer sends a file
├─ Voice note / video ............. handed to a person ("will listen/watch")
├─ During "describe the problem" .. added to the new problem
├─ Within 30 min of a problem ..... added to that problem (photos only)
├─ 0 homes ........................ "Thank you! We got your photo…"
├─ 1 home / home picked <30 min / only one home has open requests → that home
└─ otherwise ...................... "Which home is this for?" [homes…] [Aadhaar/PAN (all homes)]
       then on that home:
       ├─ 0 open requests ......... "Saved: photo for your home at X."
       ├─ 1 open request .......... answers it (no check what the photo is)
       └─ 2+ open requests ........ "Which paper is this?" [requests…] [Something else]
Location / contact / sticker → person alerted, no reply. Reaction → nothing.
```

Team asks for a paper (web) → WhatsApp template (or SMS / app) → reminder at 2 days → staff alert at 4 days.
Ask again, cancel, staff upload and Move all tell the right side (Part 3 §2.8).

---

## 5. Biggest problems found (for the redesign)

Grouped by what you asked for. Numbers point to the "Issues seen" list in each part (P1, P2, P3).

### A. It feels like a robot, not a person
- Same greeting every time ("I am the OneOhm assistant. What would you like to see?"); never says what is new (payment due, step done, paper needed). P2-15
- Menu needs 2 taps (open list, pick row) for everything; answers end with only [Menu] [Talk to us], so the next natural step costs 3 more taps. P2-6, P2-14, P2-22
- Answers tell the customer to tap buttons that are not there ("tap Report a problem in the menu"). P2-6
- Odd sentences: "Your no generation request is raised", "Bank loan: ₹X (bank loan)", "(via WhatsApp)" shown to the customer. P2-16, P2-18, P3-15
- Two names for the same thing: "Talk to a person" vs "Talk to us"; "Back to menu" vs "Menu". P2-13, P2-14

### B. Replies are "dumb" (not reading what the customer means)
- Any typed text that is not a menu word ("Good morning", "yes", "when will you come?", "Hello!") silently hands the chat to a person; the bot then goes quiet. P2-1, P2-2
- "ok" after a quote gets "You're welcome 🙏"; "yes" goes to a person — neither accepts. P2-3
- Typed menu words during "describe the problem" become the complaint ("documents (via WhatsApp)"). P2-4, P3-34
- After the estimate, "ok", "thanks", 👍 or Menu all hand over again — a loop. P1-1, P1-2
- One open request + any photo = answered, even a roof photo for "electricity bill". P3-2
- 30-minute "glue": a second paper within 30 min is silently filed as the same paper. P3-3

### C. Aadhaar/PAN mixed with property choices
- "Aadhaar/PAN (all homes)" is a row inside "Which home is this for?" — two different questions in one list. P3-12, P3-27
- Reply after that row: "files you send now are for *Aadhaar/PAN (all homes)*". P3-12
- One-home customers get "Saved: Aadhaar card for your home at Pune". P3-13
- Request template says "your Aadhaar card for your solar at Pune". P3-30
- An Aadhaar photo can answer a bill request on the "only home with open requests". P3-28

### D. Not predictable
- Remembered home for 30 min: a photo for the other home goes to the wrong one with no question and no way to change. P3-32
- Menu / hello / another step quietly drops waiting files; a late tap then says "Noted…" and files nothing. P3-4
- Late taps are dropped with no reply. P2-0.1, P3-45
- Bot hands the chat back after 4 hours, or on Menu, without telling the customer. P2-12
- Hours text says Mon–Sat, but Sunday counts as working time. P1-11

### E. Dead ends and gaps
- Onboarding off: every message gets the same two buttons; bill photos are not stored. P1-6
- Team-made lead says "hi" → "This number is not linked to any of our customers". P1-5
- No way to change language in chat. P1-9, P2-21
- Voice note during a complaint wipes the complaint. P3-8
- Unsupported file: "send it again in a little while" (it will never work). P3-9
- Staff note on a paper request never reaches WhatsApp. P3-19

---

## 6. What is next

Agree the target conversation first (how it should sound and behave), then change the code to match.
Suggested order of the conversation design:
1. Principles (tone, names, buttons rule, what the bot does with text it does not understand).
2. Customer menu and answers.
3. Files and papers (separate "whose paper" from "which home").
4. Problems.
5. Strangers and onboarding.
