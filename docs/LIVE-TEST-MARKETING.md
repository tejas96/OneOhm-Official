# Live test: Marketing (Meta and Google)

One live run of the marketing loop: connect, launch, lead, sale step sent back, spend read.
Spec: `docs/specs/2026-11-15-marketing.md`.

**The owner types every key, secret and password. Claude never does.**

## Part A. What you need to get (one list)

### Server settings (`.env`, same values for the API and the worker)

| Setting | Where it comes from | Needed for |
|---|---|---|
| `MARKETING_SECRET_KEY` | Make one: `openssl rand -base64 48` | Encrypting Meta and Google tokens (required in production) |
| `META_APP_ID`, `META_APP_SECRET` | developers.facebook.com → your app → App settings → Basic. Reusing the WhatsApp app is fine. | Connect Meta, webhook signatures |
| `META_LOGIN_CONFIG_ID` (optional) | App → Facebook Login for Business → Configurations → new configuration with the permissions below | One clean permission screen |
| `META_WEBHOOK_VERIFY_TOKEN` | You choose any long random text | Page and Instagram webhook check |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Already in `.env` | WhatsApp marketing templates, Conversions API dataset |
| `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` | console.cloud.google.com → APIs & Services → Credentials → OAuth client (Web application) | Connect Google |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | ads.google.com (a manager account) → Tools → API Center | Every Google Ads call |
| `GOOGLE_MAPS_SERVER_KEY` (or the existing `GOOGLE_MAPS_API_KEY`) | Cloud console → enable **Places API (New)** on the key | Finding the business and reading Google reviews |
| `API_PUBLIC_URL` | Your stable https address (a tunnel for the test) | Landing pages, photo links, callbacks |

### Meta app setup (once, by OneOhm)

- [ ] App type **Business**. Products: **Facebook Login for Business**, **Marketing API**, **Webhooks**, **Instagram** (Instagram API with Facebook Login), WhatsApp (already there).
- [ ] Facebook Login → Valid OAuth redirect URI: `<API_PUBLIC_URL>/v1/marketing/connect/meta/callback`.
- [ ] Webhooks → **Page**: subscribe `leadgen`, `messages`, `messaging_postbacks`, `messaging_referrals`, `feed`. **Instagram**: subscribe `messages`, `comments`. Callback `<API_PUBLIC_URL>/v1/webhooks/meta`, verify token = `META_WEBHOOK_VERIFY_TOKEN`.
- [ ] **App Review → Advanced Access** (needed before other businesses can use it; your own accounts work earlier, see Part B): `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `pages_manage_posts`, `pages_messaging`, `leads_retrieval`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_messages`, `instagram_manage_comments`, `whatsapp_business_management`.
- [ ] Feature **Ads Management Standard Access** (Marketing API rate limits for live use).
- [ ] **Business verification** of OneOhm's Meta business (Meta asks for it during App Review).

### Each business's own Meta side (done once by the business; OneOhm guides it)

- [ ] The ad account's currency is **INR** (OneOhm refuses others: budgets are in rupees). Same for Google.
- [ ] A Facebook Page and an Instagram professional account linked to it.
- [ ] An ad account with a payment method (prepaid funds or card). They pay Meta directly.
- [ ] The WhatsApp business number linked to the Page (Page settings → Linked accounts → WhatsApp), for Click-to-WhatsApp ads.
- [ ] Accept **Lead Ads terms** once: https://www.facebook.com/ads/leadgen/tos
- [ ] Accept **Custom Audience terms** once: https://business.facebook.com/ads/manage/customaudiences/tos.php
- [ ] Page settings → **Leads access**: OneOhm's app is allowed (it is by default unless the Page limited it).

### Google side

- [ ] Cloud project: enable **Google Ads API**. OAuth consent screen (External) with scope `https://www.googleapis.com/auth/adwords`. Add yourself as a test user. For other businesses later: Google **OAuth app verification** (sensitive scope).
- [ ] OAuth client redirect URI: `<API_PUBLIC_URL>/v1/marketing/connect/google/callback`.
- [ ] Developer token: starts at **Test access** (works only with Google Ads *test* accounts). Apply for **Basic access** (API Center → form, with a short design document of OneOhm Marketing) before real accounts and real spend.
- [ ] Each business: a Google Ads account with billing set up; accept the **lead form terms** in Google Ads once (first lead form); Customer Match lists need an account in good standing (if not, OneOhm says so quietly and ads still run).

### WhatsApp marketing messages

- [ ] In Marketing → Connections → WhatsApp messages, press **Send for approval** on the four messages. Meta approves in minutes to a day. They switch on by themselves once approved.

## Part B. Live test (we do this together)

Setup: `MARKETING_MODE=live`, a tunnel as `API_PUBLIC_URL`, API and worker restarted with the same `.env`. Before Meta App Review, your own Facebook user must have a role on the Meta app (admin, developer or tester); then everything below works with your own Page, Instagram and ad account. Remember: when the tunnel address changes, update **both** WhatsApp webhook overrides (phone number and WABA) and the Page/Instagram webhook URL.

1. [ ] Marketing → Connections → **Connect Meta**. Sign in, allow everything. Back in OneOhm: Meta shows **Connected** with your page and @instagram (or **In review** with the list Meta still has to approve). If several ad accounts: pick one.
2. [ ] **Connect Google** with a Google Ads test account (test developer token) or a real one (Basic access). Shows Connected or "Waiting for Google: developer token approval".
3. [ ] Connections → Google reviews → **Find my business** → pick it.
4. [ ] **New campaign** → WhatsApp chats → a photo → one line of text → Instagram + Facebook → Pune → ₹100 a day → **Launch**. Expect: each step ticks, "In review", the code (for example `SOLAR-01`). In Meta Ads Manager (just to check, not needed later): one campaign, paused objects switched on last, WhatsApp Status in placements (or the quiet note that it is not open yet).
5. [ ] After Meta approves: card shows **Live**. Tap the ad on your phone → WhatsApp opens → send the message. Expect: a lead on the Leads board with campaign, ad and click id; the owner gets "New ad lead · call now"; Today shows the waiting ad lead.
6. [ ] Lead form campaign → submit it from the Meta **Lead Ads Testing Tool** (developers.facebook.com/tools/lead-ads-testing). Expect the notice "Test lead received from Facebook — the connection works." (test leads never go on the board). Then fill the real form from your phone: a lead appears in seconds.
7. [ ] Comment on the post from another Instagram account, and send a DM. Expect: both in the chat inbox with the Instagram mark; one automatic reply asking for the number; send a number → lead made.
8. [ ] Move the WhatsApp-ad lead to **Survey scheduled**, then send a quotation, then win it. Within 15 minutes: Meta Events Manager → the dataset shows `QualifiedLead`, `InitiateCheckout`, `Purchase` with the value.
9. [ ] Google lead form: in Google Ads → the lead form asset → **Send test data**. Expect the notice "Test lead received from Google — the connection works."
10. [ ] Next hour: the card shows **Spent**; next day: cost per lead and cost per sale; Reports → Sales → By campaign shows ad spend and cost per sale.
11. [ ] Pause, then Run again; Stop. Ads Manager shows the same states.
12. [ ] WhatsApp campaign to own contacts (after the templates are approved): pick "Quoted but did not buy" → Launch → only the right people get it; someone who sent STOP does not.
13. [ ] Mark a test project **Operational** → that customer gets the Google review message (next morning run).

## Part C. Practice without accounts

`MARKETING_MODE=sandbox` (development only). Connect Meta and Google with one tap, launch, pause, stop, run again; the worker fills in practice spend. Nothing leaves OneOhm, and every screen says "Practice mode".
