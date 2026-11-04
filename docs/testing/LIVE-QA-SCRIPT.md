# Live QA script — WhatsApp sales cycle (Parts 1–3)

Who does what:
- **You** use the phone +91 8087823247 (the customer) and the web app on your laptop.
- **Claude** watches the app and the database, checks every step, and writes the result here.

Every row is one feature built in this session. Mark ✅ / ❌ in "Result".

## Before we start (setup)

| # | Item | Who | Status |
|---|---|---|---|
| S1 | WhatsApp live mode, test number +91 8087823247 only | already set in `.env` | ✅ |
| S2 | Razorpay test keys (`rzp_test_…`) and webhook secret | already set in `.env` | ✅ |
| S3 | A public address (tunnel) for the API, so Meta and Razorpay can reach it and Meta can fetch the PDFs | Claude started cloudflared (npm) → `https://itunes-manufacturers-leadership-ross.trycloudflare.com` | ✅ |
| S4 | `API_PUBLIC_URL` = the tunnel address | Claude set it in `.env` (backup kept) | ✅ |
| S5 | Meta app → WhatsApp → Webhook URL = `<tunnel>/v1/webhooks/whatsapp/<path key>` | Claude set the number-level webhook override through the Meta API | ✅ |
| S6 | Razorpay test dashboard → Webhook URL = `<tunnel>/v1/webhooks/razorpay`, events `payment_link.*` | Claude created a test-mode webhook through the Razorpay API | ✅ |
| S7 | API and worker running with the latest code (the worker sends WhatsApp messages) | Claude restarted the API and started the worker | ✅ |
| S8 | Templates on Meta: which of `quotation_sent`, `payment_link`, `payment_reminder`, `payment_received` are approved | All plain templates APPROVED on Meta; the versions with file and buttons are not submitted yet (switches stay off) | ✅ |
| S9 | Test data: one campaign code `DIWALI26`, service cities, one sales person on leave | Claude added DIWALI26 and the cities Pune, Satara, Sangli in Settings | ✅ |

Messages the bot sends while you are chatting are free-form replies and need no Meta template. Template messages are only needed when we write first (quote sent, payment link, receipt). If a template is not approved yet, that one message fails and the app shows it; the rest of the run continues.

## Journey A — new customer from an ad, to paid advance

| # | Feature | You do | You should see | Claude checks on our side | Result |
|---|---|---|---|---|---|
| A1 | Campaign code | Send `Hi OneOhm DIWALI26` | Language buttons: English / मराठी / हिंदी | Chat saved the campaign code | ✅ code DIWALI26 saved on the chat; language buttons delivered and read |
| A2 | Language | Tap **मराठी** | Next question in Marathi | Chat language = mr | ✅ chat language mr; next question in Marathi |
| A3 | Name | Tap **Yes** (or Change and type) | City question | — | ✅ "आम्ही तुम्हाला tejas म्हणू का?" → हो |
| A4 | City → lead created | Pick **Pune** | Site type list | Lead created, owner by rule (not the person on leave), source WhatsApp, campaign DIWALI26, owner alert, history note | ✅ (picked Sangli) lead created: owner Priya Kulkarni, source WhatsApp, campaign DIWALI26, alert "New lead · WhatsApp … Campaign: Diwali poster 2026", history note |
| A5 | Back one step | Type `back` | City question again | Nothing lost | ✅ "back" → city question again; answers kept (the first "back" never reached WhatsApp's webhook) |
| A6 | Site type | Pick **Home** | Bill list | Lead site type set, history note | ✅ घर → lead type individual; note "Site: Home" |
| A7 | Unclear answer | Type `hello` | The bill question again, asked more simply | Not handed over yet | ⬜ skipped (no "hello" sent) — covered by the automated test |
| A8 | Bill | Pick **₹2,000–3,000** | Roof list | Lead size 3 kW, history note | ✅ ₹2,000–3,000 → lead size 3 kW; note "Bill: ₹2,000–3,000 (about 3 kW)". Note: band labels show in English inside the Marathi chat (they are typed in Settings) |
| A9 | Roof and floors | Pick **RCC**, then **2 floors** | Photo request | History notes | ✅ RCC स्लॅब, 2 मजले → notes; photo request sent in Marathi |
| A10 | Bill photo | Send a photo of any bill | "Thanks" | Photo filed on the lead as electricity bill | ✅ PDF sent → filed on the lead as electricity bill (no customer yet); "धन्यवाद, तुमचे वीज बिल मिळाले." |
| A11 | Instant estimate | — | 📄 Estimate PDF + buttons Call me back / Talk to a person / Not now | Estimate saved; lead stage Contacted; next action "Call — estimate sent" today | ✅ 📄 estimate PDF delivered and read: 3.27 kW, 6 panels, ₹1,83,969, subsidy ₹78,000, after subsidy ₹1,05,969, saving ₹3,139/month, payback 3 years; buttons in Marathi; lead Contacted; next action today "Call — estimate sent (3.27 kW, ₹1,83,969)" |
| A12 | Call me back | Tap **Call me back**, then tap it again | "<owner> will call you today" (once) | One alert, one history note | ✅ one tap reached the app: "आज Priyaकडून तुम्हाला कॉल येईल", one alert, next action today (WhatsApp sends a reply button once, so the 2nd tap never left the phone) |
| A13 | Staff: lead page | Open the lead in the web app | Source "WhatsApp · Diwali…", estimate card with PDF, bill photo, history | — | ✅ "WhatsApp · Diwali poster 2026"; Estimate sent card with Open PDF; full history; bill under Documents → Electricity bill. Cosmetic: saving shows ₹3,139.20 (paise) |
| A14 | Staff: reply in chat | Reply from the lead page chat | Your reply arrives on the phone | Chat taken over by staff | ✅ Claude replied from the lead page; delivered; chat taken over by staff |
| A15 | Staff: convert and quote | Convert to customer, make a quote, Send | 📄 Quote PDF on WhatsApp (+ Accept / Question buttons if the template version with buttons is approved) | Lead stage Quoted | ✅ converted (customer language mr-IN, audit lead.converted); quote OH-Q-2026-0016 sent: approved text template + 📄 quote PDF, both read; lead Quoted. GAP FOUND + FIXED LIVE: Accept/Question buttons now follow the PDF as a chat message (Meta template version with buttons not approved yet) |
| A16 | Documents menu | Type `documents` | List with the quote link | — | |
| A17 | Accept on WhatsApp | Tap **Accept quote** → **Yes** | Thank-you | Quote accepted by customer (audit), lead Won, "start the project" alert | ✅ कोटेशन स्वीकारा → confirm → हो, स्वीकारतो → quote accepted (audit by customer, phone, channel whatsapp), lead Won, "tejas accepted OH-Q-2026-0016 on WhatsApp — start the project" alerts, thank-you in Marathi |
| A18 | Project → advance Pay now | Staff start the project | Pay now message (template `payment_link`) | Advance milestone due | ✅ project OH-2026-013 created; advance ₹45,992 due; project_started + payment_link templates sent and read (link = our pay page via tunnel) |
| A19 | Payments menu | Type `payments` | Amount due + **Pay now** button | — | |
| A20 | Pay on the web | Tap **Pay now**, pay with Razorpay test UPI/card | Razorpay page opens in the browser, payment succeeds | Webhook received; payment, receipt and ledger recorded; owner and accounts alerted | ✅ paid in Razorpay test; webhook payment_link.paid arrived through the tunnel; payment ₹45,992 recorded, receipt OH/RCPT/2026-27/0025, advance milestone Paid, staff "Online payment received" alert |
| A21 | Receipt | — | Payment received + 📄 receipt | — | ✅ "payment received" message delivered and read. GAP FOUND + FIXED: the receipt PDF now also follows as a chat file while the customer is chatting (same reason as the quote buttons) |
| A22 | Old link | Tap the old Pay now again | "This is already paid. Thank you!" | — | |
| A23 | Report | Open Reports → Sales → By campaign | DIWALI26 row: 1 lead, 1 estimate, 1 quoted, 1 won, collected = advance | — | |
| A24 | Language kept | — | All messages after the sale are in Marathi | Customer language = mr-IN | |

## Journey B — side paths (Claude resets the test number between runs)

| # | Feature | You do | You should see | Claude checks | Result |
|---|---|---|---|---|---|
| B1 | Talk to a person mid-chat | Start again, tap **Talk to a person** at the city question | "<owner> will reply here" | Lead made first (city "Not given"), owner alerted | |
| B2 | Expert path | Start again, pick **Farm** | "Our expert will prepare your price" | No estimate; hand-over; next action today | |
| B3 | Not now | Start again to the estimate, tap **Not now → 1 month** | Thank-you | Next action in 1 month | |
| B4 | Text after estimate | Type `too costly` after the estimate | "<owner> will reply here" | Owner alerted | |
| B5 | Nudge | Start again, stop at the bill question | One nudge (Claude moves the clock back 4 hours in the database and runs the job) | Lead next action "stopped at bill question" | |
| B6 | Stop before city | Start again, stop at the name question | — | After the job runs: a lead with city "Not given" and a next action today | |
| B7 | Everyone on leave | Claude puts every sales person on leave, you start again | Normal chat | Admin owns the lead; staff desk alert | |
| B8 | Website lead with UTM | Claude posts a website form with UTM tags | — | Lead with UTM fields; By campaign row | |
| B9 | Turn onboarding off | Turn it off in Settings, send `hi` | The old "Call me back" buttons | — | |
| B10 | Expired link | Wait for a real expiry (at least 1 day) or skip | One fresh Pay now | — | |

## Settings screens (you click, Claude checks the result)

| # | Screen | Try | Result |
|---|---|---|---|
| C1 | Settings → WhatsApp onboarding | Add cities, change a bill band, save | |
| C2 | Settings → Ad and campaign codes | Add `DIWALI26` "Diwali poster" | |
| C3 | Settings → Assignment → New leads | Take turns; a city owner for Pune | |
| C4 | Settings → WhatsApp messages | The switch "Meta approved the version with file and buttons" | |

## Not testable live today
- **Click-to-WhatsApp ad referral:** this needs a real Meta ad. It is covered by the automated test.
- **Family member tapping Accept:** this needs a second phone. It is covered by the automated test. If you have a second number, we add it to the test list and run it.
- **A failed PDF send alert:** this cannot be forced live. It is covered by the automated test.

## Round 2 — after the review fixes (2026-11-03, taps only, chat in Marathi)

| # | Step | Result |
|---|---|---|
| R1 | Send `hi` | ✅ Marathi menu with 10 rows |
| R2 | Tap कागदपत्रे (Documents) | ✅ Quote link, then taps मेनू · प्रकल्प पाहा · आमच्याशी बोला |
| R3 | Tap पेमेंट (Payments) | ✅ "Your solar project in Sangli": instalment 1 paid, 2 and 3 later, with taps |
| R4 | "Before dispatch" falls due | ✅ Marathi `payment_link` template delivered |
| R5 | Open the pay link | ✅ Landing page, Continue opens Razorpay. ⚠️ No UPI: the amount (₹1,19,580) is above the UPI limit of ₹1 lakh |
| R6 | Pay (netbanking, test) | ✅ Marathi receipt template with the receipt PDF (`payment_received_file`), then the next step with Priya's name and phone and taps. Order correct |
| R7 | Tap the old pay link again | ✅ "Already paid" shown |
| R8 | Send a voice note | ✅ Warm Marathi hand-over: "Priya will listen and reply here" |
| R9 | `STOP`, then `START` | ✅ Both confirmed in Marathi; the opt-out flag cleared |

### New findings from round 2
1. **UPI limit (High):** an instalment over ₹1,00,000 cannot be paid by UPI on one link.
2. The Documents answer shows the quote code (OH-Q-2026-0016), and the receipts are not listed (Medium).
3. In the staff chat history, a template shows the English text even when the customer got Marathi (Low).
4. The templates still carry the milestone label and the project code ("Before dispatch of panels and inverter", "OH-2026-013") (Medium, C9).
5. The STOP and START replies have no taps (Low).
6. The old test project still shows paise amounts. It was made before the rounding fix, so new projects show whole rupees (no action).

## Round 3 — after the round 2 fixes (2026-11-03)

| # | Step | Result |
|---|---|---|
| S1 | Documents | ✅ A list of papers in Marathi. ⚠️ The quote and receipts showed twice (system copies with codes). Fixed in `6957b21` |
| S2 | Tap a receipt | ✅ The receipt PDF came as a file, then taps मेनू · आमच्याशी बोला |
| S3 | `STOP` | ✅ Marathi reply with the "पुन्हा सुरू करा" tap |
| S4 | Tap "पुन्हा सुरू करा" | ✅ "पुन्हा स्वागत!" with the मेनू tap |
| S5 | Refer a friend who is already a lead | ⚠️ The reply was in English. Fixed in `6957b21` (Marathi, with a Menu tap) |
| S6 | Last instalment falls due | ✅ Pay template values in plain words: "Last instalment (10%)", "Sangli · 3.27 kW" |
| S7 | Pay ₹18,397 by UPI | ✅ Marathi receipt template with the PDF, then the next step (net meter and subsidy papers) with Priya's name and phone. Order correct. Staff history tagged "· sent in Marathi" |

## Round 4 — menus not yet tested live (2026-11-04)

| # | Step | Result |
|---|---|---|
| T1 | Project progress | ✅ "Your solar project in Sangli · 6 panels (3.27 kW)", the stage, the next step, the subsidy. ⚠️ It offered Pay now when all was paid, and the next step's name was in English. Fixed in `bc45d97` |
| T2 | Complaint, cancelled with Menu | Not done: the tester went straight to T3. Covered by acceptance 51 |
| T3 | Complaint with a photo and caption | ✅ Saved with the photo; taps माझ्या विनंत्या · मेनू |
| T4 | My requests | ✅ The complaint, "New", with taps |
| T5 | Warranty and AMC | ✅ "The warranty starts on the day the system starts", with taps |
| T6 | My rewards | ✅ "No referrals yet", with taps |
| T7 | Give a rating | ✅ "We will ask for your rating when the system starts", with taps |
| T8 | A typed question | ✅ "Priya will reply here", with Menu; the chat is held by a person |
| T9 | `धन्यवाद` in the held chat | ✅ Went to the person, as ruled (no bot reply in a held chat) |
