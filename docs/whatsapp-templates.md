# WhatsApp templates (draft for Meta)

The app sends these 22 templates. Each one:

- Category **Utility**, language **English (`en`)**.
- Uses **numbered** fields (`{{1}}`, `{{2}}`, …). The app fills them in the order of "Fields".
- Has the same name as the app's template key, so no change in **Settings → WhatsApp messages** is needed.

Changes from the app's current wording are marked **Changed**. Meta often rejects a body that
ends with a field, or has too many fields for its length. The changes fix that. After Meta
approves a template, the app's wording (code default and database) must match it.

The 4 templates already approved on Meta (`quotation_pdf`, `project_step_update`,
`maintenance_visit_opened`, `maintenance_visit_closed`) use named fields. The app cannot fill
named fields, so they stay unused.

## Customer templates

### 1. `quotation_sent` — Changed
Fields: customer, number, total, subsidy, effective

> Hello {{1}}, your OneOhm solar quotation {{2}} is ready. Total price: {{3}}. Expected government subsidy: {{4}}. Your cost after subsidy: {{5}}. Reply here if you have any questions.

Examples: Ramesh Patil · QT-2026-0142 · ₹1,85,000 · ₹78,000 · ₹1,07,000

**Header and buttons (file and buttons version):**
- Header: **Document**. The app attaches the quote PDF. Use any sample PDF when you submit.
- Quick reply 1: `Accept quote` (the app sends the payload `quote_accept:<id>`).
- Quick reply 2: `I have a question` (payload `quote_ask:<id>`).
- Keep the order. The app fills the buttons in this order.

### 2. `project_started`
Fields: customer, project, capacity

> Hello {{1}}, your solar project {{2}} ({{3}}) has started. We will keep you posted here.

Examples: Ramesh Patil · PRJ-0087 · 3 kW

### 3. `project_milestone` — Changed
Fields: customer, project, milestone

> Hello {{1}}, an update on your solar project {{2}}: {{3}}. We will keep you posted here.

Examples: Ramesh Patil · PRJ-0087 · Solar panels are installed

### 4. `payment_received` — Changed
Fields: customer, amount, milestone, project

> Hello {{1}}, we received your payment of {{2}} for {{3}} on your solar project {{4}}. Thank you. You can see all your payments in the OneOhm app.

Examples: Ramesh Patil · ₹50,000 · Advance payment · PRJ-0087

**Header (file version):**
- Header: **Document**. The app attaches the receipt PDF. Use any sample PDF when you submit.
- No buttons.

### 5. `payment_reminder` — Changed
Fields: customer, amount, milestone, project

> Hello {{1}}, {{2}} for {{3}} on project {{4}} is due. Please pay at your convenience. If you have already paid, please ignore this message.

Examples: Ramesh Patil · ₹50,000 · Installation payment · PRJ-0087

**Button (button version):**
- One **Call to action → Visit website** button, type **Dynamic**.
- Button text: `Pay now`.
- URL: `<API_PUBLIC_URL>/v1/pay/due/{{1}}`, with `API_PUBLIC_URL` exactly as set in the app (it can include a path, for example `https://app.example.com/api`). Meta fixes the URL base when it approves the template, so a template approved with a test tunnel address will not work in production. Submit the production version with the production `API_PUBLIC_URL`.
- Sample for `{{1}}`: any short text, for example `abc123`. The app fills `{{1}}` with the customer's pay token.
- This is a button field, separate from the body fields.

### 6. `payment_link` — Changed
Fields: customer, amount, milestone, project, link

> Hello {{1}}, please pay {{2}} for {{3}} on project {{4}}. Pay securely here: {{5}} Reply here if you need help.

Examples: Ramesh Patil · ₹50,000 · Installation payment · PRJ-0087 · https://rzp.io/l/abc123

**Button (button version):**
- Same as `payment_reminder`: one dynamic **Visit website** button.
- Button text: `Pay now`.
- URL: `<API_PUBLIC_URL>/v1/pay/due/{{1}}`, where `{{1}}` is the pay token. Same rule as above: the base is fixed at approval, so use the production `API_PUBLIC_URL`.

### 7. `service_update` — Changed
Fields: customer, topic, status

> Hello {{1}}, your service request "{{2}}" is now {{3}}. We will keep you posted here.

Examples: Ramesh Patil · Inverter shows an error · in progress

### 8. `change_request_raised` — Changed
Fields: customer, request, number

> Hello {{1}}, we have started your {{2}} request ({{3}}). We will tell you when it is complete.

Examples: Ramesh Patil · Consumer name change · CR-0031

### 9. `change_request_completed` — Changed
Fields: customer, request, number

> Hello {{1}}, your {{2}} request ({{3}}) is complete. Thank you for your patience.

Examples: Ramesh Patil · Consumer name change · CR-0031

### 10. `document_requested`
Fields: customer, document, project

> Hello {{1}}, please send your {{2}} for project {{3}}. Open the OneOhm app, go to Documents and tap Send.

Examples: Ramesh Patil · latest electricity bill · PRJ-0087

### 11. `referral_reward`
Fields: customer, friend, amount, status

> Hello {{1}}, your OneOhm referral reward for {{2}} ({{3}}) is {{4}}. Thank you!

Examples: Ramesh Patil · Suresh Jadhav · ₹2,000 · approved

Risk: Meta may call this **Marketing**. If so, it still works, but each message costs more.

### 12. `maintenance_visit` — Changed (field order in the text)
Fields: customer, visit, date, project

> Hello {{1}}, your free {{2}} visit is on {{3}}, for project {{4}}. Our service team will call before they come.

Examples: Ramesh Patil · 6-month maintenance · 12 Dec 2026 · PRJ-0087

### 13. `survey_scheduled`
Fields: customer, project, date

> Hello {{1}}, our team will visit for the site survey of your solar project {{2}} on {{3}}. They will call before they come.

Examples: Ramesh Patil · PRJ-0087 · 5 Nov 2026

### 14. `stage_rating_request`
Fields: customer, stage, project

> Hello {{1}}, the {{2}} for your solar project {{3}} is done. How did we do? Please rate it in the OneOhm app.

Examples: Ramesh Patil · installation · PRJ-0087

### 15. `installation_started` — Changed (field order in the text)
Fields: customer, project, capacity

> Hello {{1}}, installation of your solar system {{2}} ({{3}}) has started today. We will tell you when it is done.

Examples: Ramesh Patil · PRJ-0087 · 3 kW

### 16. `commissioning_completed`
Fields: customer, project

> Hello {{1}}, your solar system {{2}} is tested and switched on. The final payment is now due; we will send the amount and how to pay.

Examples: Ramesh Patil · PRJ-0087

### 17. `project_update_link` — Changed
Fields: customer, project, milestone, link

> Hello {{1}}, an update on your solar project {{2}}: {{3}}. See it here: {{4}} Thank you for choosing OneOhm.

Examples: Ramesh Patil · PRJ-0087 · Warranty card is ready · https://app.oneohm.in/d/abc123

### 18. `service_visit_booked`
Fields: customer, topic, date

> Hello {{1}}, our technician will visit for your service request "{{2}}" on {{3}}. They will call before they come.

Examples: Ramesh Patil · Inverter shows an error · 6 Nov 2026

### 19. `project_waiting`
Fields: customer, project, milestone, reason

> Hello {{1}}, a short delay on your solar project {{2}}: "{{3}}" is waiting for {{4}}. We will keep you posted here.

Examples: Ramesh Patil · PRJ-0087 · Net meter installation · the electricity board (DISCOM)

### 20. `project_manager_changed` — **New**
Fields: customer, project, manager, phone

Sent when a live project gets a new project manager.

> Hello {{1}}, your solar project {{2}} now has a new project manager: {{3}}. You can reach them on {{4}}. Reply here if you have any questions.

Examples: Ramesh Patil · PRJ-0087 · Vikram Jadhav · +91 98765 43210

## Staff template

### 21. `staff_daily_digest` — Changed
Fields: name, overdue, today, followUps

> Good morning {{1}}, here is your OneOhm work summary for today. Overdue tasks: {{2}}. Tasks due today: {{3}}. Lead follow-ups: {{4}}. Open the OneOhm app to see them.

Examples: Priya · 2 · 5 · 3

## Chat template

### 22. `chat_follow_up`
Fields: customer, staff, message

Used when a team member writes to a customer more than 24 hours after the customer's last
message. WhatsApp allows only an approved template then, so the team member's words go
inside it. The message is kept on one line (WhatsApp does not allow line breaks in a field).

> Hello {{1}}, you have a new message from {{2}} at OneOhm: "{{3}}" Please reply here to continue the chat.

Examples: Ramesh Patil · Priya · Your net meter is fitted. Please check the reading tonight.

## Templates with a file and buttons

Four templates now have a second version with a file or buttons: `quotation_sent`,
`payment_link`, `payment_reminder` and `payment_received`. The text bodies above do not change.
Meta must approve the new version before the app can use it.

Editing an approved Meta template replaces it, and once a template has a document header, a send
without the header parameter is refused. So never edit the old template. Follow this order:

1. Submit the version with the file and buttons to Meta under a **new** Meta name (same body, plus
   the header or buttons described above). `quotation_sent` has no link field in the new version.
2. Wait for Meta to approve it.
3. In **Settings → Messages**, open the template and, in the same dialog, change the Meta name to
   the new one and turn on **Meta approved the version with file and buttons**. Save both together.

To roll back, put the old Meta name back and turn the switch off in the same dialog. The old text
template then sends again.

The switch also applies to the Marathi and Hindi template names. Those versions need the same
header and buttons approved before the switch goes on, or leave their names empty.

| Template | Header | Buttons |
|---|---|---|
| `quotation_sent` | Document (quote PDF) | Quick replies: Accept quote, I have a question |
| `payment_link` | none | URL button "Pay now": `<API_PUBLIC_URL>/v1/pay/due/{{1}}` (production address) |
| `payment_reminder` | none | URL button "Pay now": `<API_PUBLIC_URL>/v1/pay/due/{{1}}` (production address) |
| `payment_received` | Document (receipt PDF) | none |

To test all of this with real (test) keys, follow `docs/LIVE-TEST-WHATSAPP-RAZORPAY.md`.

## Not included yet

- Hindi (`hi`) and Marathi (`mr`) versions. The app supports them, but they are optional.
  Without them, every customer gets English.
