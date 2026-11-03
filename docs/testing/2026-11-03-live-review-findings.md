# Live QA review: pain points and hidden issues (2026-11-03)

These findings come from the live run on +91 8087823247 and three independent reviews: customer experience, business and staff, and reliability and WhatsApp rules. Duplicates are merged.

**Severity:**
- **Critical** — unsafe to go live.
- **High** — customers or money are lost, or something important is missed.
- **Medium** — real friction or noise.
- **Low** — polish.

**Effort:** S is a few hours, M is a day or two, L is several days.

---

## A. Go-live blockers: security and reliability

| ID | Issue | What goes wrong | Sev | Fix | Effort |
|---|---|---|---|---|---|
| A1 | The WhatsApp webhook has no app secret, only a secret path key | Anyone with the key can fake customer messages, including "Yes, accept" on a quote, which is audited as the customer's own act | Critical | Make `WHATSAPP_APP_SECRET` required in production and reject unsigned posts | S |
| A2 | The default file-link secret was used live behind a public tunnel | Anyone can forge links to any customer's quote, receipt or invoice, and to pay links | High | Set real, separate secrets for files and pay links in the API and the worker, with a production check | S |
| A3 | Inbound messages are saved before they are handled; a failure is only logged | The customer gets no reply, nobody is told, and Meta's retry is dropped as a duplicate | High | Mark a message as handled only after it succeeds, or use a retryable inbox | M |
| A4 | Slow webhook replies (PDF and media work happen before the 200) and no stale check | Meta retries for days, so old taps can drive the flow later. This is the likely cause of the lost "back" | High | Reply 200 at once and process in the background; ignore input older than the newest message | M |
| A5 | Retries are decided by HTTP status only | Meta's rate-limit and spam codes come back as 400, so those messages are dropped. An expired token fails everything silently | High | Retry by Meta error code; alert on token and rate-limit errors; use a permanent System User token | S |
| A6 | A timeout after Meta accepted a message, then a retry | The customer gets the same template twice (charged), maybe two pay links | High | Mark the row "sending" before the call; send unclear results to manual review | M |
| A7 | No STOP / opt-out for WhatsApp | Meta policy and quality-rating risk; leads cannot opt out at all | High | Handle STOP / बंद / रद्द, store the opt-out per phone, and check it on every send | M |
| A8 | Messages to one person can arrive out of order | "Please pay" arrived before "project started", and the buttons can arrive before their PDF | High | Send one message at a time per chat | M |
| A9 | The 24-hour window is checked only when a message is queued | Retries can send a chat message after the window has closed, and Meta refuses it | Medium | Check the window again at send time (about 23 h) | S |
| A10 | Links carry the tunnel host forever, and the pay link is a ~250-character raw URL | All QA links are dead now, and long raw links look like spam or phishing | Medium | Use a stable domain, a short branded pay link and a URL button; check `API_PUBLIC_URL` at start-up | S |
| A11 | Opening the pay link (GET) creates a Razorpay link | Link previews and scanners create links, and leftover test links break link-sync after the switch to live keys | Medium | Show a landing page and create the link on tap | S |
| A12 | A payment can be recorded twice at the same moment (webhook + sync race); no lock on link-sync across API copies | Webhook 500s, a link stuck "created" and polled forever, possible errors | Medium | Use one locked transaction and an advisory lock; catch errors per link | S |
| A13 | Refunds and chargebacks are ignored | A refunded payment stays "paid" with its receipt | Medium | Handle the refund and dispute events and flag them to finance | M |
| A14 | Nothing alerts when webhooks stop | A URL change silently stops all inbound WhatsApp | Medium | Alert after N hours with no webhook; set the app-level callback to the production domain | S |
| A15 | Receipt numbers are sorted as text | After 9999 in a year, numbers repeat and every payment fails | Low | Sort by the number part, or use a counter | S |
| A16 | Phone numbers and signed file links are written to logs | Personal data leaks into logs | Low | Mask phones; never log tokens | S |

## B. Nobody's move: business-side gaps where work gets missed

| ID | Issue | What goes wrong | Sev | Fix | Effort |
|---|---|---|---|---|---|
| B1 | After the customer accepts, nobody gets a "Start project" next action | The project start depends on one alert among 74 unread. A keen customer waits | High | On accept, set the owner's next action "Start project · today", add a command-centre count, and escalate after 1 working day | S |
| B2 | The advance link waits for staff to create the project | The bot promised the link; the customer is ready to pay, and money is delayed | High | Send the advance Pay now right at acceptance, and attach it when the project starts | M |
| B3 | Sending a quote sets no follow-up, and the old next action stays | Quotes go cold with no chase, and the lead shows the wrong reason | High | When the quote is sent, set "Follow up quote" in N days and remind 3 days before validity ends | S |
| B4 | After staff reply once, the bot stays silent until someone presses "Hand back" | The customer's taps and words get no reply if staff forget | High | Hand back automatically after N working hours, and always answer menu taps | S |
| B5 | Taps the bot already handled still alert staff and count as "waiting" | 2 alerts per tap and false "late chat" counts. Real messages get buried (74 unread) | High | Alert only on free text and files, not on handled taps | S |
| B6 | Admin receives every broadcast and becomes the project manager by default | Alert overload; the real owner of each duty isn't told | Medium | Send alerts by role, with a daily digest for admin; make the PM a required pick | M |
| B7 | "Payment received" is not told to the project manager or the sales owner | The execution team doesn't know the job is real now | Medium | Tell the PM and owner, and use it to trigger the survey task | S |
| B8 | Leave cover is partial | Broadcasts ignore leave and backups, and an owner on leave isn't flagged | Medium | Use the backup logic for alerts; flag leads whose owner is on leave | S |
| B9 | "Contacted" now means "the bot sent an estimate", and "Won" counts a verbal yes | The funnel overstates progress, and there is no "first human contact" or "advance paid" step | Medium | Add the Estimate sent, First human contact and Advance paid steps to the funnel and By campaign | M |
| B10 | The "call you today" promise ignores working hours, and nothing checks the call happened | A promise at 11 pm, then no follow-up if the call is missed | Medium | Say "today" or "tomorrow morning" by working hours; flag "call promised, not logged" at day end | S |
| B11 | The lead or customer chat panel shows the oldest 500 messages, mixed across leads | Staff read old chatter, and the newest messages can be cut off | Medium | Show the newest first; mark lead and project boundaries | S |
| B12 | Any file is accepted as "electricity bill" | Staff may quote from a wrong file | Low | Label it "Bill file — not checked"; add a one-tap "Bill OK" | S |
| B13 | History noise ("Roof: RCC", then "Roof: RCC, 2 floors"), and "Send again" re-sends 3 messages | Clutter for staff, spam for the customer | Low | Merge the notes; on resend, send only what's missing | S |

## C. Customer clarity: what a real homeowner feels

| ID | Issue | What the customer experiences | Sev | Fix | Effort |
|---|---|---|---|---|---|
| C1 | The money isn't explained | Told "cost ₹1,05,969", then asked for 25% of ₹1,83,969, and ₹1,19,580 before dispatch. It feels like a bait-and-switch | High | Before accepting, send one clear Marathi breakdown: the full price, the subsidy coming back to the bank later, and the 3 instalments in round figures | M |
| C2 | The saving can be more than the bill | "Save ₹3,139/month" against a bill of ₹2,000–3,000 loses trust | High | Cap the saving at the bill band, e.g. "up to ₹2,500/month" | S |
| C3 | Business messages arrive in English after the customer chose मराठी | The quote, the pay link, the receipt and "project started" are all English | High | Get Marathi and Hindi templates approved; until then, add a short Marathi chat line after each one | M |
| C4 | The pay link has no button and is long and ugly; outside the 24 h window the plain quote has no PDF or Accept | Hard to tap, looks unsafe; can't accept or pay later | High | Submit the template versions with a PDF, buttons and a short URL button | M |
| C5 | Self-service needs typed English words ("documents", "payments", "menu") | A normal customer never finds them | High | End every message with taps (Menu, Pay, Track project, Talk to us); accept Marathi words too | S |
| C6 | After paying, nobody says what happens next | No survey date, installer or contact person; silence | High | After payment, send the next step, a date, a named person and a phone number | M |
| C7 | The receipt PDF is not sent, and the message points to "the OneOhm app" the customer never got | No proof of payment in the chat | High | Always attach the receipt (the fix is in, still to be proven on a new payment); remove the app line | S |
| C8 | Too many messages at once, and paise amounts | 3 messages in 1 minute; "₹45,992.25" looks like an error | Medium | Merge each event into one message with buttons; round instalments to whole rupees | S |
| C9 | Codes and jargon | OH-Q-2026-0016, OH-2026-013, "Advance on order confirmation", kW vs kWp | Medium | "Your Sangli solar project", "1st instalment (25%)", "6 panels (3.27 kW)" | S |
| C10 | No welcome or trust at the first message | "Hello! Please choose your language." with no company name | Medium | Open with "OneOhm सोलरमध्ये स्वागत 🙏", a verified business profile and a named person | S |
| C11 | A file the bot can't read was called "your electricity bill" | The customer sent a layout drawing and got "bill received" | Medium | Say "file received, our team will check it" | S |
| C12 | Voice notes are refused during onboarding | Low-literacy customers send voice notes | Medium | Accept them and hand over warmly to a person | S |
| C13 | Bill bands and cities show in English inside the Marathi chat | Mixed language | Medium | Translate them per language in Settings | S |
| C14 | "Back" needs typing | Hard for a first-time user | Medium | Add a "मागे" (back) row to each list | S |
| C15 | Small Marathi wording issues | "तुमचे कोटेशन … वर आहे", "Priyaकडून", "नवीन बिल", "tejas" in lowercase | Low | Native review; respectful forms (प्रिया यांच्याकडून), capitalise names | S |
| C16 | Generic PDF names and captions | Hard to find again in WhatsApp media | Low | e.g. "OneOhm-tejas-सोलर-कोटेशन.pdf", with a Marathi caption | S |

## Bigger ideas, from all three reviews

1. **One status card per stage:** "✅ quote accepted → ⏳ 1st instalment ₹45,992 → ⬜ survey → ⬜ installation", with taps [Pay now] [See quote] [Call Priya]. It is sent again at each change, in place of a stream of separate messages.
2. **A "ball is with" field on every lead and project:** who must act next, what, and by when. The owner sees one list of everything stuck for more than N hours, by person.
3. **A quote chase cadence:** day 2 a WhatsApp check-in with buttons, day 5 a call task, 3 days before expiry a reminder, then ask for a lost reason.
4. **Alerts by role, and quiet:** each alert type goes to one role, with backup on leave and a daily digest for admin. Bot-handled events never ping a person.
5. **An honest funnel:** lead → bot estimate → first human contact → quote → accepted → advance paid, by campaign and owner, with response times.

## Notes from the live run
- The receipt PDF fix was made **after** the payment, so this run could not prove it. It needs one new payment.
- The quote-buttons fix is proven live: you tapped Accept → Yes, and the quote was accepted.
