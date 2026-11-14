# Vinod Burle — happy flow demo (one customer, start to end)

Made: 2026-11-14. For the customer call. One person drives: **OneOhm Admin** on the web.
Vinod is NOT in the system yet. This is a clean start.

## 0. Before the call (2 min)

| What | Value |
|---|---|
| Web app | http://localhost:3200 (already signed in as OneOhm Admin) |
| Admin login (if asked) | `admin@oneohm.local` / `OneOhm@2026` |
| Customer app | http://localhost:8092 |
| Field app | http://localhost:8083 |
| Business WhatsApp | +91 98227 59598 |
| Any OTP code | `123456` |
| Razorpay test UPI | `success@razorpay` (test mode, no real money) |

Running now: web 3200, API 4200, worker 7299 (sends WhatsApp), tunnel, field 8083, customer 8092.

**Do this first:** from Vinod's phone, send `Hi` to +91 98227 59598. This opens the 24-hour WhatsApp window. Then every message reaches him.

WhatsApp is LIVE. Vinod's phone gets real messages.

## Test data

### Customer
| Field | Value |
|---|---|
| Name | Vinod Burle |
| Mobile / WhatsApp | +91 9XXXX XXX44 (Vinod, test customer) (+91 9XXXX XXX44 (Vinod, test customer)) |
| City | Pune |
| Type | Home (Residential) |
| Size | 3 kW |
| Next follow-up | Today, 11:00, "Call to collect electricity bill" |
| Notes | Walk-in at Kothrud office |

### Site
| Field | Value |
|---|---|
| Site name | Burle Residence |
| Address | Flat 4, Shree Apartments, Karve Road, Kothrud |
| City / District | Pune / Pune |
| State | Maharashtra |
| PIN | 411038 |
| Floors | 2 |
| Roof | RCC |
| DISCOM | MSEDCL |
| Consumer number | 170012345678 |
| Consumer name on bill | Ramesh Burle (his father — this is why we need a DISCOM change) |
| Sanctioned load | 5 kW |
| Supply | Single phase |

### Quote
| Field | Value |
|---|---|
| System | 3 kW, On-grid |
| Panel | Mono PERC module 545 Wp (DCR) |
| Inverter | On-grid inverter 3 kW |
| Distance | 8 km |
| Subsidy (PM Surya Ghar) | ₹78,000 (auto) |
| Discount | ₹5,000 |

### Project
| Field | Value |
|---|---|
| DISCOM | MSEDCL |
| Project manager | Amit Kulkarni (demo) |
| Contractor | Shivshakti Solar Installers (demo) |
| Loan | No |

### DISCOM change request
| Field | Value |
|---|---|
| Change | Consumer name change |
| New consumer name | Vinod Ramesh Burle |
| DISCOM application number | MSEDCL/NC/2026/48213 |
| Net meter application number | MSEDCL/NM/2026/77105 |
| DISCOM office | Kothrud Sub-division |

### Service
| Field | Value |
|---|---|
| Complaint | Inverter shows error E21 |

---

## The flow (do in this order)

### Step 1 — Add the lead
1. Sidebar → **Leads** → **New lead**.
2. Type the customer data above. Save.
3. Show: stage **New**, owner, follow-up for today.

### Step 2 — Log a call
1. On Vinod → **Log a follow-up**.
2. How: **Call**. What happened: "Spoke. He will send bill on WhatsApp." Next: tomorrow 10:00.
3. Show: history has the call.

### Step 3 — Book the site survey
1. Vinod lead → Visit card → book **tomorrow 11:30** → **Book and tell the customer**.
2. Show: stage **Survey booked**. Vinod's phone gets the WhatsApp.

### Step 4 — Convert to customer
1. Lead → **Convert to customer** → **A person** → new site.
2. Type the site data above.
3. Show: customer page with the site.

### Step 5 — Quotation
1. **Create quotation**. Type the quote data above.
2. Show: total, subsidy ₹78,000, "customer pays".
3. Discount ₹5,000. If it says **Save for approval**: save, then Today → **Waiting for my approval** → **Approve**.
4. Quote → **Send**.
5. Show: Vinod's phone gets the quote PDF + **Accept quote** button.

### Step 6 — Customer accepts on WhatsApp
1. Vinod's phone: tap **Accept quote** → **Yes, accept**.
2. Show (web): lead is **Won**. Bell alert "accepted … start the project".

### Step 7 — Create the project
1. Bell → the alert → **Create project**.
2. Type the project data above.
3. Show: project **OH-2026-xxx**. Tabs: Overview, Tasks, Payments, Material, Documents, Reports, Activity.
4. Show the stages in Tasks: Survey → Design → Net metering → Material → Installation → Commissioning → Subsidy.
5. Vinod's phone gets "project started" + **Pay now** for the advance.

### Step 8 — Advance payment (Razorpay test)
1. Vinod's phone: **Pay now** → **Continue to pay** → UPI `success@razorpay`.
2. Show: phone gets receipt PDF. Web: Project → Payments → advance **Paid**.

### Step 9 — DISCOM change request (name change)
1. Sidebar → **DISCOM** → **Raise change request**.
2. Customer: Vinod Burle. Site: Burle Residence. Project: link it.
3. Change: **Consumer name change**. New consumer name: `Vinod Ramesh Burle`. **Raise request**.
4. If it says "Add the missing papers to the customer first": upload any PDF as the asked paper on the customer, then raise again.
5. Show: "Change request CR-2026-xxxx raised". 3 DISCOM steps made. Net metering work waits until it is done.
6. Open the request. Step 1 "Collect documents" → done.
7. Step 2 "Submit on DISCOM portal" → done, application number `MSEDCL/NC/2026/48213`.
8. Step 3 "DISCOM approves" → shows on **Waiting on DISCOM** tab with age in days.
9. **Follow up** → office `Kothrud Sub-division`, next follow-up in 3 days, note "Called JE, file under review". Save.
10. Mark step 3 done. Show: site consumer name is now Vinod Ramesh Burle.

### Step 10 — Net metering (DISCOM)
1. Project → Tasks → **Apply for net metering on the MSEDCL portal** → complete, ref `MSEDCL/NM/2026/77105`.
2. **MSEDCL sanction for net metering** → waits on DISCOM → complete.

### Step 11 — Material and installation (fast)
1. Project → Material → dispatch to site (if asked to demo stock).
2. Installation tasks: structure → panels → inverter → earthing → **Installation check and sign-off**. Complete each.
3. Optional field app: http://localhost:8083 → crew `7000000402` (Dattatray More) → code `123456` → Work tab → task → photo → complete.

### Step 12 — Commissioning and net meter
1. **Electrical Inspector approval** → complete.
2. **Testing and commissioning** → complete.
3. **Generation meter test with MSEDCL** → **DISCOM inspection** → **Net meter installed** → complete each.
4. **Customer handover and warranty documents** → complete.

### Step 13 — Subsidy
1. **Apply on the PM Surya Ghar portal** → complete.
2. **Subsidy inspection approved on the portal** → complete.
3. **Subsidy released to customer** → complete.

### Step 14 — Last payments
1. Project → Payments → next milestone → **Record payment** (Cash) or send **Pay now** again to Vinod.
2. Finance → Invoices → issue tax invoice.

### Step 15 — Customer app (Vinod's view)
1. http://localhost:8092 → `+91 9XXXX XXX44 (Vinod, test customer)` → code `123456`.
2. Show: Home journey card, Payments with receipts, Documents with quote PDF.
3. Help → **Ask for help** → "Inverter shows error E21".

### Step 16 — Service
1. Web → **Service** → Requests → Vinod's request → assign Sanjay Pawar (demo).
2. Mark done. Vinod gets WhatsApp + rating buttons.

## Short version (if time is short)
Steps 1 → 4 → 5 → 6 → 7 → 8 → 9 → 15. About 15 minutes.

## After the call
Tell Claude "clean up Vinod". Claude lists every record made for Vinod. You confirm. Claude deletes only those.
