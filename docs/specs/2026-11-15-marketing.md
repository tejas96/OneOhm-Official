# Marketing module — spec (2026-11-15)

Status: built on branch `feat/marketing` (not committed). Reviewed (Opus) for money, webhooks, tokens and data sent out; all findings fixed. Live-test steps and the credential list: `docs/LIVE-TEST-MARKETING.md`.

## 1. Goal

A solar business runs all its marketing from OneOhm and never opens Meta or Google. Ads, posts,
leads and sales form one loop. Nobody types a source, a status or a cost by hand.

The user is not a marketer. Plain words only: "cost per sale", not "CPA".

## 2. What the user sees

One menu item, **Marketing** (Sales group), with three parts.

| Part | What it does |
|---|---|
| **Campaigns** (home) | One card per campaign: status, spent, leads, sales, cost per sale. Pause, Stop, Run again in one tap. Also cards for Refer and earn and for poster codes. Alerts on top (ad with no leads, low ad balance, Meta needs reconnect). |
| **New campaign** | One screen: goal → photo or video + text → where → city and daily budget → Launch. |
| **Connections** | Connect Meta once, connect Google once. Shows connected, in review, not connected, needs attention. Also the WhatsApp marketing messages and the Google review link. |

### New campaign (one screen)

1. **Goal**: `WhatsApp chats` (default) · `Lead form` · `Post only`.
2. **Photo or video** + **text** (one box). The first line becomes the headline.
3. **Where**: Instagram, Facebook, Google, WhatsApp message to own contacts. Defaults: Instagram + Facebook. Google only for chats and lead form. For `Post only`: Instagram, Facebook.
4. **City** and **daily budget**, pre-filled from the last campaign, else from Marketing defaults (the most common lead city, ₹500 a day).
5. **When** (posts only): now, or on a set day and time.
6. **Launch**. A short animation shows each step (photo sent, ad made, sent for review). Each place gets its own result. A place that fails says why in plain words, with Try again.

WhatsApp message to own contacts: pick who gets it (people who were quoted but did not buy · lost leads due a revisit · past customers). The count excludes people who sent STOP.

### Automatic choices (no questions)

| Choice | Rule |
|---|---|
| Campaign code | Made from the first words of the text + 2 digits, unique (for example `SOLAR-26`). Saved in `lead_campaigns`, so leads, reports and the WhatsApp opener "Hi OneOhm SOLAR-26" all work. |
| Budget split | Meta and Google share the daily budget equally. Minimum ₹100 a day per place. |
| Targeting | City + 25 km radius (Meta), city location (Google). Meta Advantage+ audience and Google Performance Max do the rest. Our lists go in as suggestions and exclusions (section 5). |
| WhatsApp Status | Meta ads always ask for Instagram Stories + WhatsApp Status as well (Meta allows `status` only with Instagram `story`, single image or single video). If Meta refuses the placement, we retry once without WhatsApp and note it quietly. |
| Safety | Every Meta and Google object is made PAUSED and set ACTIVE only as the last step. A half-made campaign never spends. Retrying finds objects by the campaign code first, so a retry never doubles. |
| Landing page | Google ads need a web page. Each campaign gets `API_PUBLIC_URL/v1/go/<code>`: photo, text, a WhatsApp button and a call-back form. It saves `gclid` / `fbclid` / UTM. |

## 3. Statuses in plain words

`Starting` → `In review` (Meta or Google is checking the ad) → `Live` → `Paused` / `Stopped`. Posts: `Scheduled for 20 Nov`, `Posted`. Problems: `Needs attention` with the reason.

Pause pauses every place. Stop pauses every place for good. Run again on a paused campaign resumes it; on a stopped or posted one it makes a copy with a new code and launches it.

## 4. The automatic loop

| Event | What happens |
|---|---|
| Click-to-WhatsApp ad chat | Existing WhatsApp webhook. The `referral.source_id` (ad id) maps to our campaign; `ctwa_clid` is saved. The lead gets campaign, ad and click id. |
| Meta lead form | Meta webhook `leadgen` → read the lead with the page token → lead with owner by rule, campaign, ad, Meta lead id. |
| Google lead form | Google webhook (key we made per form) → lead with `gclid` (`gcl_id`), campaign. |
| Landing page | Call-back form → website lead with `gclid` / `fbclid`. WhatsApp button carries the code. |
| Instagram / Facebook DM or comment | Goes into the existing chat inbox (channel `instagram` or `messenger`). We answer once, asking for their number and city. When they send a phone number, the lead is made (owner by rule, campaign and ad from the ad referral). |
| New ad lead | The owner gets an alert "New ad lead · call now" (push). Today shows ad leads still waiting for a first call. |
| Stage moves | Every 15 minutes the worker finds attributed leads that reached survey, quoted, advance paid or won, and sends each once: Meta Conversions API and Google offline click conversions, with deal value in INR. |
| Spend | Every hour: spend per campaign and ad per day, from Meta and Google, into `marketing_spend_days`. |
| Audiences | Every day: interested-but-not-bought (retarget), won customers (exclude and seed). Meta: custom audiences + a 1% lookalike once 100 customers. Google: Customer Match lists as Performance Max signals. Phones hashed with SHA-256. |
| Reviews | Every day: projects that became operational get one WhatsApp "please rate us on Google" message. New Google reviews show in Marketing. |
| Alerts | Ad spent money for 2 days with no leads. Ad balance low (prepaid accounts), with a top-up link. Meta token near expiry. |

### Conversion events

| Our event | Meta (CTWA, `business_messaging`) | Meta (lead form, `system_generated` + `lead_id`) | Meta (landing, `fbc`) | Google conversion action |
|---|---|---|---|---|
| survey | `QualifiedLead` | `Survey booked` | `Schedule` | OneOhm · Survey booked |
| quoted | `InitiateCheckout` | `Quoted` | `InitiateCheckout` | OneOhm · Quoted |
| advance_paid | `OrderCreated` | `Advance paid` | `AddPaymentInfo` | OneOhm · Advance paid |
| won | `Purchase` | `Won` | `Purchase` | OneOhm · Won |

Value: the accepted quotation total (advance: the paid advance). Currency INR. Each (lead, event, platform) is sent once (unique row).

## 5. Data

New tables (`packages/database/src/schema/marketing*.schema.ts`):

| Table | Holds |
|---|---|
| `marketing_connections` | One row per platform: status, account ids, encrypted tokens (AES-256-GCM), non-secret details, last error. |
| `marketing_media` | Campaign photos and videos in object storage. |
| `marketing_campaigns` | Goal, text, media, channels, city, budget, status, code (→ `lead_campaigns`). |
| `marketing_placements` | One row per campaign per platform: external ids, status, error. |
| `marketing_ads` | External ad id → campaign (maps webhooks and spend). |
| `marketing_spend_days` | Spend, impressions, clicks per platform, ad and day. |
| `marketing_conversions` | One row per lead, event, platform: pending / sent / skipped / failed. |
| `marketing_audiences`, `marketing_audience_members` | List ids and the hashes already sent (only changes are sent). |
| `marketing_messages` | WhatsApp campaign recipients and their outbox rows. |
| `marketing_clicks` | Landing page visits with click ids. |
| `marketing_reviews`, `marketing_review_requests` | Google reviews and who was asked. |
| `marketing_events` | Webhook event keys, so a repeat delivery is ignored. |
| `marketing_jobs` | When each worker job last ran. |

Changes: `leads` gains `gclid`, `fbclid`, `ctwa_clid`, `platform_lead_id` (unique). `lead_source` gains `facebook`, `instagram`, `google`. `wa_conversations` gains `channel` (`whatsapp` default, `instagram`, `messenger`); social chats keep their handle in `phone` as `ig:<id>` / `fb:<id>`. `outbox_channel` gains `instagram`, `messenger`. New capability `marketing.manage` (Marketing role and anyone with `settings.manage`).

## 6. Code shape

- `packages/marketing`: provider interfaces (`AdPlatform`, `LeadSource`), Meta and Google clients over `fetch` (injectable for tests), a sandbox platform, hashing, token encryption. A call-tracking provider or another ad platform adds one file that implements the interface.
- `apps/api/src/modules/marketing`: connections (OAuth), media, campaigns (launch, pause, stop, run again), webhooks (Meta, Google), landing page, numbers for the lead card, Today and the sales report.
- `apps/worker`: `marketingSyncWorkflow` every 15 minutes (conversions, due posts, ad review status), with hourly (spend, balance) and daily (audiences, reviews, alerts) parts.
- `apps/web/src/features/marketing`: the three parts.

## 7. Safety

- Webhooks: Meta posts need `X-Hub-Signature-256` (app secret). Google lead posts need the `google_key` we generated for that form. Each event key is stored once; a repeat is answered 200 and ignored.
- Tokens: encrypted with `MARKETING_SECRET_KEY` (required in production).
- Personal data: phone and email are normalised and SHA-256 hashed before they leave (Meta: digits with country code; Google: E.164 with `+`). Names are not sent.
- Money: OneOhm never holds ad money. Budgets, pause and stop only.
- Modes: `MARKETING_MODE=live` talks to Meta and Google (needs keys; without them the UI says "not connected"). `sandbox` is a local practice platform for development only; the UI says "Practice mode" on every screen. Production refuses sandbox.

## 8. Moved out of Settings

| Was in Settings | Now |
|---|---|
| Ad and campaign codes | Made per campaign. Old codes show as poster-code cards in Marketing (on/off, rename, new). |
| Refer and earn | A card in Marketing; opens the same settings. |
| Marketing WhatsApp messages | In Marketing → Connections → WhatsApp messages. Settings → Messages keeps the service messages. |

## 9. Decisions made while building (simpler or safer for the user)

| Decision | Why |
|---|---|
| An Instagram or Facebook message becomes a lead only once the person sends a phone number. Until then it is a chat in the inbox; we ask for the number once, automatically. | A lead with no number cannot be called. The board stays clean, and nothing is lost: the chat is in the inbox with an owner. |
| Ad accounts must be in rupees (INR). Another currency is refused at connect and at launch. | Budgets are stored in paise; a USD account would spend 83× the budget. |
| Google ads and WhatsApp offers need a photo; videos run on Instagram and Facebook. | Google Performance Max needs image assets; the WhatsApp offers are approved with a photo on top. |
| A WhatsApp-only campaign with nobody in the chosen lists is refused before launch. | It would look "live" while doing nothing. |
| Test leads (Meta testing tool, Google "send test data") give a notice "Test lead received — the connection works", not a lead. | Proves the connection without fake leads on the board. |
| Every Meta/Google object is made paused and switched on last; a failed switch-on pauses the campaign again; Stop and Pause use any saved id. | A half-made or failed campaign never spends money unseen. |
| Practice connections (sandbox) are marked and never count in live mode. | Their keys are public; live mode must not trust them. |
| Lists: people who sent STOP are left out; Google lists keep members 30 days and are re-sent every 25 days. | Respect opt-out; lists heal if an upload fails. |
| Review asks go only to projects that became operational in the last 14 days. | Old customers are never messaged on day one. |
| The inbox "can reply" rule for Instagram/Facebook: a DM within 24 h, or one private reply to a comment within 7 days. | Meta's own rules; the reply box says why when it is closed. |

## 10. Not built (on purpose)

Photo or video editor, manual audience builder, A/B tests, extra chart pages, phone-call tracking (the `LeadSource` interface is ready for it), WhatsApp message cost (Meta bills the WhatsApp account).
