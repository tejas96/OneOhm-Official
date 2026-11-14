# OneOhm — full walkthrough (QA run and client demo script)

Started: 2026-11-14. Use this file twice:
1. **Now:** QA run. You do each step. Claude checks logs and the database and marks the result.
2. **Later:** client demo. Do the same steps in the same order.

How each step works:
- You do the step and tell Claude **Done** or **Change required / error**.
- Claude checks the result (database, API log, worker log, WhatsApp delivery) and writes it in the **Run log** at the end.
- A bug is fixed at once, before the next step.

---

## 0. Before you start

### 0.1 What runs where

| Part | Address | Who uses it |
|---|---|---|
| Web app (office) | http://localhost:3200 | Owner, admin, office staff |
| Field app (Expo in browser) | http://localhost:8083 | Sales, crews, resellers, all staff on site |
| Customer app (Expo in browser) | http://localhost:8092 | Customers |
| API | http://localhost:4200 | Apps call it |
| Public tunnel to API | https://mistress-mood-scanner-zip.trycloudflare.com | Meta and Razorpay webhooks, Pay now links |

The tunnel address changes if `cloudflared` restarts. Then Claude must set both webhooks again.

### 0.2 Business WhatsApp number

**+91 98227 59598** (One Ohm Pvt Ltd). Customers send WhatsApp messages to this number.

Tip: before a customer test, send "Hi" from that customer's phone. This opens the 24-hour chat window. Inside the window every message goes, even if its Meta template is off.

### 0.3 Sign-in rules

| App | How to sign in |
|---|---|
| Web | Email, employee ID or mobile + password |
| Web, first time | "First time here, or forgot your password?" → mobile → code **123456** → new password |
| Field app | Mobile number → code **123456** |
| Customer app | Mobile number → code **123456** |

New staff get no password. Each one sets it with code 123456.
Test password for every new staff member: **Demo@2026**

### 0.4 Owner login (exists already)

| Name | Sign in | Password |
|---|---|---|
| OneOhm Admin (Super Admin) | admin@oneohm.local | OneOhm@2026 |

The owner has no mobile number. So the owner uses only the web app.

### 0.5 Real WhatsApp customers (only these 3 get real messages)

| Name | Mobile | Use in this run |
|---|---|---|
| Vinod Burle | +91 9XXXX XXX44 (Vinod, test customer) | Main journey: lead → quote → project → payment → customer app |
| Shreya Patil | +91 9XXXX XXX54 (Shreya, test customer) | WhatsApp self-onboarding (she writes first to the business number) |
| Tejas Patil | +91 80878 23247 | Already a lead from an old test. Duplicate check, then family member of Vinod |

### 0.6 New employees you will add (all phones are fake, no messages go to them)

| # | Full name | Mobile | Email | Employee ID | Designation | Role |
|---|---|---|---|---|---|---|
| E1 | Anjali Deshmukh | 90000 01101 | anjali.sales@oneohm.test | EMP-101 | Sales Executive | Sales |
| E2 | Rakesh Jadhav | 90000 01102 | rakesh.pm@oneohm.test | EMP-102 | Project Manager | Execution |
| E3 | Pallavi Kulkarni | 90000 01103 | pallavi.accounts@oneohm.test | EMP-103 | Accountant | Accounts |
| E4 | Nitin Pawar | 90000 01104 | nitin.liaison@oneohm.test | EMP-104 | Liaison Officer | Liaisoning |
| E5 | Kiran Shinde | 90000 01105 | kiran.store@oneohm.test | EMP-105 | Store Keeper | Store |
| E6 | Manoj Bhosale | 90000 01106 | manoj.purchase@oneohm.test | EMP-106 | Purchase Officer | Procurement |
| E7 | Swapnil Kadam | 90000 01107 | swapnil.dispatch@oneohm.test | EMP-107 | Dispatch Lead | Dispatch |
| E8 | Sneha Joshi | 90000 01108 | sneha.hr@oneohm.test | EMP-108 | HR Manager | HR |
| E9 | Vaibhav More | 90000 01109 | vaibhav.service@oneohm.test | EMP-109 | Service Engineer | Service |
| E10 | Priyanka Sawant | 90000 01110 | priyanka.mkt@oneohm.test | EMP-110 | Marketing Executive | Marketing |
| E11 | Ajay Chavan | 90000 01111 | ajay.loan@oneohm.test | EMP-111 | Loan Coordinator | Loan |
| E12 | Rohan Gokhale | 90000 01112 | rohan.admin@oneohm.test | EMP-112 | Office Admin | Admin |
| E13 | Ganesh Thorat | 90000 01113 | ganesh.reseller@oneohm.test | (blank) | Solar Promoter | Reseller / Promoter |
| E14 | Suresh Gaikwad | 90000 01114 | (blank) | (blank) | Crew Lead | I&C partner |

### 0.7 Other test data

**Contractor (for crew E14):**
| Field | Value |
|---|---|
| Type | Company |
| Name | Sai Solar Installers |
| Contact person | Suresh Gaikwad |
| Mobile | 90000 01114 |
| Email | sai.installers@oneohm.test |
| GSTIN | 27ABCDE1234F1Z5 |
| PAN | ABCDE1234F |
| Address | Plot 12, MIDC Bhosari, Pune 411026 |
| Account name | Sai Solar Installers |
| Account number | 50100123456789 |
| IFSC | HDFC0001234 |
| Pay within (days) | 15 |
| TDS % | 1 |
| Retention % / days | 5 / 90 |
| Service areas | Pune, Pimpri-Chinchwad |
| Kinds of work (skills) | Tick "I&C partner" |

**Vinod's site:**
| Field | Value |
|---|---|
| Site name | Burle Residence |
| Address | Flat 4, Shree Apartments, Karve Road, Kothrud |
| City | Pune |
| District | Pune |
| State | Maharashtra |
| PIN | 411038 |
| Floors | 2 |
| DISCOM | MSEDCL |
| Consumer number | 170012345678 |
| Sanctioned load | 5 kW |
| Supply | Single phase |

**Extra leads with fake numbers (no WhatsApp):**
| Name | Mobile | City | Use |
|---|---|---|---|
| Ramesh Kale | 90000 02201 | Nashik | Lost and reopen test |
| Sunita Jagtap | 90000 02202 | Satara | Reseller's own lead |
| Green Park Housing Society | 90000 02203 | Pune | Marketing lead, society type |

**Vendor (for purchase order):**
| Field | Value |
|---|---|
| Name | Sunrise Solar Distributors |
| GSTIN | 27AAACS1234K1Z2 |
| PAN | AAACS1234K |
| Phone | 90000 03301 |
| Payment terms | 30 days |
| Bank | Sunrise Solar Distributors / 912010012345678 / UTIB0000123 |

**Razorpay test payment:** UPI ID **success@razorpay** (test mode, no real money).

---

## Phase 1 — Owner first look (web)

| Step | Do this | You should see | Claude checks |
|---|---|---|---|
| 1.1 | Open http://localhost:3200 | Sign-in page with "GOOD MORNING" sky | — |
| 1.2 | Type `admin@oneohm.local` and `OneOhm@2026`. Click **Sign in** | Command centre opens | Sign-in row in audit log |
| 1.3 | Look at the left sidebar. Read each item name | Today, Command centre, Visits, Leads, Quotations, Customers, Projects, DISCOM, Contractors, Inventory, Finance, Service, Team, Reports, Settings, My rewards | — |
| 1.4 | Click the **bell** (alerts). Then click **Mark all read** | Alert list, then unread count 0 | Notifications marked read |
| 1.5 | Press **⌘K**. Type `Pune` | Search results by type | Search API 200 |
| 1.6 | Click the **theme switch** two times | Dark, then light | — |
| 1.7 | Command centre: change the period filter to **This financial year**. Then click **Clear** | Numbers change, then reset | — |
| 1.8 | Read each panel: Needs you today, Business health, Sales pipeline, Money, Team | Panels show demo data | — |

## Phase 2 — Settings tour (look, note, change and check effect)

Rule: Claude saves the old value before each change. After the effect check, put the old value back.

| Step | Settings tab | Do this | Effect to check |
|---|---|---|---|
| 2.1 | Company | Read all fields. Check logo, signature, stamp. Change **Quotations valid for** from current value to **20** | New quote later shows valid-until = 20 days (checked in 7.x). Put back after |
| 2.2 | Roles & permissions | Open the grid. Open **Sales** role. Read its permissions. Do not change yet | — |
| 2.3 | Points and rewards | Read points per event | Used in 13.x |
| 2.4 | Working time & holidays | Add holiday: **2026-11-20, "QA Holiday"**. Save | Visit slots on 20 Nov disappear (checked in 6.x). Remove after |
| 2.5 | Visits & bookings | Read visit length and start times. Change visit length to **60** | Slots offered become 60 min apart. Put back after |
| 2.6 | Leave and attendance | Read leave kinds (casual 12, sick 6), grace minutes, location rules, skills | Used in 13.x |
| 2.7 | Lead stages | Add a step inside **Contacted**: "Bill collected". Save | "Move to stage" list shows it (5.x) |
| 2.8 | Lead assignment | Read strategy. Set **City owners**: Anjali Deshmukh → `Pune` (after Phase 3) | New Pune lead goes to Anjali (6.x) |
| 2.9 | Ad and campaign codes | Add code **DIWALI26**, name "Diwali 2026 campaign" | Shreya's "Hi OneOhm DIWALI26" lead gets the campaign (6.x) |
| 2.10 | WhatsApp onboarding | Read: on, cities, bill bands, price per unit, units per kW, nudge hours | Used in 6.x |
| 2.11 | Refer and earn | Read the reward rule | Used in 11.x |
| 2.12 | Products | Read panels and inverters. Note one DCR panel name | Used in 7.x |
| 2.13 | Rate card | Read 4 sub-tabs. Note **discount approval threshold** | Used in 7.x |
| 2.14 | Payment terms | Read the default plan (25 / 65 / 10). Read RazorpayX status card | Milestones in 8.x |
| 2.15 | Approvals | Read the limits | Used in 9.x |
| 2.16 | Project types | Switch **Commercial ground mount** off. Save | Builder refuses it (7.x). Put back after |
| 2.17 | Task templates | Read the list by stage. (Adding a new one is Phase 12) | — |
| 2.18 | Required documents | Read the list | Project documents checklist (8.x) |
| 2.19 | DISCOMs and subsidy | Read DISCOMs, subsidy slabs for Homes | Subsidy in quote (7.x) |
| 2.20 | Task assignment | Read strategy | 8.x |
| 2.21 | WhatsApp messages | Read the list. Open **quotation_sent**. Read switches | 7.x |
| 2.22 | Reminders | Read payment grace days, digest times | 15.x |
| 2.23 | Late and due-soon | Read escalation days | 15.x |
| 2.24 | Service and SLAs, Warranty, AMC plans | Read each | 11.x |
| 2.25 | Automation runs | Read jobs list. Look for failures | — |
| 2.26 | Activity log | Find your sign-in from step 1.2 | — |

## Phase 3 — Team: add employees (owner, web)

| Step | Do this | You should see | Claude checks |
|---|---|---|---|
| 3.1 | Sidebar → **Team** → tab **People** | List of current people | — |
| 3.2 | Click **Add person**. Type E1 data from table 0.6. Tick role **Sales**. Save | Anjali in the list with badge "Invited, not signed in yet" | User row, role, invite outbox |
| 3.3 | On Anjali's row, click **Copy** (invite text). Paste it in a note | Invite text with web link | — |
| 3.4 | Try **Add person** again with mobile **90000 01101** | Error: number already used | No duplicate row |
| 3.5 | Add E2 to E12 the same way, one by one | Each in the list | One row per person |
| 3.6 | Sidebar → **Contractors** → **Add contractor**. Type the contractor data (0.7). Save | Sai Solar Installers card | Contractor row |
| 3.7 | Team → Add person E14 (Suresh). Role **I&C partner** | Suresh in list | — |
| 3.8 | Contractors → Sai Solar Installers → Crew → add **Suresh Gaikwad**, make him Lead | Suresh is crew lead | Contractor member row |
| 3.9 | Team → Add person E13 (Ganesh). Role **Reseller / Promoter** | Ganesh in list | — |
| 3.10 | Open Anjali → **Edit**. Read skills, open-task limit, location tracking, On leave | Edit sheet | — |
| 3.11 | Settings → Lead assignment → City owners: Anjali → `Pune`. Save | Saved | Setting row |

## Phase 4 — First sign-in for employees

| Step | Do this | You should see | Claude checks |
|---|---|---|---|
| 4.1 | Web: sign out the owner (account menu → Sign out) | Sign-in page | Session revoked |
| 4.2 | Click **First time here, or forgot your password?** Type **9000001101** | Code step | OTP row |
| 4.3 | Type code **123456**. New password **Demo@2026**. Click **Save and sign in** | Anjali's Today page. Sidebar: Visits, Leads, Quotations, Customers, Service | Password set, sign-in audit |
| 4.4 | Sign out. Sign in again with **EMP-101** and **Demo@2026** | Signed in (employee ID works) | — |
| 4.5 | Field app: open http://localhost:8083. Type **9000001101**. Click **Text me a code**. Type **123456** | Today screen. Tabs: Today, Leads, Quote, Leave, Me | Session row |
| 4.6 | Field app: tap **Me**. Read roles, mobile, Appearance | Profile | — |
| 4.7 | Field app: try a wrong number **9000009999** → code 123456 | "That code is not right or has expired" | No session |

## Phase 5 — Leads and sales activity

| Step | Who / where | Do this | You should see | Claude checks |
|---|---|---|---|---|
| 5.1 | Anjali, field app | Tap **Leads** → **New lead**. Name **Vinod Burle**, mobile **+91 9XXXX XXX44 (Vinod, test customer)**, city **Pune**, Home, 3 kW, follow-up **Today**, time **11:00**, next "Call to collect electricity bill", notes "Walk-in at Kothrud office". Save | Lead opens, stage New | Lead row, owner Anjali, source employee |
| 5.2 | Anjali, field app | New lead with mobile **8087823247** (Tejas) | "This person is already an open lead." + **Open that lead** | No new row |
| 5.3 | Anjali, field app | Open Vinod → **Log a follow-up**. How: Call. What happened: "Spoke. He will send bill on WhatsApp." Next: Tomorrow 10:00 | History shows the call | Activity row |
| 5.4 | Anjali, field app | On Vinod: tap **Call** and **WhatsApp** | Dialer link; in-app chat opens | — |
| 5.5 | Anjali, web | Leads → Vinod → **Move to stage** → Contacted → "Bill collected" | Stage changes | Stage change row |
| 5.6 | Anjali, web | New lead **Ramesh Kale**, 9000002201, Nashik. Then **Mark as lost**, reason **Price too high**, revisit in 30 days | Lead lost | Lost reason saved |
| 5.7 | Anjali, web | On Ramesh: **Reopen lead** | Back to Contacted, follow-up today | — |
| 5.8 | Priyanka (Marketing), field app | Sign in 9000001110 / 123456. New lead **Green Park Housing Society**, 9000002203, Pune, Housing society | No Quote tab. Lead saved | Lead goes to Anjali (city owner Pune) |
| 5.9 | Owner, web | Leads → filters: Open, Follow-up due, No owner, New, Won, Lost | Lists change | — |

## Phase 6 — WhatsApp: customer writes first, visit booking

| Step | Who | Do this | You should see | Claude checks |
|---|---|---|---|---|
| 6.1 | Shreya's phone | Send **Hi OneOhm DIWALI26** to +91 98227 59598 | Bot asks language | Inbound webhook hit, chat row |
| 6.2 | Shreya's phone | Answer each bot question: English, name "Shreya Patil", city Pune, Home, bill ₹2,000–3,000, roof RCC, floors 1, send any bill photo | Estimate PDF + buttons | Lead created with campaign DIWALI26 |
| 6.3 | Shreya's phone | Tap **Talk to a person** | "… will reply" | Alert to chat owner |
| 6.4 | Owner, web | Today → **Chats** → Shreya. Type "Hi Shreya, this is OneOhm. We will call you at 4 pm." Send | Message arrives on her phone | Outbound delivered |
| 6.5 | Owner, web | Chat header → **Pass to…** Anjali. Then **Hand back to assistant** | Owner changes | — |
| 6.6 | Vinod's phone | Send **Hi** to +91 98227 59598 | Home menu with Project update, Payments, More | Chat linked to Vinod's lead |
| 6.7 | Anjali, web | Leads → Vinod → Visit card → book survey **tomorrow 11:30** → **Book and tell the customer** | Stage Survey booked. WhatsApp to Vinod | Visit row, survey_scheduled message |
| 6.8 | Anjali, web | Try booking **20 Nov** (QA Holiday) | No slots that day | Calendar rule works |
| 6.9 | Owner, web | Visits page → this week | Vinod's visit listed | — |
| 6.10 | Owner, web | Settings → Working time: remove QA Holiday. Visits: put length back | Restored | — |

## Phase 7 — Quotation and acceptance

| Step | Who | Do this | You should see | Claude checks |
|---|---|---|---|---|
| 7.1 | Anjali, web | Vinod lead → **Convert to customer** → A person → new site (data in 0.7) | Customer created | Customer + property rows |
| 7.2 | Anjali, web | **Create quotation**. 3 kW, On-grid, DCR panel (from 2.12), suggested inverter, RCC roof, floors 2, distance 8 km | Total, subsidy ₹78,000, customer pays | Price engine values |
| 7.3 | Anjali, web | Discount **₹8,000** | "Save for approval" (above limit) | — |
| 7.4 | Anjali, web | Add extra: Gift, "Free panel cleaning kit", ₹0, reason "Diwali offer" | Line added | — |
| 7.5 | Anjali, web | **Save for approval** | Quote draft, waiting approval | Quote row, valid-until = 20 days |
| 7.6 | Owner, web | Today → **Waiting for my approval** → discount → **Approve** | Approved | — |
| 7.7 | Owner, web | Settings → Company: put validity back | Restored | — |
| 7.8 | Anjali, web | Quote → **Send** | Status Sent. Lead Quoted | WhatsApp quote PDF + buttons delivered |
| 7.9 | Vinod's phone | Open the PDF. Tap **I have a question** → **Subsidy** | Subsidy answer | Assistant reply |
| 7.10 | Vinod's phone | Tap **Accept quote** → **Yes, accept** | Thank-you message | Quote accepted, lead Won, alert to owner |
| 7.11 | Anjali, field app | **Quote** tab → Quick quote for Green Park Society, 10 kW, 40 households | Price with society subsidy | — |
| 7.12 | Owner, web | Quotation builder → try project type Commercial ground mount | Refused (switched off in 2.16) | Then switch it back on |

## Phase 8 — Project, tasks, crew, DISCOM, material

| Step | Who | Do this | You should see | Claude checks |
|---|---|---|---|---|
| 8.1 | Owner, web | Bell → "accepted … start the project" → quote → **Create project**. DISCOM MSEDCL, PM **Rakesh Jadhav**, no loan, contractor **Sai Solar Installers** | Project OH-2026-xxx | Tasks generated, milestones, project_started WhatsApp |
| 8.2 | Owner, web | Project room → read every tab | Overview, Tasks, Payments, Material, Documents, Reports, Activity | — |
| 8.3 | Rakesh, field app | Sign in 9000001102. Today → site survey task → **Start task** → check in → fill facts → add photo → **Complete** | Task done or sent for approval | Task status, evidence row |
| 8.4 | Rakesh, field app | Another task → **Waiting on someone** → Customer, "Waiting for roof access" | Task waiting | Waiting party customer |
| 8.5 | Owner, web | Tasks tab → Kanban. Change a due date with reason. Set one task **Urgent** | Moves. Assignee alerted | — |
| 8.6 | Manoj (Procurement), web | Inventory → Vendors → add vendor (0.7). Purchase orders → New PO → "Fill from project" → Send | PO sent | PO row |
| 8.7 | Kiran (Store), web | PO → **Receive goods** (serials) | Stock up | GRN row |
| 8.8 | Swapnil (Dispatch), web | Project → Material → dispatch to site | Challan | Dispatch payment due + WhatsApp pay link |
| 8.9 | Suresh (crew), field app | Sign in 9000001114. **Work** tab → work order → installation task → start → photos → complete. Material → **Record use** | Task done | Usage slip |
| 8.10 | Nitin (Liaisoning), web | DISCOM → Waiting on DISCOM → Follow-up dialog. Raise change request "consumer name change" | CR-2026-xxxx | CR row, WhatsApp |
| 8.11 | Ajay (Loan), web | Finance → Loans: read the setup (no loan here) | — | — |

## Phase 9 — Money

| Step | Who | Do this | You should see | Claude checks |
|---|---|---|---|---|
| 9.1 | Vinod's phone | Advance message → **Pay now** → **Continue to pay** → UPI **success@razorpay** | Razorpay success | Webhook 200, payment row |
| 9.2 | Vinod's phone | Wait | Receipt PDF + thank-you | payment_received delivered |
| 9.3 | Pallavi (Accounts), web | Finance → Receivables. Project → Payments → **Record payment** for dispatch milestone, Cash ₹10,000 | Receipt number | Ledger entry |
| 9.4 | Pallavi, web | Finance → Cash and cheques → record deposit | Deposit slip | — |
| 9.5 | Pallavi, web | Finance → Invoices → issue tax invoice | OH/INV/… | Invoice row |
| 9.6 | Pallavi, web | Payables → contractor bill → Review → Approve → Pay (Practice / RazorpayX test) | Paid | Payout row |
| 9.7 | Owner, web | Finance → Ledger, Overview | Totals | — |

## Phase 10 — Customer app (Vinod)

| Step | Do this | You should see | Claude checks |
|---|---|---|---|
| 10.1 | http://localhost:8092 → +91 9XXXX XXX44 (Vinod, test customer) → 123456 | Home with journey card | Customer session |
| 10.2 | Switch language to मराठी, then back | Text changes | Preferred language saved |
| 10.3 | Read Home: waiting card, to-dos, journey, subsidy, contact, updates | — | — |
| 10.4 | Payments tab: paid vs still to pay, receipts open | Receipt PDF opens | — |
| 10.5 | Documents tab: quotation PDF | Opens | — |
| 10.6 | Help → **Ask for help** → "Inverter shows error E21", photo | "Sent. Our service team will call you." | Service request row |
| 10.7 | Me → **Manage family** → add Tejas Patil, 8087823247, Brother | Added | Family row |
| 10.8 | Sign out. Sign in as 8087823247 (Tejas) | Same project. Note "only owner can add people" | — |
| 10.9 | Me → **Refer a neighbour**: "Amol Shinde", 9000002204, Pune | Referral listed | Referral + lead |
| 10.10 | Bell → updates list → Mark all read | — | — |

## Phase 11 — Service and after-sales

| Step | Who | Do this | You should see | Claude checks |
|---|---|---|---|---|
| 11.1 | Owner, web | Service → Requests → Vinod's request → assign Vaibhav | Assigned | Alert to Vaibhav |
| 11.2 | Vaibhav, field app | 9000001109 → Today → Service visit → check in → "What you found / What you did" → **Mark work done** | Done | Status resolved, WhatsApp to Vinod |
| 11.3 | Vinod's phone | Rating / "Is it working" buttons | — | Rating row |
| 11.4 | Owner, web | Project → installed system → **Sell AMC** | AMC card | — |
| 11.5 | Owner, web | Service → Message log → read and filter | Every send listed | — |

## Phase 12 — Add a new workflow task

| Step | Do this | You should see | Claude checks |
|---|---|---|---|
| 12.1 | Owner: Settings → Task templates → **Add task**. Name "Earthing pit photo check", key `earthing_pit_check`, stage Installation, role Execution, starts day 10, takes 1 day, waits for structure installation, proof Photo, needs approval by project manager, customer sees step, WhatsApp on done | Saved | Template row |
| 12.2 | Make a 2nd quote (Tejas or Shreya), accept, create project | New project has "Earthing pit photo check" | Task generated |
| 12.3 | Switch the template off. Check old project keeps it | — | — |

## Phase 13 — HR and team life

| Step | Who | Do this | You should see | Claude checks |
|---|---|---|---|---|
| 13.1 | Anjali, field app | Today → **Check in** (allow location) | Checked in | Attendance row |
| 13.2 | Anjali, field app | **Ask for a correction**: check-in 09:30, "Forgot to check in" | Sent | Correction row |
| 13.3 | Anjali, field app | Leave → **Request leave**: Casual, 2 days next week, reason "Family function" | Waiting | Leave row, impact |
| 13.4 | Sneha (HR), web | Team → Attendance → approve correction. Leave → approve with backup | Approved | Alerts |
| 13.5 | Sneha, web | Team → Announcements: "Diwali office closed on 20 Nov", all roles | Shows on field Today | — |
| 13.6 | Owner, web | Team → Points → Give recognition to Rakesh. Bonuses → propose | — | — |
| 13.7 | Anjali, field app | Travel and claims → claim for yesterday | Claim | Travel claim row |
| 13.8 | Owner, web | Team → Workload, Travel, Resellers tabs | — | — |

## Phase 14 — Reseller

| Step | Do this | You should see | Claude checks |
|---|---|---|---|
| 14.1 | Ganesh, field app 9000001113 → banner "Add payout details" → UPI `ganesh@okaxis`, PAN `ABCPT1234Q` | Saved, masked | Finance alert |
| 14.2 | New lead **Sunita Jagtap**, 9000002202, Satara | Source reseller | — |
| 14.3 | Clients and Earnings tabs | Lists | — |
| 14.4 | Owner, web: Team → Resellers → commission rule | — | — |

## Phase 15 — Reports, logs, settings effects check

| Step | Do this | You should see |
|---|---|---|
| 15.1 | Reports: sales, delivery, delays, collections, profitability, team, service. Download one CSV | Our test data shows |
| 15.2 | Settings → Automation runs → any failure → Run again | — |
| 15.3 | Settings → Activity log → Changes → find the settings we changed | Each change logged |
| 15.4 | Settings → Roles: remove one permission from Marketing. Priyanka refreshes | Menu item gone. Put back after |

## Phase 16 — Remove an employee

| Step | Do this | You should see |
|---|---|---|
| 16.1 | Team → Swapnil → **Remove from team** → hand work to Rakesh | Past members list |
| 16.2 | Swapnil field app session | Signed out |

## Phase 17 — Cleanup (after QA, and again after the client demo)

1. Claude lists every record made since `qa-backups/qa-start-time.txt` (2026-11-14 03:42 UTC).
2. You confirm the list.
3. Claude deletes only those records. The demo data from before stays.
4. Fallback: full restore from `/Volumes/works-space/oneohm-official/qa-backups/oneohm-before-qa.dump` (only if you say so).
5. Claude puts settings back, `WHATSAPP_TEST_NUMBERS` back, and stops the tunnel.

---

## Run log

| Step | Result | Notes / bugs / pain points |
|---|---|---|
| 0 | ✅ | Prerequisites done: DB, API, worker, web, field 8083, customer 8092, tunnel, Meta both overrides, Razorpay webhook, test numbers, DB backup |
| 1.0 | 🔧 fixed | Web sign-in had no time greeting on wide screens (only phones). Added PanelGreeting to brand panel. |
| 1.1–1.2 | ✅ | Owner signed in 04:15 UTC. Sign-in attempt logged (success). |
| 1.3–1.4 | ✅ | Sidebar read. Owner alerts: 0 unread of 207 after Mark all read. |
| 1.5–1.8 | 🔧 fixed | (1) "Needs you today" buttons only opened lists: Start project now opens the quote with the Create project form; late payment opens the project Payments with that milestone highlighted + Send to customer; one discount/lead/chat opens that record; several open a filtered list (new quote filter "Accepted, no project yet"). (2) Finance → Ledger crashed: missing labels for payout_fee_refund, payout_paid, payable_payment, tds_deposit; added + safe fallback. (3) Money lines Owed to vendors / contractors / due within N days now open Payables filtered, with a "Showing only… / Show all bills" chip. (4) ⓘ help sheet on all 14 Command centre cards. (5) What could slip: grammar fix ("the our team"), hint line, true total "Top 6 of 58" + See all late tasks. |
| 2.1 | ✅ + 🔧 | Quote validity 15 → 20 saved (put back to 15 after 7.5). Signatory name set to "Sneha Sanjay Patil" (was empty; keep). Fix: /settings showed Company but the address had no ?tab=; address now always names the open section (also for unknown ?tab=). |
| 2.2 | ✅ | Roles grid and editor read. No role changed (checked DB). |
| 2.3 | ✅ | Points read (10/10/50/20/200). |
| 2.4 | ✅ + 🔧 | QA Holiday 2026-11-20 saved. Bug: leave counted holidays as leave days (only weekly offs were skipped) → fixed in domain leaveHalfDays + API impact/apply/team report; open leave is recounted when holidays/working week change. New: staff see working time + next holidays (field Leave tab, web Team → Leave); Request leave shows "Not counted, holiday: …", day chips tagged "Off"/"Holiday", all-holiday request blocked with clear text. QA: 19–21 Nov = 2 days, 20 Nov only = 0 (blocked), holiday on Sunday counted once, remove/re-add holiday recounts 4→6→4. Note: field Expo server does not hot-reload on this drive; restart field-qa after code changes. |
| 2.4b | 🔧 fixed | Task dates ignored Sundays and holidays (a task was due on the QA Holiday). Now new project tasks, late-task chain moves, scope-change tasks and DISCOM change-request steps never start or fall due on a weekly off or holiday (rolled to the next working day). Manual due dates picked by a manager are kept as picked. Existing tasks are not moved. Tests: domain 970, API projects/changes/discom 24 pass. |

### Automated end-to-end run by Claude (2026-11-14, 22:00–23:15 IST)

Acting as each user through the same API the apps use (owner on web, staff by phone code, customers by phone code, WhatsApp taps sent to our webhook exactly as Meta sends them, Razorpay "paid" sent signed with our webhook secret). Test journey: Tejas Patil → OH-Q-2026-0020 → project **OH-2026-017** (all 23 tasks done, project completed); 2nd project **OH-2026-018** (Shreya) for the workflow test.

| Phase | Result | Notes / fixes |
|---|---|---|
| 2 Settings effects | ✅ | Visit length 60 → slots 60 min; city owner Pune → WhatsApp/marketing leads go to Anjali; DIWALI26 tags WhatsApp lead; "Bill collected" step; holidays (someone replaced QA Holiday with Diwali 12 Nov at 13:55). |
| 3 Add employees | ✅ | 14 added; duplicate mobile refused. Contractor + crew lead. 🔧 API now refuses unknown contractor "kinds of work" (a typo left all crew tasks unassigned). |
| 4 First sign-in | ✅ | Set password with code; sign in by employee ID / email / mobile; wrong password and unknown number refused. |
| 5 Leads | ✅ + 🔧 | Duplicate open lead refused; follow-up, step move, lost (reason + revisit), reopen, "Other" needs words. 🔧 Marketing-added leads (and auto-assigned leads) now go to someone who can quote, not to Marketing. |
| 6 WhatsApp | ✅ | Onboarding (language → name → city → site → bill → roof → floors → estimate PDF → visit day/slot), lead at city step, "Talk to a person", staff reply, pass to, hand back. 🔧 "message not sent" alerts: one per chat per hour, not one per message (was 5 in 30 s). |
| 7 Quote | ✅ + 🔧 | Price/subsidy correct; discount over limit blocks sending. 🔧 Approvers now get "Approve a discount on …" and the salesperson gets "Discount approved" (before: nobody was told). Quote template with PDF delivered to Tejas's phone; questions (subsidy, plan) answered; accept → lead won, owner alerted. |
| 8 Project & tasks | ✅ | 23 tasks, none due on Sunday/holiday; survey check-in, checklist, photo, measurements, review/approve, points; DISCOM waiting + follow-up; vendor, PO, goods received with serials, reserve, dispatch challan, crew material use (over-use refused), installs, commissioning (warranty assets), meters, handover with signature, subsidy steps → completed. 🔧 Clearer "no material left" message. 🔧 A work order that finishes with ₹0 (no rate card) now alerts accounts. |
| 9 Money | ✅ | Razorpay test link; wrong signature 401; paid → receipt + alerts + receipt PDF template delivered; part payment, overpay refused, cash; repeat "paid" not double-counted; tax invoice; bill approval limit; bill part-paid; cash deposit; ledger balanced (0 difference). |
| 10 Customer app | ✅ + 🔧 | Home/journey/subsidy/warranty/documents, service request, family add/remove, family sign-in, referral (existing lead refused politely). 🔧 Adding someone who already has their own OneOhm account as "family" is now refused (it did nothing). 🔧 Sign-in: a mistyped long number is refused in the app; "0…"/"+91…" is cleaned before sending. |
| 11 Service | ✅ + 🔧 | Auto-assigned, visit day, check-in, resolve, "Is it working?", rating. 🔧 Customer messages now name the problem clearly ("inverter error", not "inverter"). |
| 12 Workflow | ✅ | New task "Earthing pit photo check" appears on the next project, assigned; switched off later, old project keeps it. |
| 13 HR | ✅ | Check-in, correction, leave with backup (reseller refused as backup), "covering" alert, announcement, recognition (limit from Settings), bonus. |
| 14 Reseller | ✅ | Payout details (PAN masked), cannot edit others, own lead only, finance alerted. |
| 15 Reports & roles | ✅ | 7 reports + 7 CSV downloads; permission removed → 403 at once → restored. |
| 16 Remove employee | ✅ | Work handed to Kiran (alerted), phone session ended, web sign-in refused. |
| Checks | ✅ | 2,293 unit tests pass (11 packages), typecheck all, lint 0 errors, file size ≤ 250. |

Open questions / notes for the owner:
1. Service response/fix deadlines count clock hours. Decided 2026-11-14: keep clock hours.
2. Razorpay checkout shows the merchant name "Beyondnyx" (Razorpay account setting, not code).
3. Settings → Automation runs shows 33 old "payment link check" failures from 13:43–19:49 IST (earlier setup); none since.
4. WO-2026-0017 (Sai Solar Installers) has no pay lines: add a rate card or a line so the crew is paid.
5. Ideas: "Already a customer" hint on new lead; warn when panel count ≠ quote; staff phone shown as +919000001101 in WhatsApp texts.
6. Limit of this run: chat replies to simulated taps were refused by Meta (no real 24-hour window); templates (quote, receipt) were delivered for real.
