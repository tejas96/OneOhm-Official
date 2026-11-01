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

## 5b. Push notifications

1. Create the Expo project for each app (`eas init`).
2. Put the project ID in `EAS_PROJECT_ID` for the app builds.
3. Upload the Firebase service-account JSON with `eas credentials` (Android, FCM V1).
4. Add `google-services.json` through `GOOGLE_SERVICES_JSON`.
5. After the first builds, set `PUSH_DELIVERY=live` and restart the worker.


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
