# WhatsApp templates (draft for Meta)

The app sends these 20 templates. Each one:

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

### 5. `payment_reminder` — Changed
Fields: customer, amount, milestone, project

> Hello {{1}}, {{2}} for {{3}} on project {{4}} is due. Please pay at your convenience. If you have already paid, please ignore this message.

Examples: Ramesh Patil · ₹50,000 · Installation payment · PRJ-0087

### 6. `payment_link` — Changed
Fields: customer, amount, milestone, project, link

> Hello {{1}}, please pay {{2}} for {{3}} on project {{4}}. Pay securely here: {{5}} Reply here if you need help.

Examples: Ramesh Patil · ₹50,000 · Installation payment · PRJ-0087 · https://rzp.io/l/abc123

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

## Staff template

### 20. `staff_daily_digest` — Changed
Fields: name, overdue, today, followUps

> Good morning {{1}}, here is your OneOhm work summary for today. Overdue tasks: {{2}}. Tasks due today: {{3}}. Lead follow-ups: {{4}}. Open the OneOhm app to see them.

Examples: Priya · 2 · 5 · 3

## Chat template

### 21. `chat_follow_up`
Fields: customer, staff, message

Used when a team member writes to a customer more than 24 hours after the customer's last
message. WhatsApp allows only an approved template then, so the team member's words go
inside it. The message is kept on one line (WhatsApp does not allow line breaks in a field).

> Hello {{1}}, you have a new message from {{2}} at OneOhm: "{{3}}" Please reply here to continue the chat.

Examples: Ramesh Patil · Priya · Your net meter is fitted. Please check the reading tonight.

## Not included yet

- Hindi (`hi`) and Marathi (`mr`) versions. The app supports them, but they are optional.
  Without them, every customer gets English.
