# Live test: WhatsApp and Razorpay (test keys)

One live run of the quote-to-receipt journey, on a test setup. It uses the real WhatsApp
Cloud API (only to one test number) and the real Razorpay **test** API.

**The owner types every key and secret. Claude never does.** Claude can read this list and
help check results, but it does not enter keys, tokens or passwords.

Needs part 1 of the sales cycle only: `quotation_sent`, `payment_link`, `payment_reminder`
and `payment_received`. Estimate, slot and onboarding templates come in later parts.

## Before you start

- [ ] Meta approved the versions with file and buttons of the four templates, and the Meta
  names are set in **Settings → Messages**. See `docs/whatsapp-templates.md`. (If not, the
  test still works with the old text templates; the checks for buttons and files will not.)
- [ ] A public tunnel (for example ngrok or Cloudflare Tunnel) points to the API port.
  Note its https address. It is `API_PUBLIC_URL` below.
- [ ] The test phone is +91 8087823247 and has WhatsApp.

## Settings in `.env`

Set these in the API's `.env`. The worker must have the same `.env` values, and above all the
**same `FILE_LINK_SECRET` as the API**. If they differ, the PDF links the worker makes will
not open.

| Setting | Value |
|---|---|
| `WHATSAPP_DELIVERY` | `live` |
| `WHATSAPP_TEST_NUMBERS` | `+918087823247` (only this number gets messages) |
| `WHATSAPP_ACCESS_TOKEN` and the other WhatsApp keys | from Meta (see `.env.example`) |
| `RAZORPAY_MODE` | `live` (with `rzp_test_` keys; see below) |
| `RAZORPAY_KEY_ID` | your `rzp_test_...` key id |
| `RAZORPAY_KEY_SECRET` | your Razorpay test key secret |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you type in the Razorpay webhook form |
| `API_PUBLIC_URL` | the public tunnel address, no trailing slash |
| `FILE_LINK_SECRET` | the same value for API and worker |

`rzp_test_` keys are allowed with `RAZORPAY_MODE=live` when `NODE_ENV` is not `production`.
The production check (`productionIssues` in `apps/api/src/config/environment.ts`) only
refuses them in production. Never run this test on the real server.

Restart the API and the worker after you change `.env`.

## Webhooks

- [ ] **Razorpay test dashboard** → Settings → Webhooks → Add.
  - URL: `<API_PUBLIC_URL>/v1/webhooks/razorpay`
  - Secret: the same as `RAZORPAY_WEBHOOK_SECRET`
  - Events: `payment_link.paid`, `payment_link.partially_paid`, `payment_link.expired`,
    `payment_link.cancelled`
- [ ] **Meta** (WhatsApp) webhook: `<API_PUBLIC_URL>/v1/webhooks/whatsapp`, subscribed to
  "messages". See `.env.example` for the verify token and secret.
- [ ] Open `<API_PUBLIC_URL>/v1/health` (or any public page) in a browser to see the tunnel
  reaches the API.

## The journey

Use one test customer whose own number (`customers.phoneE164`) is +918087823247. Only that
number can accept a quote. Write what you see in "Result".

| # | Step | Expect | Result |
|---|---|---|---|
| 1 | Staff send a quotation to the customer | WhatsApp message arrives on the test phone with the quote PDF as the header and two buttons: Accept quote, I have a question | |
| 2 | Open the PDF on the phone | The PDF opens | |
| 3 | Tap **Accept quote** | A thank-you arrives. The quote shows accepted in the app | |
| 4 | Staff open the alert and create the project | The project exists. The advance payment is due | |
| 5 | Check the WhatsApp message for the advance | It has a **Pay now** button | |
| 6 | Tap **Pay now** | The OneOhm pay page opens (`/v1/pay/due/<token>`) and goes on to Razorpay | |
| 7 | Pay with a Razorpay test UPI (`success@razorpay`) or test card | Razorpay shows success | |
| 8 | Wait for the webhook | A receipt PDF arrives on WhatsApp with a thank-you | |
| 9 | Check the app: lead, customer, project, finance, chat | Each one shows the payment (see the loop table) | |
| 10a | Cancel the open link (staff in the app, or in the Razorpay dashboard), then tap the old **Pay now** | The old link is marked cancelled. No new WhatsApp message goes out. The Pay now page does not show "closed": it works from the pay token, so it makes a new Razorpay link for what is still owed and opens it. If the amount is already paid, it says "This is already paid. Thank you!" | |
| 10b | Expiry: a link passes its end date (`payment_link.expired`) | The old link is marked expired. One fresh Pay now message goes to the customer and one alert to the owner. Not repeated if Razorpay sends the event twice | Check on the first real expiry. It cannot be forced quickly (`PAYMENT_LINK_DAYS` is at least 1 day). Covered by the automated test `28-whatsapp-after-payment` | |

## The loop table

For each action, tick each thing you saw. A dash means that column does not apply.

| Customer action | Record | History | Alert | Next action | Message out | Audit |
|---|---|---|---|---|---|---|
| Quote sent | [ ] quote marked sent, lead moved to quoted | [ ] lead note | [ ] — | [ ] — | [ ] quote message with PDF and buttons | [ ] — |
| Accept quote | [ ] quote accepted, lead won | [ ] lead note and customer note | [ ] owner told, project setup | [ ] "Start project" | [ ] thank-you | [ ] `quotation.accepted` (by customer, whatsapp, phone, total) |
| Project created, advance due | [ ] project and advance payment due | [ ] project note | [ ] owner or accounts | [ ] — | [ ] payment message with Pay now | [ ] — |
| Pay now opened | [ ] pay page shows the right amount | [ ] — | [ ] — | [ ] — | [ ] — | [ ] — |
| Pay | [ ] payment, receipt, ledger | [ ] customer and project note | [ ] owner and accounts | [ ] — | [ ] thank-you and receipt PDF | [ ] payment audit |
| Link cancelled | [ ] old link marked cancelled | [ ] — | [ ] — | [ ] — | [ ] none sent | [ ] — |
| Link expired (check on the first real expiry) | [ ] old link marked expired | [ ] — | [ ] owner told | [ ] — | [ ] one fresh Pay now message, sent once | [ ] — |
| Chat view | [ ] every message above is in the customer's chat | [ ] — | [ ] — | [ ] — | [ ] — | [ ] — |

## If something fails

- No message at all: check `WHATSAPP_DELIVERY=live` and that the number is in
  `WHATSAPP_TEST_NUMBERS`.
- Message sent without the file or buttons: the extras switch is off, or the Meta name is
  not set. Check **Settings → Messages**.
- Send is rejected by Meta: turn the extras switch off for that template and ask Meta why.
- PDF link does not open: `FILE_LINK_SECRET` differs between API and worker.
- Razorpay webhook returns 401: the secret differs from `RAZORPAY_WEBHOOK_SECRET`.
- Pay now opens the wrong host: check `API_PUBLIC_URL`.

## When done

- [ ] Switch `WHATSAPP_DELIVERY` back to `log` and `RAZORPAY_MODE` to `sandbox` for local work.
- [ ] Delete the test webhook in the Razorpay test dashboard, or keep it for the next run.
