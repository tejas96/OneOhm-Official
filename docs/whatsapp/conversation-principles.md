# WhatsApp conversation principles (draft for owner approval)

Date: 2026-11-04 · Based on [flow-map.md](flow-map.md). These rules apply to every WhatsApp message
OneOhm sends, in English, Marathi and Hindi. The redesign of each area (menu, files, problems,
onboarding) must follow them.

## 1. Who is speaking

- The bot speaks as **OneOhm**, the company, in the first person plural ("we", "our team").
  It never pretends to be a human and never says "I am the assistant".
- People are always named: "Priya (your project manager)", never "a team member" or "our team"
  when we know who it is.
- The customer is called by first name, once per message at most.

## 2. How it sounds

- Short. At most 3 short lines per message. One idea per message.
- Warm and plain, like a good project manager on WhatsApp. One emoji at most, only where natural
  (🙏 ✅ 👋 ☀️).
- Never internal words: no "request raised", "category", "(via WhatsApp)", "status: open",
  project codes, "Wp", "instalment 2 of 4" style jargon.
  - Homes are named the way the customer knows them: site name, else town ("your Sangli home").
  - Money as the customer says it: "₹45,000 is due for your Sangli home".
- Same message, same words everywhere: one dictionary of names (section 6).
- Reply in the customer's language. If they type in Marathi or Hindi script, answer in that
  language even if the setting is English, and remember it.

## 3. Every reply does two things

1. **Answers** what they asked, or says what just happened ("Got it — your electricity bill is
   saved for your Sangli home ✅").
2. **Offers the next most likely step** as buttons — not just "Menu".
   - At most 3 buttons. Verbs, not nouns: "Pay ₹45,000", "Send a photo", "Talk to Priya".
   - The last button is the way out: "Menu" (or "Talk to Priya" when a person is the next step).

## 4. Greeting = what is new + top actions

"Hi" or "Menu" does not show a 10-row list first. It shows:

> Hi Tejas 👋 Your Sangli solar is at **Installation** (4 of 7 steps). ₹45,000 is due.
> [Pay ₹45,000] [Project update] [More]

- One line of what matters now (payment due, paper needed, visit booked, step done).
- The 2 most useful actions for this customer right now, then "More" → the full list.
- Nothing new: "Hi Tejas 👋 How can we help today?" [Project update] [Report a problem] [More].

## 5. The bot always answers — and never silently hands over

| Customer writes | Today | New rule |
|---|---|---|
| "ok", "thanks", 👍, "done" | "You're welcome 🙏" or hand-over | Short warm ack, no buttons, no hand-over, no alert |
| A reaction | Nothing | Nothing (correct) |
| A question we can answer ("when will you come?", "how much is left?") | Silent hand-over | Answer it (see section 7) |
| Something we cannot answer | Silent hand-over, bot goes quiet | Say so and name the person: "We'll pass this to Priya. She replies 9:30–6:30, Mon–Sat." [Menu] — bot stays usable |
| "hi" while a person is chatting | Goes to the person | Same, but the person's chat is never left without a way back: every hand-over reply has [Menu] |

- A hand-over is always **said**, with a name and a time. Handing back is also said:
  "Priya is away now — we're here to help." (only if the customer wrote since).
- Hours are real: Monday–Saturday 9:30–6:30; Sunday and holidays are closed.
- No message is ever dropped silently (late taps, stale lists): the customer gets a short
  honest reply ("That list is old — here is the latest:").

## 6. One name for each thing (dictionary)

| Thing | Name used everywhere |
|---|---|
| Back to the start | **Menu** |
| Human help | **Talk to {first name}** (fallback: **Talk to our team**) |
| Project status | **Project update** |
| Money | **Payments**, pay button **Pay ₹X** |
| Problem | **Report a problem**, then **your problem** (not "request") |
| Papers | **Documents** (ours to them), **papers** (theirs to us) |
| Aadhaar / PAN / income proof | **your ID papers** — never inside a "which home" list |
| Home | site name, else "{town} home" |

## 7. Understanding free text

**Owner decision (2026-11-04): rules only (A) for now, no AI.** Word lists are grown and kept in one
place, so an AI step can be added later in front of the same fixed actions without changing replies.
Meta's own options were checked: Meta Business Agent (a separate no-build bot, cannot use our project
and payment data) and Wit.ai (Hindi/Marathi support not confirmed) do not fit today.

Options as considered:

Today the bot only knows exact words; everything else goes to a person silently. Two ways:

- **A. Rules only.** Grow the word lists (greetings, "yes/no", "when", "how much", Marathi/Hindi
  variants). Cheap and fully predictable, but it will still miss most real sentences.
- **B. Rules first, AI for the rest (recommended).** Exact words and taps work as now. Only text the
  rules do not know is sent to an AI model (Claude Haiku), which picks **one of our fixed
  actions** (project update, payments, problem, paper, ID paper, small talk, person). The reply
  words always come from our approved wording — the AI never writes to the customer.
  - If the AI is unsure → the honest hand-over in section 5.
  - Cost: a fraction of a rupee per unknown message; a few seconds' delay at most.
  - Needs an `ANTHROPIC_API_KEY` in `.env`; with no key, it behaves like A.

## 8. Files and papers (rules, detail later)

- First decide **what** it is, then **where** it goes:
  - Open request(s) → "Is this your **electricity bill**?" [Yes] [No, something else] — never
    match silently.
  - ID papers (Aadhaar, PAN, income proof) belong to the person — never ask "which home".
  - Only home papers ask "Which home?", and only for customers with 2+ homes.
- Every "Saved" reply has a **[Change]** button (wrong paper or wrong home → fixed in one tap).
- A burst of files gets **one** reply that counts them ("Got your 4 photos ✅").
- Nothing is filed "the same as the last one" without saying so.

## 9. Predictable

- The same input in the same situation always gives the same reply.
- Steps never expire silently; if a question is old, we say so and ask again.
- Menu never throws away work in progress (files waiting, half-told problem): it asks first —
  "You have 2 photos not saved to a home yet. Save them to Sangli?" [Yes] [Choose home].

## 10. Not in scope

- The AI never writes replies, quotes prices, or promises dates.
- Staff screens: only the "Send to customer" menu, the "Asked from the customer" card and the check buttons (see redesign.md §18). No other new screens.
