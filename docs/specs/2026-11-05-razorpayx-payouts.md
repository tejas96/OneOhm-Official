# RazorpayX payouts — audit and spec (2026-11-05)

Status: built on branch `feat/razorpayx-payouts` (not committed). Go-live steps: docs/DEPLOYMENT.md section 5d.

## 1. Audit

### What works today

| Area | What works | Where |
|---|---|---|
| Who gets paid | Vendor bills (from goods receipts) and contractor bills (work order, retention, advance) use one path. Hand-typed bills have no payee and cannot go by bank. | `apps/api/src/modules/bank-payouts/payees.ts` |
| Bill amount | Pays amount − TDS − advances set off. Whole bill only, no part payment. | `packages/domain/src/finance/tds.ts:30` |
| Checks | Mode off, bill not approved, no payee, no bank details, bad IFSC/account, nothing due, already sending. | `payout-rules.ts` |
| Double click | One open payout per bill (DB unique index). Razorpay idempotency key = our payout id. | `0035_one_open_payout.sql`, `payout-gateway.ts` |
| Fund accounts | Contact + fund account made once and reused. Bank details stored as a hash. | `fund-accounts.ts` |
| Webhook | Signature checked. Each event stored once. Failed handling lets Razorpay retry. | `razorpay-webhook.controller.ts` |
| Missed webhook | Live mode asks RazorpayX about open payouts every 5 minutes. | `payout-sync.service.ts` |
| Ledger | Bill paid entry, fee as bank charge, UTR on the bill. TDS posted at approval (bills) or settlement (work orders). | `payout-events.ts`, `payable-postings.ts` |
| Alerts | Processed and failed alerts go to finance people. | `payout-events.ts` |
| Masking | Vendor account shown as last 4 digits. | `bank-payouts.ts:maskAccount` |

### Where money can go wrong or a failure goes silent

| # | Problem | Today the owner sees | Risk |
|---|---|---|---|
| 1 | Razorpay call times out, but Razorpay made the payout. We mark it "failed". Owner presses Pay again with a new id. | "Could not be started" | **Pays twice** |
| 2 | Late "processed" webhook for a payout we marked failed is ignored. | Bill stays unpaid | **Money gone, not recorded** |
| 3 | Owner records a manual payment while a bank transfer is on its way. Both go through. Webhook then skips the bill quietly. | Nothing | **Pays twice** |
| 4 | App crash after the payout row is saved, before Razorpay answers. Row stays "queued" with no Razorpay id. Sync skips it. Bill is blocked forever. | "On its way" forever | Stuck, silent |
| 5 | Reversal after "processed": bill stays paid, ledger not reversed. | One alert | Books wrong |
| 6 | Low balance: payout is queued by Razorpay (`queue_if_low_balance: true`). | "On its way" | Silent wait; money leaves later without warning |
| 7 | No "stuck too long" alert. Sync errors only go to a background log. | Nothing | Silent |
| 8 | Sandbox mode: nothing ever completes a practice payout. Sync is off. | "On its way" forever | Cannot test |
| 9 | Webhook arrives before we save the Razorpay id: marked "unknown" and never retried. | Nothing (live sync covers it later; sandbox never) | Silent |
| 10 | Bank details changed: a new fund account is made silently. No audit, no hold, no alert. | Nothing | **Fraud risk** |
| 11 | Contractor API returns the full bank account number. | — | Data leak |
| 12 | Payout panel load error shows a blank panel. | Blank | Silent |
| 13 | Payout alerts open the home page, not the bill. | Wrong page | Confusing |
| 14 | One tap sends money. No confirm step, no fee shown. | — | Mistakes |
| 15 | Failed sends are not in the audit log. Contact / fund account errors give a raw server error. | Raw error | Weak trail |
| 16 | No maker-checker. By default only Super Admin may send. | — | Policy gap |
| 17 | Payee is never told they were paid. | — | Calls to the office |
| 18 | Live mode with no webhook secret: webhooks are refused (404). Boot check does not catch it. | Nothing (sync covers it, 5 min late) | Silent |
| 19 | Fee on failed / reversed payout not booked. | — | Books slightly off |

### Facts checked

- TDS: from 1 April 2026 contractor TDS is under section 393(1) of the Income-tax Act 2025 (was 194C). Rates stay 1% (individual/HUF) and 2% (others), per secondary sources. I could not confirm the yearly and single-payment limits from an official page. I will not hard-code them; the code keeps the per-contractor rate that the owner sets.
- RazorpayX: with `queue_if_low_balance: false` a payout fails at once on low balance. I found no confirmed public endpoint to read the account balance. So OneOhm cannot show the balance before sending; it can show a clear "not enough balance" error.
- Fees and GST are taken from the RazorpayX balance, not from the payout amount. The webhook gives the real fee.

## 2. Spec

### Journeys

**Owner pays a bill (main journey)**
1. Finance → Payables → bill → **Pay**. Dialog opens on "Send to bank".
2. Dialog shows: to whom (name on account, `•••• 1234`, IFSC), amount, how (IMPS now / NEFT, with one plain reason), fee line, and "Money leaves your RazorpayX balance."
3. Owner presses **Pay ₹X**. A confirm step repeats the amount and payee. Owner presses **Yes, send**.
4. Bill shows "On its way". When the bank confirms, bill shows "Paid · UTR …". Owner gets an alert. Payee gets a WhatsApp message with amount and UTR.

**Something goes wrong** — every case ends with a clear line on the bill, an alert, and a next step:

| Case | Owner sees | Next step offered |
|---|---|---|
| Not set up (mode off / keys missing) | "Bank transfers are off" + who can switch on | Record payment by hand |
| No / bad bank details | Which field is missing | Link to vendor / contractor page |
| Bank details changed recently | "Bank details changed on <date> by <name>. Wait until <time>." (see decision 2) | Wait, or check with payee |
| Low balance | "Not enough money in RazorpayX. Add money, then press Pay again." | Top-up help link |
| Bank rejected | Bank's reason in plain words | Fix details, pay again |
| No answer for 30 min (IMPS) / 4 h (NEFT) | "Taking longer than usual" alert | We keep checking; contact link |
| Unclear start (timeout) | "Checking with RazorpayX…" — Pay stays locked | We ask RazorpayX by our id; no second send |
| Reversed after paid | Alert "Money came back". Bill goes back to To pay. Ledger reversed. | Pay again |
| Manual record while transfer open | Blocked: "A bank transfer is on its way" | Cancel first (only if still queued) |

### States

`sending` (new, our side, before Razorpay answers) → `queued` / `pending` / `processing` → `processed` (bill paid) or `failed` / `rejected` / `cancelled` / `reversed` (bill to pay again).

Rules:
- A payout we are unsure about is **never** marked failed. It stays open and is checked against RazorpayX by our reference id. Only RazorpayX's answer closes it.
- A later Razorpay status always wins over our guess. "Processed" after our "failed" settles the bill and alerts.
- Webhook and sync share one function. Out-of-order events are ignored by status rank.

### Money safety changes
- Retry keeps the same payout row and the same idempotency key.
- Manual "record payment" is blocked while a payout is open (in the same DB transaction, with row lock).
- Reversal: new ledger entry reverses "bill paid"; bill back to approved; fee kept as bank charge.
- Fee booked for every payout that has one, also failed or reversed.
- Audit: sent, failed to start, processed, failed, reversed, bank details changed, with user and IP.
- `queue_if_low_balance: false`.

### Fee shown before sending
A setting "Your RazorpayX fee per payout" (empty by default). Empty → "RazorpayX charges a small fee (shown after sending)". Set → "Fee about ₹X + GST". The real fee from Razorpay is what gets booked.

### Screens (reuse current Dialog, StatusPill, Badge, toast, tokens)
- Pay bill dialog: add fee line, confirm step, error state with retry, stuck state.
- Payables list: pills "On its way", "Taking long", "Came back", "Failed".
- Vendor and contractor pages: "Bank details changed" note with date and who.
- Settings → Payments: mode status (off / practice / live), last check time, last error, fee field.
- Practice mode only: "Finish as paid" / "Fail" / "Reverse" buttons on a payout, which send a signed test webhook.

### Alerts (in-app; opened to the bill)
processed · failed · reversed · stuck too long · bank details changed · sync check failing (3 times in a row).

### Owner decisions (2026-11-05)
1. **Two people above a limit.** New setting "Second person needed above ₹X" (default ₹0 = off). Above it, **two different people must take part**: the sender plus at least one other person who approved the bill or pressed "Ask to send". Checked on the server. (Changed after the walkthrough: "approver cannot send" would lock out an owner who approves and sends while accounts only asks.)
2. **Bank change hold.** Any change to bank name, number or IFSC is audited and starts a 24-hour hold. All approvers get an alert naming who changed it. No payout to new details until the hold ends.
3. **Part payments.** Bills get `paid_paise` (paid so far). "Left to pay" = to-pay − paid so far. The owner can send any amount up to what is left (default: all of it). The bill is "paid" only when nothing is left. Each part has its own payout, ledger entry and UTR. Manual "record payment" also takes an amount. One open payout per bill stays. A reversal gives back only that part.

## 3. Walkthrough as each user — pain points and fixes

I walked each journey against today's screens (`payables-tab.tsx`, `pay-bill-dialog.tsx`,
`bank-transfer-panel.tsx`, approvals inbox, contractor page). These fixes change the spec above.

| # | Who | Pain point | Fix |
|---|---|---|---|
| U1 | Accounts | Sees **Pay**, opens "Send to bank", gets only "needs an approver". Dead end. | **Ask to send** button. It puts "Send ₹X to Y" in the approvers' Approvals inbox with an alert. The approver sends in one tap there. This is also the two-person step. |
| U2 | Owner | One bill shows two statuses: "Approved" pill and "On its way" badge. | One status pill: **To pay · Sending · Part paid · Paid · Came back**. |
| U3 | Owner | Bank tab opens even when the payee has no bank details. Dead end. | Panel shows **Add bank details** in place, using the same fields as the vendor / contractor page. |
| U4 | Owner | 24-hour hold would delay the first payment to every new vendor. | Hold only when **saved details change**. First entry: no hold, but a "New account — check the name with the payee" note. |
| U5 | Owner | Payee phones with a new account and the owner must pay today. | Another approver (not the person who made the change) can **release the hold early**. Audited. |
| U6 | Owner (one-person firm) | Two-person rule could lock the only owner out. | Settings lets you turn it on only when 2 or more people can send. The panel names who can send. |
| U7 | Owner | Part payment: "how much do I type?" | Amount box filled with **all that is left**. Line under it: "Left after this: ₹X". Blocks more than left and less than ₹1. |
| U8 | Owner | Low balance is learned only after a failed send. | After a low-balance failure, a banner stays on Payables: "Add money in RazorpayX, then pay again", until the next good send. |
| U9 | Owner | Alerts open the home page. | Every payout alert opens that bill. |
| U10 | Approver | Inbox lists bills to approve, not payouts waiting to be sent. | New inbox item "Send ₹X to Y" (from U1). |
| U11 | Owner | Contractor page shows "Approved" bills with no way to pay. | **Pay** link opens that bill's pay dialog in Finance. |
| U12 | Owner | Payee calls: "Where is my money?" | **Copy payment details** (amount, date, UTR, last 4 digits) for WhatsApp or SMS. |
| U13 | Payee | Never told. | WhatsApp `vendor_paid` message with amount and UTR. Needs Meta approval; it stays off until the owner switches it on. While off, the bill says "Payee not told". |
| U14 | Owner | Practice payouts never finish. | Practice mode only: **Mark paid / Fail / Came back** buttons. They run the real webhook code with a signed test event. |
| U15 | Owner | Cannot tell if live setup is right. | Settings → Payments shows a setup check: mode, account number, keys, webhook secret, last webhook time, last check time, last error. |
| U16 | Owner | "IMPS / NEFT" is jargon. | Show "Reaches in minutes" or "Reaches the same day (bank hours)". Mode name in small text. |
| U17 | Owner | "Sending" for a long time and no idea why. | Shows "Last checked with RazorpayX <time>. We check every 5 minutes." Alert when stuck too long. |

### Build order (lowest risk to money first)
1. Money safety in the API: no false "failed", same key on retry, late "processed" wins, manual record blocked while sending, reversal books and reopens, fee always booked, no low-balance queue, stuck alerts, full audit, contractor number masked, boot check for the webhook secret.
2. Part payments (DB, ledger, reports).
3. Ask to send, two-person rule, bank change hold.
4. Screens: status pill, pay dialog, inbox item, settings check, practice buttons, contractor link, copy details.
5. Payee WhatsApp message (switch, off by default).

### Out of scope for v1 (unless you say so)
- UPI ID payouts (bank account only).
- Scheduled / future-dated payouts.
- Bulk pay many bills at once.
- Showing the live RazorpayX balance (no confirmed API).
