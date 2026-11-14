# Happy-flow demo — findings (2026-11-06)

Live run on the local app, customer +91 80878 23247 on WhatsApp (Marathi), demo team in
`.claude/demo-team.md`. Project **OH-2026-015** (Tejas Patil, Sangli, 3.27 kWp) went from a
WhatsApp "Hi" to Completed in one sitting.

## What was covered, and by whom

| Step | Who (login) | Result |
|---|---|---|
| WhatsApp onboarding (DIWALI26), estimate PDF, call-back | Customer on phone | Lead made, owner Rohit, campaign kept |
| Call log, convert to customer, survey visit booked and done | Rohit (Sales) | WhatsApp visit message delivered |
| Quote with DCR / non-DCR, sent on WhatsApp | Rohit | OH-Q-2026-0018 (after fix #9) |
| Accept on WhatsApp (incl. "Not now" path), create project | Customer, Owner | Project OH-2026-015, 23 tasks, team of 9 |
| Advance, 2nd and final instalment through Razorpay (test) | Customer | Receipts 0032/0033/0034, ₹1,83,969 |
| Electricity details, DISCOM application and sanction, DCR undertaking, net metering, subsidy | Neha (Liaisoning) | All done; customer updates sent |
| Site survey, design, install check, commissioning (with owner approvals) | Amit (Execution), Owner | Approvals inbox used |
| Vendor, PO, send to vendor | Pooja (Procurement) | PO/2026/0011 |
| Goods receipt with serials and DCR certificate, reserve stock | Sagar (Store) | GRN/2026/0010; vendor bill auto-made |
| Dispatch to site with challan | Kunal (Dispatch) | DC/2026/0002; 2nd instalment due |
| Contractor, crew, rate card, work order | Owner, Amit | WO-2026-0015 auto-made at project start |
| Install tasks from the **field app** (phone view) | Dattatray (crew lead) | 5 tasks; WO settled, crew bill ₹14,568 |
| Material use, customer signature, handover from the field app | Amit | Handover pack (2 PDFs) on WhatsApp |
| Bill approval, maker-checker payout via RazorpayX (test) | Meera (Accounts), Owner | Low-balance error clear; both payouts processed (UTR saved) |
| Ratings, complaint with photos, referral, subsidy check on WhatsApp | Customer | Ratings saved, ticket, referral lead |
| Service visit, resolve | Sanjay (Service) | SLA met, customer told |
| Leave request and approval | Kunal, Kavya (HR) | Approved |
| Leads (marketing view), loans view, sales report by campaign, command centre | Tanvi, Rahul, Owner | DIWALI26 row correct |

Not covered: loan-financed project, AMC sale, customer mobile app, reseller login, change
request (load change was flagged but not raised).

## Findings

| # | Where | What | Severity | Status |
|---|---|---|---|---|
| 1 | Inventory → Add vendor | Wrong bank details grey out the save button with no reason shown: the reason shows only after a save try, and a grey button cannot be tried. | Medium | Fixed: reasons shown, Save never blocks silently (vendor + contractor) |
| 2 | Team → Add person (HR) | HR cannot give the I&C partner role ("needs someone who manages roles"). Only the owner can add a crew person. | Low (by design?) | Open |
| 3 | Meta setup | Meta has two webhook overrides (phone number and WABA); the phone-number one wins. Only one was moved, so inbound messages were lost. | Setup | Fixed live |
| 4 | WhatsApp onboarding | A shared "current location" pin never finds the city (only the pin's text label is read), though the button says "we use it to find your city". The city is asked again. | Medium | Fixed: pin reverse-geocoded to the service city |
| 5 | Lead page | After the estimate and "Call me back" the stage stays New (moves to Contacted only after staff log a call). | Low | Open |
| 6 | Convert to customer | Floors pre-fills 1 though the customer said 2 floors on WhatsApp. | Low | Fixed: floors saved on the lead and pre-filled |
| 7 | Convert to customer | Site map opens on Kolhapur, not the pin the customer shared on WhatsApp. | Low | Fixed: map opens on the WhatsApp pin |
| 8 | Lead page | After the survey visit is marked done, the follow-up card still says "Site survey". | Low | Open |
| 9 | Quote, project, change request and work order numbers | Next number = row count + 1. After any delete the number repeats an existing one and saving fails ("Something went wrong"). | High | Fixed: `nextInSeries` (highest + 1, locked) in `packages/database/src/series-number.ts` |
| 10 | Quote on WhatsApp | The quote went as the English `quotation_sent` text template to a Marathi chat, with no PDF. | Medium | Was the staff log, not the send: quote went in Marathi with PDF. Log fixed |
| 11 | Accept on WhatsApp | The thank-you says "Rohit will start your project", but Sales cannot create projects (owner only). The "start the project" alert went to Rohit and Asha (neither can), and skipped the owner (marked on leave). | Medium | Fixed: "our team"; alert to people who can create projects + FYI to owner |
| 12 | Project page | A new project shows "At risk" in its first minute. | Low | Open |
| 13 | Finance → overview | The aging box shows paise (₹6,61,762.65); other screens show whole rupees. | Low | Open |
| 14 | Task "Verify electricity bill" | Meter holder name is empty though it was typed at Convert to customer. | Low | Open |
| 15 | Survey / material tasks | Facts known earlier are not pre-filled: survey floors/structure (known from the quote), cell maker and cell invoice (typed at goods receipt). | Low | Open |
| 16 | Survey "Complete task" dialog | Shows "Site photo needed" although a photo is already attached. | Low | Open |
| 17 | Progress updates on WhatsApp | `project_milestone` and other updates go in English to a Marathi chat (only the English template is approved). | Medium | Fixed: in-language chat message while the window is open |
| 18 | PO task | "Raise purchase orders" stays open after the PO for the project is raised and received; it must be closed by hand, retyping the PO number. | Low | Open |
| 19 | Goods receipt | Stock bought on a PO *for this project* lands as free stock, not held for the project. | Low | Open |
| 20 | Roof-ready question (WhatsApp) | The "Is your roof ready?" question closes when dispatch is marked done. The customer's "yes" 40 s later was answered "that message is no longer open". | Medium | Fixed: open until installation starts; late answers kept |
| 21 | Contractor form | TDS % accepts 11% (typo). Contractor TDS is 1% / 2%. | Low | Open |
| 22 | Contractor bill | Bill shows TDS ₹0 though the work order held back 1% (₹147). | — | Not a bug: the ledger has ₹147 in TDS payable (booked at the work order); the project ledger balances to ₹0 |
| 23 | Handover task (field app) | "Complete task" gives no visible reaction on a 409; the reason (material still with contractor) is only written higher up the page. | Low | Open |
| 24 | Final payment | A second English "please pay" with a Razorpay link went out 11 s after the customer tapped Pay. | Low | Fixed: no link template while the chat has a Pay button |
| 25 | Complaint on WhatsApp | 3 photos sent together: only the last is linked to the ticket; 2 are filed as loose "other" files. The bot also repeated the photo prompt per photo. | Medium | Fixed: locked photo step, one prompt, all photos linked |
| 26 | Project papers | "Model Agreement · OH-2026-015.pdf" made twice at the same second. | Low | Open |
| 27 | Field app (web build) | Reloading `/tasks/<id>` lands on Today instead of the task. | Low | Open |
| 28 | Activity log | "rated the इन्स्टॉलेशन 4/5": a Marathi stage name inside the English staff log. | Low | Open |
| 29 | Sales report | Pipeline shows "Quotation sent 11" but "Order won 14" (more won than quoted). May be old test data marked won by hand. | Low | Open |
| 30 | RazorpayX setup | No `payout.*` webhook reached the API: RazorpayX keeps its own webhook list (RazorpayX → Settings → Developer controls), separate from the Razorpay one. The 5-minute payout check is the fallback. | Setup | Open |

See also `docs/testing/2026-11-06-whatsapp-review.md` (full WhatsApp review, 16 fixes, safety review).
