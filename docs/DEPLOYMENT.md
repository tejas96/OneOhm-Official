# Deploying OneOhm on Oracle Cloud

OneOhm runs as one Docker Compose stack on a single VM:

- Caddy for HTTPS.
- The web app, the API and the worker.
- PostgreSQL 17, RustFS object storage and the Temporal server.

These are the same images used in development.

```
Internet ─▶ Caddy :443 ─┬─ /api/* ─▶ api:4200 ─┬─ postgres:5432
                        └─ /*     ─▶ web:3200  ├─ object-store:9000
                                    worker ─────┴─ temporal:7233
```

Only Caddy publishes ports (80 and 443). Everything else stays on the private Docker network.

## 1. Create the VM

1. In the OCI console, go to **Compute → Instances → Create instance**.
2. Pick the image and shape:
   - Image: **Ubuntu 24.04**.
   - Shape: **Ampere A1 (arm64)**. 4 OCPU / 24 GB fits the Always Free allowance and is plenty for OneOhm. Every image in the stack is multi-arch.
3. Boot volume: 100 GB or more. Add your SSH public key.
4. Open the ports in the VCN. Under **Networking → Virtual cloud networks → (your VCN) → Security lists → Default**, add these ingress rules:
   - TCP 80 from `0.0.0.0/0`
   - TCP 443 from `0.0.0.0/0`
5. Reserve a **public IP** for the instance.
6. Point your domain's DNS **A record** (for example `app.oneohm.in`) at that IP.

## 2. Prepare the server

Oracle's Ubuntu images ship iptables rules that reject new connections, so open 80 and 443 on the VM too:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Install Docker Engine and the Compose plugin:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker
```

## 3. Configure

```bash
sudo mkdir -p /opt/oneohm && sudo chown "$USER" /opt/oneohm
git clone https://github.com/tejas96/OneOhm-Official.git /opt/oneohm/app
cp /opt/oneohm/app/infrastructure/docker/production.env.example /opt/oneohm/.env
chmod 600 /opt/oneohm/.env
```

Fill in `/opt/oneohm/.env`:

- `ONEOHM_DOMAIN`.
- Strong passwords. Generate them with `openssl rand -base64 32`.
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` for the first Super Admin.
- The MSG91 and WhatsApp keys.

Use fresh keys for production. Do not reuse the test keys that were shared during development.

## 4. Start

```bash
cd /opt/oneohm/app
docker compose -f infrastructure/docker/compose.production.yaml --env-file /opt/oneohm/.env up -d --build
```

The first build takes about 10–15 minutes on Ampere. On start:

1. `migrate` applies the database migrations and the seed, then exits. The seed covers roles, the company profile and the first Super Admin.
2. `temporal-schema` and `temporal-namespace` prepare Temporal, then exit.
3. Caddy obtains the TLS certificate.

Then open `https://<your domain>` and sign in.

To update after new commits:

```bash
cd /opt/oneohm/app && git pull
docker compose -f infrastructure/docker/compose.production.yaml --env-file /opt/oneohm/.env up -d --build
```

## 5. WhatsApp templates

Business-initiated WhatsApp messages need templates approved in **WhatsApp Manager**.

1. Create these templates (category *Utility*, language *English*). The body parameters must be in this order:

   | Template name | Body parameters `{{1}}, {{2}}, …` |
   |---|---|
   | `quotation_sent` | customer, quotation number, total price, expected subsidy, effective cost |
   | `project_started` | customer, project code, capacity |
   | `project_milestone` | customer, project code, milestone |
   | `payment_received` | customer, amount, milestone, project code |
   | `payment_reminder` | customer, amount due, milestone, project code |
   | `staff_daily_digest` | name, overdue tasks, tasks due today, lead follow-ups |
   | `service_update` | customer, what the request is about, new status |
   | `change_request_raised` | customer, change requested (e.g. Consumer name change), request number |
   | `change_request_completed` | customer, change requested, request number |
   | `document_requested` | customer, document asked for (e.g. Latest electricity bill), project code |
   | `payment_link` | customer, amount, milestone, project code, payment link |

   The names, languages, field order and wording can be changed later in **Settings → WhatsApp messages**, so they can match exactly what Meta approved.

2. Once they are approved, set `WHATSAPP_DELIVERY=live` and restart the worker:

   ```bash
   docker compose -f infrastructure/docker/compose.production.yaml --env-file /opt/oneohm/.env up -d worker
   ```

Until then, messages are recorded in the outbox as "not sent (log mode)", so nothing reaches customers by accident.

3. For the WhatsApp assistant and delivery ticks:
   - In Meta's app settings, set the webhook to `https://<domain>/api/v1/webhooks/whatsapp`.
   - Use `WHATSAPP_WEBHOOK_VERIFY_TOKEN` as the verify token.
   - Subscribe to `messages`.
   - Put the app secret in `WHATSAPP_APP_SECRET`.

## 5a. Razorpay payment links

1. In the Razorpay dashboard, create API keys and a webhook:
   - **URL:** `https://<domain>/api/v1/webhooks/razorpay`.
   - **Secret:** a value you choose.
   - **Events:** `payment_link.paid`, `payment_link.partially_paid`, `payment_link.expired`, `payment_link.cancelled`, `settlement.processed`.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, then `RAZORPAY_MODE=live`, and restart the API.
3. Test once with Razorpay test keys before using live keys.

## 5c. SMS for customers not on WhatsApp

WhatsApp is the main channel. A customer can be set to **SMS** or **In person** on their
customer page (How we reach them). When WhatsApp rejects a number as "not on WhatsApp"
(error 131026), OneOhm switches that customer to SMS by itself and sends the same news by SMS.
**In person** sends nothing: the update appears under *Customers → to share in person*.

1. In MSG91, register a DLT transactional template with one variable, for example
   `OneOhm: ##message##`, and create a flow for it.
2. Set `SMS_DELIVERY=msg91` and `MSG91_SMS_TEMPLATE_ID` (the flow ID); `MSG91_AUTH_KEY`
   is the same key used for sign-in codes. Restart the worker.
3. SMS text is English for now; Marathi and Hindi SMS need their own DLT templates.

## 5d. RazorpayX payouts to vendors and crews

Approved bills can be sent straight to the payee's bank (Finance → Payables → Pay → Send
by bank). The bill is marked paid only when RazorpayX reports the payout processed, with
its UTR; the payout fee is booked as a bank charge. Sending needs the right to approve
payments. Vendors get their bank account on the vendor page; crews on the contractor page.

1. Switch RazorpayX on first: Razorpay dashboard → More → Banking+ → Get started (until
   then `x.razorpay.com` says "Access denied" and there is no account number). Live mode
   also needs Razorpay's KYC for Banking+.
2. In RazorpayX, copy the account number: My Account & Settings → Banking → Customer
   Identifier. Test and live modes have different numbers. In test mode, add a dummy
   balance with "+ Add test balance" before sending a test payout.
3. Add a RazorpayX webhook to `https://<domain>/api/v1/webhooks/razorpay` with the events
   `payout.processed`, `payout.reversed`, `payout.failed` (and `payout.updated` if offered).
   Use the same secret as the payment-link webhook, or set `RAZORPAYX_WEBHOOK_SECRET`.
4. Set `RAZORPAYX_ACCOUNT_NUMBER` and `RAZORPAYX_MODE=live`, restart the API, and send one
   small payout to your own account first. If a webhook is missed, OneOhm still asks
   RazorpayX about open payouts every 5 minutes.

## 5b. Push notifications

1. Create the Expo project for each app (`eas init`).
2. Put the project ID in `EAS_PROJECT_ID` for the app builds.
3. Upload the Firebase service-account JSON with `eas credentials` (Android, FCM V1).
4. Add `google-services.json` through `GOOGLE_SERVICES_JSON`.
5. After the first builds, set `PUSH_DELIVERY=live` and restart the worker.

## 5e. Website enquiry form

The company website can send its enquiry form straight into OneOhm. Each enquiry becomes a
lead with the source "Website". It gets an owner by rule: the sales person with the fewest
open leads. That owner gets an alert, and the follow-up is set for today. If an open lead
already has the same mobile number, OneOhm adds a note to that lead instead of making a
second one. No sign-in is needed.

```bash
curl -X POST https://<domain>/api/v1/public/leads \
  -H 'content-type: application/json' \
  -d '{"name":"Sunil Jadhav","phone":"9876543210","city":"Sangli",
       "message":"Need a quote for 3 kW","sourcePage":"/rooftop-solar"}'
# 202 {"received":true}
```

- Fields:
  - `name` (2–80 characters), required.
  - `phone`: a 10-digit Indian mobile, `+91` optional. Required.
  - `city`, required.
  - `message` (up to 1000 characters) and `sourcePage`: optional.
  - `website`: put this in a hidden field that people cannot see. Bots fill it in, and a filled one is quietly ignored.
- Rate limit: 5 enquiries per address every 10 minutes, and 3 per phone number a day. Over
  the limit, the answer is `429` with a polite message. The production compose file already
  sets `TRUST_PROXY=true`, so the limit counts each visitor's own address.
- Mistakes come back as `400` with `fieldErrors` per field.
- To post from the browser, add the website's origin to `CORS_ALLOWED_ORIGINS`, for example
  `https://www.oneohm.in`. A server-side form handler needs nothing extra.
- Every enquiry is also kept, exactly as it arrived, in the `website_enquiries` table.


## 6. Backups

Add a daily cron entry (`crontab -e`):

```
17 2 * * * cd /opt/oneohm/app && infrastructure/scripts/backup-postgres.sh >> /opt/oneohm/backup.log 2>&1
```

Copy `/opt/oneohm/backups` off the VM, for example to an OCI Object Storage bucket with `oci os object bulk-upload`. Also turn on scheduled **block volume backups** for the boot volume in the OCI console.

## 7. Operations

- Logs: `docker compose -f infrastructure/docker/compose.production.yaml logs -f api worker`
- Status: `docker compose -f infrastructure/docker/compose.production.yaml ps`
- The Temporal UI is not exposed publicly. When needed, run it temporarily and reach it over an SSH tunnel.

## 8. Release checks

Release happens only when the PRD section 13 acceptance criteria pass end to end. Run the
acceptance suite on a development machine (not on the server), from the repo root:

```bash
pnpm infra:up          # PostgreSQL and RustFS; Temporal is not needed
pnpm install
pnpm test:acceptance
```

What it does:

1. Builds the API and the packages it uses.
2. Drops and recreates the database `oneohm_acceptance` on the PostgreSQL server named in
   `.env` (`DATABASE_URL`: same host, user and password). It never touches any other
   database.
3. Applies the migrations and the day-one seed.
4. Starts a separate API on port 4300 from `apps/api/dist`, with `.env` plus test-safe
   settings: WhatsApp and SMS in log mode, local sign-in codes, Razorpay and RazorpayX in
   sandbox with known webhook secrets, no real gateway keys, and uploads in their own
   `oneohm-acceptance` bucket. The dev API on 4200 and the worker are left alone.
5. Runs one scenario per PRD row (`apps/api/test/acceptance/scenarios`) through the real
   HTTP API, signed in as the right people: admin and staff by password, field staff,
   crews, resellers and customers by sign-in code. Every record it makes carries "(test)".
6. Stops the API and prints a pass/fail table with one line per row. The command exits
   with 0 only when every automated row passes.

It needs Node 22.12 or later, pnpm, PostgreSQL and RustFS from `pnpm infra:up`, Chrome or
Chromium at `CHROMIUM_PATH` (for the PDFs), and port 4300 free. A full run takes about
two minutes.

Useful options:

- `pnpm test:acceptance 05-discom`: run one row.
- `--skip-build`: use the current `dist` folders.
- `--keep`, then `--reuse`: leave the API on 4300 running and rerun scenarios against it
  while writing them. `--stop` stops it.

Two parts are checked another way:

- **UX** is manual. Before release, run
  [UX-ACCEPTANCE-CHECKLIST.md](UX-ACCEPTANCE-CHECKLIST.md) with real OneOhm staff and
  keep the filled-in sheet.
- **Upload retry** belongs to the field app. Its unit tests
  (`apps/field/src/features/uploads/queue-logic.test.ts`) run with `pnpm test`.

The suite is not part of `pnpm check`, because it needs the database and a running API.
