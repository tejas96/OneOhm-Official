# WhatsApp templates (draft for Meta)

The app sends these 56 templates (the numbered sections below; a few have newer versions). Each one:

- Category **Utility**, language **English (`en`)**.
- Uses **numbered** fields (`{{1}}`, `{{2}}`, …). The app fills them in the order of "Fields".
- Has the same name as the app's template key, so no change in **Settings → WhatsApp messages** is needed.

Changes from the app's current wording are marked **Changed**. Meta often rejects a body that
ends with a field, or has too many fields for its length. The changes fix that. After Meta
approves a template, the app's wording (code default and database) must match it.

The 4 templates already approved on Meta (`quotation_pdf`, `project_step_update`,
`maintenance_visit_opened`, `maintenance_visit_closed`) use named fields. The app cannot fill
named fields, so they stay unused.

## Summary of every template (phase 7)

One row per template: its key (the same as the Meta name unless a "file" version is approved), what it is for, its Meta category, its buttons,
the switch in **Settings → WhatsApp messages** that must be on for the buttons to go out, and where it stands with Meta. Fields, wording and
Marathi/Hindi text are in the numbered sections below. A template is **off** in the app until you switch it on; the chat message of the same
news still goes inside 24 hours while it is off (money and answer flows never go silent).

| Key | Purpose | Category | Buttons | Quick-reply switch | Meta status |
|---|---|---|---|---|---|
| `quotation_sent` | The quote PDF with its two buttons | Utility | 2 quick replies + document header | extras approved | Approved en, mr, hi (`quotation_sent_file`) |
| `project_started` | The project has started | Utility | none | — | Approved mr, hi; en to submit |
| `project_milestone` | A project step is done | Utility | none | — | To submit |
| `project_manager_changed` | A new project manager | Utility | none | — | To submit |
| `payment_received` | A payment was received (receipt PDF) | Utility | document header | extras approved | Approved en, mr, hi (`payment_received_file`) |
| `payment_reminder` | An instalment is due | Utility | 1 quick reply + URL "Pay now" | quick replies approved | Approved mr, hi (text); en and newer to submit |
| `payment_link` | An instalment with the pay link | Utility | 1 quick reply + URL "Pay now" | quick replies approved | Approved mr, hi (text); en and newer to submit |
| `service_update` | A service request changed status | Utility | none | — | To submit |
| `contact_changed` | The contact person changed | Utility | none | — | To submit |
| `change_request_raised` | A change to the project was started | Utility | none | — | To submit |
| `change_request_completed` | A change to the project is done | Utility | none | — | To submit |
| `document_requested` | Older paper request (replaced by `paper_request`) | Utility | none | — | To submit |
| `paper_request` | The team asks for a paper | Utility | none | — | To submit |
| `referral_reward` | A referral reward changed status | Utility | none | — | To submit |
| `maintenance_visit` | A free AMC visit is booked | Utility | none | — | To submit |
| `survey_scheduled` | The site survey visit is scheduled | Utility | none | — | To submit |
| `stage_rating_request` | Rate a finished stage | Utility | 1 quick reply | quick replies approved | To submit |
| `installation_started` | Installation has started | Utility | 1 quick reply | quick replies approved | To submit |
| `commissioning_completed` | The system is switched on | Utility | 2 quick replies | quick replies approved | To submit |
| `project_update_link` | Project update with a link | Utility | none | — | To submit |
| `service_visit_booked` | A technician visit for a service request | Utility | none | — | To submit |
| `project_waiting` | A short delay, waiting on a step | Utility | 1 quick reply | quick replies approved | To submit |
| `location_request` | Ask for the home location (staff) | Utility | 1 quick reply | extras approved | To submit |
| `payment_due` | Payment due, pay or send proof (staff) | Utility | 2 quick replies | extras approved | To submit |
| `callback_request` | Pick a call time (staff) | Utility | 3 quick replies | extras approved | To submit |
| `delay_notice` | A delay notice (staff) | Utility | none | — | To submit |
| `crew_contact` | Who is coming (staff) | Utility | none | — | To submit |
| `document_share` | A paper of ours as a file (staff) | Utility | document header | extras approved | To submit |
| `visit_pick` | Pick a visit day | Utility | 1 quick reply | extras approved | To submit |
| `visit_booked` | The visit is booked | Utility | 2 quick replies | extras approved | To submit |
| `visit_reminder` | The visit is tomorrow | Utility | 2 quick replies | extras approved | To submit |
| `inspection_presence` | DISCOM inspection or net meter date | Utility | 2 quick replies | extras approved | To submit |
| `signature_request` | Read and agree to a paper | Utility | 2 quick replies + document header | extras approved | To submit |
| `site_ready_check` | Is the roof ready? | Utility | 2 quick replies | extras approved | To submit |
| `installation_check` | Is the installation finished? | Utility | 2 quick replies | extras approved | To submit |
| `handover_pack` | The handover papers are ready | Utility | 2 quick replies | extras approved | To submit |
| `signature_reminder` | Reminder: agree to a paper | Utility | 1 quick reply | extras approved | To submit |
| `signed_page_reminder` | Reminder: send the signed page | Utility | 1 quick reply | extras approved | To submit |
| `site_ready_reminder` | Reminder: roof not ready | Utility | 1 quick reply | extras approved | To submit |
| `subsidy_register_help` | Register on the subsidy portal | Utility | 2 quick replies | extras approved | To submit |
| `subsidy_credit_check` | Did the subsidy reach your bank? | Utility | 2 quick replies | extras approved | To submit |
| `bank_sign_visit` | Sign the loan papers at the bank | Utility | 2 quick replies | extras approved | To submit |
| `layout_approval` | Look at the panel layout | Utility | 2 quick replies + document header | extras approved | To submit |
| `layout_reminder` | Reminder: look at the layout | Utility | 1 quick reply | extras approved | To submit |
| `loan_sanctioned` | Loan sanctioned | Utility | none | — | To submit |
| `loan_disbursed` | Loan money sent | Utility | none | — | To submit |
| `loan_rejected` | Loan not approved | Utility | none | — | To submit |
| `self_survey_offer` | Self site survey with a discount | Marketing | 2 quick replies | extras approved | To submit |
| `self_survey_reminder` | Reminder: finish the survey | Marketing | 1 quick reply | extras approved | To submit |
| `self_survey_approved` | The survey is approved | Utility | none | — | To submit |
| `problem_fixed_check` | Is it working now? | Utility | 2 quick replies | extras approved | To submit |
| `reward_upi_ask` | Share a UPI ID for the reward | Utility | 1 quick reply | extras approved | To submit |
| `amc_renewal_offer` | The AMC ends soon: renew | Marketing | 2 quick replies | extras approved | To submit |
| `chat_follow_up` | A staff message after the 24-hour window | Utility | none | — | To submit |
| `staff_daily_digest` | Staff daily summary | Utility | none | — | To submit |
| `staff_welcome` | Welcome a new staff member | Utility | none | — | To submit |

Quick-reply switch: **extras approved** = the version with the quick replies / document header is approved (turn it on with the new Meta name in the
same dialog); **quick replies approved** = a newer version with quick replies in front of an older button is approved (the older version keeps working
until then). Marketing templates cost more per message and are never sent to a customer who said STOP.

## Meta submission checklist (for the owner)

1. In WhatsApp Manager submit every row marked **To submit** in **English, Marathi and Hindi**, with the category in the table. The three **Marketing**
   ones are `self_survey_offer`, `self_survey_reminder` and `amc_renewal_offer`; `referral_reward` is a transactional notice of a reward
   the customer earned, so it is **Utility** (if Meta re-classifies it, it still works and costs more).
2. For templates that have a newer version (the "Newer version" sections: `stage_rating_request` with [Rate now], and the buttons on
   `installation_started`, `commissioning_completed`, `project_waiting`, `payment_link`, `payment_reminder`) submit the new version under a **new**
   Meta name. Never edit an approved template.
3. Wait until **all three languages** of a template are approved. Then, in Settings → WhatsApp messages, set the Meta name (and the Marathi and Hindi
   names), turn the quick-reply switch on in the same dialog, and finally turn the template on.
4. Publish the forms (WhatsApp Flows) and paste each flow id under Settings → WhatsApp → Forms: `send_paper`, `paid_another_way`, `self_survey`,
   `report_problem`, `refer_friend`, `share_upi` (see DEPLOYMENT.md, "WhatsApp redesign release"). A form that is not published falls back to the chat.
5. Register the SMS texts below with your DLT provider (MSG91) before turning `SMS_DELIVERY` on.
6. Never set `WHATSAPP_TEST_NUMBERS` in production.

## SMS texts for customers not on WhatsApp (DLT registration is yours)

Sent through the one SMS flow of DEPLOYMENT.md section 5c; the company name is added after the text and the text is cut at 160 characters per part.
A customer on the "In person" channel gets no SMS: the team does it from the customer handovers list. Marathi and Hindi are Unicode SMS and need a
Unicode DLT template.

| Used for | English | Marathi | Hindi |
|---|---|---|---|
| A paper is asked | We need a paper from you. Please send it from the OneOhm app, or give it to our team. | आम्हाला तुमचा एक कागद हवा आहे. कृपया तो OneOhm ॲपवरून पाठवा, किंवा आमच्या टीमकडे द्या. | हमें आपका एक कागज़ चाहिए. कृपया उसे OneOhm ऐप से भेजें, या हमारी टीम को दें। |
| A rating is asked | How did we do? Please rate us in the OneOhm app, or tell our team. | आमचे काम कसे वाटले? कृपया OneOhm ॲपमध्ये रेटिंग द्या, किंवा आमच्या टीमला सांगा. | हमारा काम कैसा लगा? कृपया OneOhm ऐप में रेटिंग दें, या हमारी टीम को बताएँ। |
| A payment is due (pay link) | Payment due {amount} for {home}. Pay here: {link} | {home}: {amount} भरायचे आहेत. इथे भरा: {link} | {home}: {amount} देने हैं. यहाँ भरें: {link} |

Other news (documents, receipts, crew, delay, handover pack, layout, the older approved messages) goes as the app's own short title and body, as before.

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

**Newer version with a quick reply (optional):** en `I paid another way`, mr `दुसऱ्या मार्गे भरले`, hi `दूसरे तरीके से भरा`, as
the FIRST button, then the `Pay now` link button. The app sends the payload `paidother:<instalment id>`, which opens
the proof form. **Submit the new version first, then switch on.** Submit it under a new name, wait for Meta to
approve en, mr and hi, set the new names in Settings, and only then turn on "Meta approved the newer version
with I paid another way" for this message (its own switch, off by default; it stays greyed out until "Meta approved the version with file and buttons" is on). While it is off the app keeps
sending the older shape: the `Pay now` link button alone at position 0, so a template approved without the
quick reply never breaks. The payload is optional; a message queued without it still sends.

### 6. `payment_link` — Changed
Fields: customer, amount, milestone, project, link

> Hello {{1}}, please pay {{2}} for {{3}} on project {{4}}. Pay securely here: {{5}} Reply here if you need help.

Examples: Ramesh Patil · ₹50,000 · Installation payment · PRJ-0087 · https://rzp.io/l/abc123

**Button (button version):**
- Same as `payment_reminder`: one dynamic **Visit website** button.
- Button text: `Pay now`.
- URL: `<API_PUBLIC_URL>/v1/pay/due/{{1}}`, where `{{1}}` is the pay token. Same rule as above: the base is fixed at approval, so use the production `API_PUBLIC_URL`.

**Newer version with a quick reply (optional):** en `I paid another way`, mr `दुसऱ्या मार्गे भरले`, hi `दूसरे तरीके से भरा`, as
the FIRST button, then the `Pay now` link button. The app sends the payload `paidother:<instalment id>`, which opens
the proof form. **Submit the new version first, then switch on.** Submit it under a new name, wait for Meta to
approve en, mr and hi, set the new names in Settings, and only then turn on "Meta approved the newer version
with I paid another way" for this message (its own switch, off by default; it stays greyed out until "Meta approved the version with file and buttons" is on). While it is off the app keeps
sending the older shape: the `Pay now` link button alone at position 0, so a template approved without the
quick reply never breaks. The payload is optional; a message queued without it still sends.

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

### 10a. `paper_request` — **New** (replaces `document_requested`)
Fields: customer, document, home

Names the home the paper is for (papers per home): the site label, else its town, plus
` (consumer no. ending NNNN)` when two of the customer's homes share a name. Submit it in
English, Marathi and Hindi.

> en: Hello {{1}}, please send your {{2}} for your solar at {{3}}. Reply here with a clear photo or PDF. You can also send it from the OneOhm app.

> mr: नमस्कार {{1}}, {{3}} येथील तुमच्या सोलरसाठी कृपया तुमचे {{2}} पाठवा. येथे स्पष्ट फोटो किंवा PDF पाठवा. तुम्ही OneOhm ॲपमधूनही पाठवू शकता.

> hi: नमस्ते {{1}}, कृपया {{3}} पर अपने सोलर के लिए अपना {{2}} भेजें। यहाँ साफ़ फ़ोटो या PDF भेजें। आप इसे OneOhm ऐप से भी भेज सकते हैं।

Examples: Ramesh Patil · latest electricity bill · Farm
Two homes with one name: Ramesh Patil · latest electricity bill · Sangli (consumer no. ending 4821)

The app keeps sending `document_requested` until `paper_request` is switched on. Switch over in
this order:

1. Submit `paper_request` to Meta in en, mr and hi (category **Utility**).
2. Wait until Meta approves **all three** languages.
3. In **Settings → WhatsApp messages**, open `paper_request`, set the Marathi and Hindi names to
   `paper_request`, and switch it on. New requests (and "ask again") now send it.
4. Switch `document_requested` off in the same screen, then delete it in Meta Business Manager
   (the app cannot delete a Meta template).

To roll back before step 4, switch `paper_request` off: the app sends `document_requested` again.
SMS and the app inbox use the same words either way: "Please send your … For your solar at …
Send it from the OneOhm app, or give it to our team."

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

### 21. `contact_changed` — New
Fields: customer, staff, subject, phone

Sent once per customer when a team member leaves and their project, service request or lead
moves to someone else. The admin can turn it off in the removal sheet.

> Hi {{1}}, {{2}} is now your OneOhm contact for {{3}}. You can call them on {{4}}, or reply here any time.

Examples: Ramesh Patil · Priya Shah · your solar project PRJ-0087 · +91 98000 00000

### 25. `location_request` — **New** (staff "Send to customer", outside 24 hours)
Fields: customer, home

The owner switches it on after Meta approves **all three languages**. Until then a location ask
outside the 24-hour window only reaches the customer's app inbox.

> en: Hello {{1}}, please share the location of your {{2}} home so our team finds it easily. Tap the button below to send it.

> mr: नमस्कार {{1}}, तुमच्या {{2}} घराचे लोकेशन पाठवा, म्हणजे आमची टीम सहज पोहोचेल. पाठवण्यासाठी खालील बटण दाबा.

> hi: नमस्ते {{1}}, कृपया अपने {{2}} घर की लोकेशन भेजें, ताकि हमारी टीम आसानी से पहुँच सके। भेजने के लिए नीचे का बटन दबाएँ।

Examples: Ramesh Patil · Sangli

**Buttons:** one quick reply. en `Send location`, mr `लोकेशन पाठवा`, hi `लोकेशन भेजें`. The app sends the payload
`locreq:<ask id>`. A tap opens the chat window, so the app answers with WhatsApp's own
"Send location" button message.

### 26. `payment_due` — **New**
Fields: customer, amount, home

> en: Hello {{1}}, {{2}} is due for your {{3}} home. You can pay online, or tell us if you have already paid another way.

> mr: नमस्कार {{1}}, तुमच्या {{3}} घरासाठी {{2}} बाकी आहे. तुम्ही ऑनलाइन भरू शकता, किंवा दुसऱ्या मार्गाने भरले असल्यास आम्हाला सांगा.

> hi: नमस्ते {{1}}, आपके {{3}} घर के लिए {{2}} बाकी है। आप ऑनलाइन भर सकते हैं, या किसी और तरीके से भरा हो तो हमें बताएँ।

Examples: Ramesh Patil · ₹45,000 · Sangli

**Buttons:** two quick replies, in this order. 1: en `Pay now`, mr `आता भरा`, hi `अभी भरें` (payload
`pay:<instalment id>`, answered with the pay-link message). 2: en `I paid another way`, mr
`दुसऱ्या मार्गे भरले`, hi `दूसरे तरीके से भरा` (payload `paidother:<instalment id>`, opens the proof
form). Used for the staff "Payment reminder" and "Ask for payment proof". The automatic
`payment_reminder` (number 5) and `payment_link` (number 6) carry the same quick reply as their first button.

### 27. `callback_request` — **New**
Fields: customer, staff

> en: Hello {{1}}, when should {{2}} from OneOhm call you? Pick a time below.

> mr: नमस्कार {{1}}, OneOhm चे {{2}} यांनी तुम्हाला कधी फोन करावा? खाली वेळ निवडा.

> hi: नमस्ते {{1}}, OneOhm से {{2}} आपको कब फ़ोन करें? नीचे समय चुनें।

Examples: Ramesh Patil · Priya

**Buttons:** three quick replies, in this order: en `Morning` `Afternoon` `Evening`, mr `सकाळी` `दुपारी`
`संध्याकाळी`, hi `सुबह` `दोपहर` `शाम`. Payloads `cb:<ask id>:morning|afternoon|evening`.

### 28. `delay_notice` — **New**
Fields: customer, stage, reason

> en: Hello {{1}}, your {{2}} is waiting: {{3}}. We will update you here.

> mr: नमस्कार {{1}}, तुमचे {{2}} थांबले आहे: {{3}}. पुढची माहिती आम्ही इथे कळवू.

> hi: नमस्ते {{1}}, आपका {{2}} रुका हुआ है: {{3}}। आगे की जानकारी हम यहीं देंगे।

Examples: Ramesh Patil · net meter · the electricity board has our papers

Only a task whose template allows customer messages can send it (PRD rule: internal tasks never
message customers).

### 29. `crew_contact` — **New**
Fields: customer, staff, work, phone

> en: Hello {{1}}, {{2}} from OneOhm will come for your {{3}}. You can call them on {{4}}.

> mr: नमस्कार {{1}}, OneOhm चे {{2}} तुमच्या {{3}} साठी येतील. तुम्ही त्यांना {{4}} वर फोन करू शकता.

> hi: नमस्ते {{1}}, OneOhm से {{2}} आपके {{3}} के लिए आएँगे। आप उन्हें {{4}} पर फ़ोन कर सकते हैं।

Examples: Ramesh Patil · Ravi · installation · +91 98765 43210

### 30. `document_share` — **New**
Fields: customer, document

> en: Hello {{1}}, here is your {{2}} from OneOhm. Reply here if you have any questions.

> mr: नमस्कार {{1}}, तुमचे {{2}} OneOhm कडून येथे आहे. काही प्रश्न असल्यास इथे कळवा.

> hi: नमस्ते {{1}}, आपका {{2}} OneOhm की ओर से यहाँ है। कोई सवाल हो तो यहीं लिखें।

Examples: Ramesh Patil · warranty card

**Header:** **Document**. The app attaches the file (use any sample PDF when you submit). The
header only goes out once "extras approved" is switched on for this template in Settings.

All six start **switched off** (migration 0078). Switch each on in **Settings → WhatsApp messages** after
Meta approves en, mr and hi, and set the Marathi and Hindi names, as for `paper_request`.

### 31. `visit_pick` — **New** (visits, redesign §8)
Fields: customer, home, work

Sent when the team asks the customer to pick a day (outside the 24-hour window) and when an AMC visit is due.
`work` is the customer's words for the visit in their language: site survey, installation, DISCOM inspection,
net meter fitting, free AMC visit, service visit.

> en: Hello {{1}}, when can our team visit {{2}} for the {{3}}? Tap the button below to pick a day.

> mr: नमस्कार {{1}}, आमची टीम {{2}} येथे {{3}} साठी कधी येऊ शकते? दिवस निवडण्यासाठी खालील बटण दाबा.

> hi: नमस्ते {{1}}, हमारी टीम {{2}} पर {{3}} के लिए कब आ सकती है? दिन चुनने के लिए नीचे का बटन दबाएँ।

Examples: Ramesh Patil · Sangli · installation

**Buttons:** one quick reply. en `Pick a day`, mr `दिवस निवडा`, hi `दिन चुनें`. Payload `vask:<ask id>`; a tap opens
the chat window and the app answers with the list of free days and "Talk to {name}".

### 32. `visit_booked` — **New**
Fields: customer, when, staff

Sent when the team confirms or moves a visit outside the 24-hour window. `when` is a day and slot in the
customer's language, for example "Thu 6 Nov, morning".

> en: Hello {{1}}, your visit is booked ✅ {{2}}. {{3}} will call before coming.

> mr: नमस्कार {{1}}, तुमची भेट ठरली ✅ {{2}}. येण्यापूर्वी {{3}} तुम्हाला फोन करतील.

> hi: नमस्ते {{1}}, आपकी विज़िट तय हो गई ✅ {{2}}। आने से पहले {{3}} आपको फ़ोन करेंगे।

Examples: Ramesh Patil · Thu 6 Nov, morning · Ravi

**Buttons:** two quick replies. en `Okay`, `Change day`; mr `ठीक आहे`, `दिवस बदला`; hi `ठीक है`, `दिन बदलें`.
Payloads `vok:<visit id>:<day>` and `vchg:<visit id>:<day>`. Until this is switched on, a service visit keeps its older
`service_visit_booked` message.

### 33. `visit_reminder` — **New**
Fields: customer, home, when, work

The working day before the visit (Saturday for a Monday visit), in working hours. `when` is "tomorrow morning"
(or "on Mon 9 Nov, morning" when the next working day is not tomorrow), in the customer's language.

> en: Hello {{1}}, our team visits {{2}} {{3}} for the {{4}}. Please confirm.

> mr: नमस्कार {{1}}, आमची टीम {{2}} येथे {{3}} {{4}} साठी येणार आहे. कृपया पक्के करा.

> hi: नमस्ते {{1}}, हमारी टीम {{2}} पर {{3}} {{4}} के लिए आ रही है। कृपया पक्का करें।

Examples: Ramesh Patil · Sangli · tomorrow morning · installation

**Buttons:** two quick replies. en `Confirm`, `Change day`; mr `पक्के करा`, `दिवस बदला`; hi `पक्का करें`, `दिन बदलें`.
Payloads `vcf:<visit id>:<day>` and `vchg:<visit id>:<day>`.

### 34. `inspection_presence` — **New** (DISCOM inspection and net meter fitting)
Fields: customer, work, home, day

Sent when the team tells the customer the date the electricity board visits. `work` is DISCOM inspection or net
meter fitting, in the customer's language.

> en: Hello {{1}}, the electricity board (DISCOM) will do the {{2}} at {{3}} on {{4}}. Please be at home.

> mr: नमस्कार {{1}}, {{2}} साठी वीज मंडळ (DISCOM) {{3}} येथे {{4}} रोजी येणार आहे. कृपया घरी राहा.

> hi: नमस्ते {{1}}, {{2}} के लिए बिजली बोर्ड (DISCOM) {{3}} पर {{4}} को आएगा। कृपया घर पर रहें।

Examples: Ramesh Patil · DISCOM inspection · Sangli · Thu 6 Nov

**Buttons:** two quick replies. en `I'll be there`, `Change day`; mr `मी असेन`, `दिवस बदला`; hi `मैं रहूँगा`, `दिन बदलें`.
Payloads `vcf:<visit id>:<day>` and `vchg:<visit id>:<day>`.

All four are off until Meta approves **all three languages**; then switch each on, and "Meta approved the version
with file and buttons" too, in Settings → WhatsApp messages.

### 35. `signature_request` — **New** (journey: a paper to agree to)
Fields: customer, document, home

Sent from Send to customer (Paperwork, the handover task, a report row) when the chat is closed. Inside 24 hours the same
news is the chat message: the PDF, then "Please read your *paper* for home." with the two buttons.

> en: Hello {{1}}, please read your {{2}} for {{3}}. Tap I agree if you accept it, or ask us if you have a question.

> mr: नमस्कार {{1}}, कृपया {{3}} साठीचे तुमचे {{2}} वाचा. मान्य असल्यास मी सहमत आहे दाबा, किंवा काही प्रश्न असल्यास आम्हाला विचारा.

> hi: नमस्ते {{1}}, कृपया {{3}} के लिए अपना {{2}} पढ़ें। मंज़ूर हो तो मैं सहमत हूँ दबाएँ, या कोई सवाल हो तो हमसे पूछें।

Examples: Ramesh Patil · Net-metering agreement · Sangli

**Header and buttons:** Header **Document** (the app attaches the paper; use any sample PDF). Two quick replies: en `I agree`,
`I have a question`; mr `मी सहमत आहे`, `मला प्रश्न आहे`; hi `मैं सहमत हूँ`, `मेरा सवाल है`. Payloads `sgn:ok:<id>`, `sgn:q:<id>`.

### 36. `site_ready_check` — **New** (journey: before dispatch; also sent by itself when dispatch is ready)
Fields: customer, home

> en: Hello {{1}}, is the roof at {{2}} ready for installation? It needs a clear roof, a power point and someone at home.

> mr: नमस्कार {{1}}, {{2}} येथील छप्पर बसवणीसाठी तयार आहे का? मोकळे छप्पर, एक पॉवर पॉइंट आणि घरी कोणीतरी हवे.

> hi: नमस्ते {{1}}, क्या {{2}} की छत इंस्टॉलेशन के लिए तैयार है? खाली छत, एक पावर पॉइंट और घर पर कोई होना चाहिए।

Examples: Ramesh Patil · Sangli

**Buttons:** two quick replies. en `Yes, ready`, `Not yet`; mr `हो, तयार आहे`, `अजून नाही`; hi `हाँ, तैयार है`, `अभी नहीं`.
Payloads `rdy:y:<id>`, `rdy:n:<id>`. (The chat message after Not yet carries `It's ready now`, payload `rdy:now:<id>`; it is
sent inside the window the tap opened, so it needs no template.)

### 37. `installation_check` — **New** (journey: installation finished; also sent by itself when the installation task is done)
Fields: customer, home

> en: Hello {{1}}, is the installation at {{2}} finished to your satisfaction?

> mr: नमस्कार {{1}}, {{2}} येथील बसवणी तुमच्या समाधानानुसार पूर्ण झाली आहे का?

> hi: नमस्ते {{1}}, क्या {{2}} पर इंस्टॉलेशन आपकी संतुष्टि के अनुसार पूरा हो गया है?

Examples: Ramesh Patil · Sangli

**Buttons:** two quick replies. en `Yes, all good`, `Something is wrong`; mr `हो, सर्व ठीक`, `काहीतरी चुकले`; hi `हाँ, सब ठीक`,
`कुछ गड़बड़ है`. Payloads `ins:y:<id>`, `ins:bad:<id>`.

### 38. `handover_pack` — **New** (journey: handover pack)
Fields: customer, count, home

Inside 24 hours the papers go as documents with a summary line; with the chat closed this template goes and its first
button sends the papers (the tap opens the window).

> en: Hello {{1}}, your {{2}} handover papers for {{3}} are ready. Tap Documents to receive them here.

> mr: नमस्कार {{1}}, {{3}} साठीची तुमची {{2}} हस्तांतर कागदपत्रे तयार आहेत. ती इथे मिळवण्यासाठी कागदपत्रे दाबा.

> hi: नमस्ते {{1}}, {{3}} के लिए आपके {{2}} हैंडओवर कागज़ तैयार हैं। उन्हें यहाँ पाने के लिए दस्तावेज़ दबाएँ।

Examples: Ramesh Patil · 4 · Sangli

**Buttons:** two quick replies. en `Documents`, `Warranty & AMC`; mr `कागदपत्रे`, `वॉरंटी आणि AMC`; hi `दस्तावेज़`, `वारंटी और AMC`.
Payloads `hpack:<project id>`, `go:warranty`.

All four are off until Meta approves **all three languages**; then switch each on, and "Meta approved the version with
file and buttons" too, in Settings → WhatsApp messages.

### 39. `signature_reminder` — **New** (journey: a paper not yet agreed to, 2 days after)
Fields: customer, document, home

> en: Hello {{1}}, a reminder: please read your {{2}} for {{3}} and tell us if you agree. Tap the button to see it again.

> mr: नमस्कार {{1}}, आठवण: कृपया {{3}} साठीचे तुमचे {{2}} वाचा आणि सहमत आहात का ते सांगा. पुन्हा पाहण्यासाठी बटण दाबा.

> hi: नमस्ते {{1}}, याद दिलाना: कृपया {{3}} के लिए अपना {{2}} पढ़ें और बताएँ कि आप सहमत हैं या नहीं। फिर से देखने के लिए बटन दबाएँ।

Examples: Ramesh Patil · Net-metering agreement · Sangli

**Button:** one quick reply: en `See it again`; mr `पुन्हा पाहा`; hi `फिर से देखें`. Payload `jr:<id>` (the paper again with its two buttons).

### 40. `site_ready_reminder` — **New** (journey: the customer said the roof is not ready yet; 2 days after)
Fields: customer, home

> en: Hello {{1}}, we are waiting for the roof at {{2}} to be ready for installation. Tap the button when it is ready.

> mr: नमस्कार {{1}}, {{2}} येथील छप्पर बसवणीसाठी तयार होण्याची आम्ही वाट पाहत आहोत. तयार झाल्यावर बटण दाबा.

> hi: नमस्ते {{1}}, हम {{2}} की छत के इंस्टॉलेशन के लिए तैयार होने का इंतज़ार कर रहे हैं। तैयार होने पर बटन दबाएँ।

Examples: Ramesh Patil · Sangli

**Button:** one quick reply: en `It's ready now`; mr `आता तयार आहे`; hi `अब तैयार है`. Payload `rdy:now:<id>`.

### 41. `signed_page_reminder` — **New** (journey: agreed, but the signed page is missing, e.g. the team cancelled it)
Fields: customer, document, home

> en: Hello {{1}}, please send the signed page of your {{2}} for {{3}} again. Tap the button to send it.

> mr: नमस्कार {{1}}, कृपया {{3}} साठीच्या तुमच्या {{2}} चे सही केलेले पान पुन्हा पाठवा. पाठवण्यासाठी बटण दाबा.

> hi: नमस्ते {{1}}, कृपया {{3}} के लिए अपने {{2}} का हस्ताक्षर किया पन्ना फिर से भेजें। भेजने के लिए बटन दबाएँ।

**Button:** one quick reply: en `Send signed page`; mr `सही केलेले पान`; hi `हस्ताक्षर वाला पन्ना`. Payload `jr:<id>`.

All three reminders are off until Meta approves all three languages.

### 42. `subsidy_register_help` — **New** (subsidy: help to register on the PM Surya Ghar portal; also the 2-day reminder)
Fields: customer, home

> en: Hello {{1}}, please register on the PM Surya Ghar portal (pmsuryaghar.gov.in) for your {{2}} solar. It takes about 5 minutes. Keep your latest electricity bill (consumer number, electricity company) and an email ID ready. Tell us when it is done, or ask for help.

> mr: नमस्कार {{1}}, तुमच्या {{2}} सोलरसाठी कृपया पीएम सूर्य घर पोर्टलवर (pmsuryaghar.gov.in) नोंदणी करा. यास सुमारे ५ मिनिटे लागतात. तुमचे ताजे वीज बिल (ग्राहक क्रमांक, वीज कंपनी) आणि ईमेल आयडी जवळ ठेवा. झाल्यावर आम्हाला सांगा, किंवा मदत मागा.

> hi: नमस्ते {{1}}, कृपया अपने {{2}} सोलर के लिए पीएम सूर्य घर पोर्टल (pmsuryaghar.gov.in) पर रजिस्टर करें। इसमें लगभग 5 मिनट लगते हैं। अपना ताज़ा बिजली बिल (उपभोक्ता नंबर, बिजली कंपनी) और ईमेल आईडी पास रखें। हो जाए तो हमें बताएँ, या मदद माँगें।

Examples: Ramesh Patil · Sangli

**Buttons:** two quick replies. en `Done`, `Need help`; mr `झाले`, `मदत हवी`; hi `हो गया`, `मदद चाहिए`. Payloads `stp:ok:<id>`, `stp:alt:<id>`.

### 43. `subsidy_credit_check` — **New** (subsidy: did the money reach the bank; sent by itself when the release step is done; also the 2-day reminder)
Fields: customer, amount, home

> en: Hello {{1}}, did the {{2}} subsidy for your {{3}} solar reach your bank account?

> mr: नमस्कार {{1}}, तुमच्या {{3}} सोलरची {{2}} सबसिडी तुमच्या बँक खात्यात जमा झाली का?

> hi: नमस्ते {{1}}, क्या आपके {{3}} सोलर की {{2}} सब्सिडी आपके बैंक खाते में आ गई?

Examples: Ramesh Patil · ₹78,000 · Sangli

**Buttons:** two quick replies. en `Yes, received`, `Not yet`; mr `हो, मिळाले`, `अजून नाही`; hi `हाँ, मिल गई`, `अभी नहीं`. Payloads `stp:ok:<id>`, `stp:alt:<id>`.

### 44. `bank_sign_visit` — **New** (loan: sign the loan papers at the bank; also the 2-day reminder)
Fields: customer, bank, branch, day

> en: Hello {{1}}, please visit {{2}}, {{3}} on {{4}} to sign the loan papers for your solar.

> mr: नमस्कार {{1}}, कृपया {{4}} रोजी {{2}}, {{3}} येथे जाऊन कर्जाच्या कागदपत्रांवर सही करा.

> hi: नमस्ते {{1}}, कृपया {{4}} को {{2}}, {{3}} जाकर लोन के कागज़ों पर हस्ताक्षर करें।

Examples: Ramesh Patil · HDFC Bank · Sangli main branch · Thu 6 Nov

**Buttons:** two quick replies. en `I'll go`, `Change day`; mr `मी जाईन`, `दिवस बदला`; hi `मैं जाऊँगा`, `दिन बदलें`. Payloads `stp:ok:<id>`, `stp:alt:<id>`.

### 45. `layout_approval` — **New** (design: the roof layout to look at and approve)
Fields: customer, home

The layout (a report or an uploaded document) is the document header.

> en: Hello {{1}}, here is how the panels will sit on your {{2}} roof. Tap Looks good if you are happy, or ask us if you have a question.

> mr: नमस्कार {{1}}, तुमच्या {{2}} छतावर पॅनेल कसे बसतील ते हे आहे. आवडले तर छान आहे दाबा, किंवा प्रश्न असल्यास आम्हाला विचारा.

> hi: नमस्ते {{1}}, आपके {{2}} की छत पर पैनल ऐसे लगेंगे। पसंद हो तो ठीक है दबाएँ, या कोई सवाल हो तो हमसे पूछें।

Examples: Ramesh Patil · Sangli

**Buttons:** two quick replies. en `Looks good`, `I have a question`; mr `छान आहे`, `मला प्रश्न आहे`; hi `ठीक है`, `मेरा सवाल है`.
Payloads `stp:ok:<id>`, `stp:alt:<id>`. The 2-day reminder is `layout_reminder` (49); it stops once the customer has a question (a person is handling it).

### 46. `loan_sanctioned` — **New** (loan: sent by itself when the loan is marked sanctioned; no buttons)
Fields: customer, amount, bank

> en: Hello {{1}}, good news: your loan of {{2}} is sanctioned by {{3}}. We will guide you on the next steps.

> mr: नमस्कार {{1}}, खुशखबर: तुमचे {{2}} चे कर्ज {{3}} ने मंजूर केले आहे. पुढच्या पायऱ्यांसाठी आम्ही मदत करू.

> hi: नमस्ते {{1}}, खुशखबरी: आपका {{2}} का लोन {{3}} ने स्वीकृत कर दिया है। अगले कदम में हम आपकी मदद करेंगे।

Examples: Ramesh Patil · ₹2,00,000 · HDFC Bank

### 47. `loan_disbursed` — **New** (loan: sent by itself for each disbursement recorded; no buttons)
Fields: customer, amount, bank

> en: Hello {{1}}, {{2}} was sent by {{3}} for your solar. Thank you.

> mr: नमस्कार {{1}}, तुमच्या सोलरसाठी {{3}} कडून {{2}} पाठवले गेले. धन्यवाद.

> hi: नमस्ते {{1}}, आपके सोलर के लिए {{3}} की ओर से {{2}} भेजे गए हैं। धन्यवाद।

Examples: Ramesh Patil · ₹1,00,000 · HDFC Bank

### 48. `loan_rejected` — **New** (loan: sent by itself when the loan is marked rejected; a person is also asked to call; no buttons)
Fields: customer, bank, staff

> en: Hello {{1}}, {{2}} did not approve the loan. {{3}} will call you to plan the next steps.

> mr: नमस्कार {{1}}, {{2}} ने कर्ज मंजूर केले नाही. पुढच्या योजनेसाठी {{3}} तुम्हाला फोन करतील.

> hi: नमस्ते {{1}}, {{2}} ने लोन स्वीकृत नहीं किया। आगे की योजना के लिए {{3}} आपको फ़ोन करेंगे।

Examples: Ramesh Patil · HDFC Bank · Priya

All seven are off until Meta approves **all three languages**; then switch each on (and, for 42-45, "Meta approved the version
with file and buttons"), in Settings → WhatsApp messages. The loan messages only go for a project whose loan step ("Bank
loan sanction") has customer messages on.

### 49. `layout_reminder` — **New** (design: the layout was not answered; 2 days after)
Fields: customer, home

> en: Hello {{1}}, a reminder: please look at how the panels will sit on your {{2}} roof and tell us if it looks good. Tap the button to see it again.

> mr: नमस्कार {{1}}, आठवण: तुमच्या {{2}} छतावर पॅनेल कसे बसतील ते कृपया पाहा आणि आवडले का ते सांगा. पुन्हा पाहण्यासाठी बटण दाबा.

> hi: नमस्ते {{1}}, याद दिलाना: आपके {{2}} की छत पर पैनल कैसे लगेंगे, कृपया देखें और बताएँ कि पसंद आया या नहीं। फिर से देखने के लिए बटन दबाएँ।

Examples: Ramesh Patil · Sangli

**Button:** one quick reply: en `See the layout`; mr `आराखडा पाहा`; hi `लेआउट देखें`. Payload `jr:<id>` (the layout again with its two buttons). Off until Meta approves all three languages.

### 50. `self_survey_offer` — **New** (self site survey with a discount; **Marketing** category)
Fields: customer, home, amount

> en: Hello {{1}}, do your own site survey for your {{2}} solar in 5 minutes and get {{3}} off your next payment. Our engineer checks your photos - no visit needed.

> mr: नमस्कार {{1}}, तुमच्या {{2}} सोलरचे साइट सर्वेक्षण स्वतः ५ मिनिटांत करा आणि पुढच्या पेमेंटमध्ये {{3}} सूट मिळवा. आमचे इंजिनिअर तुमचे फोटो तपासतील - भेट देण्याची गरज नाही.

> hi: नमस्ते {{1}}, अपने {{2}} सोलर का साइट सर्वे खुद 5 मिनट में करें और अगले पेमेंट में {{3}} की छूट पाएँ। हमारे इंजीनियर आपकी फ़ोटो जाँचेंगे - विज़िट की ज़रूरत नहीं।

Examples: Ramesh Patil · Sangli · ₹1,000

**Buttons:** two quick replies: en `Start survey`, `Book a visit`; mr `सर्वे सुरू करा`, `भेट बुक करा`; hi `सर्वे शुरू करें`, `विज़िट बुक करें`. Payloads `ss:go:<id>`, `ss:visit:<id>`. **Marketing:** cost per message; never sent to a customer who said STOP. Off until Meta approves all three languages.

### 51. `self_survey_reminder` — **New** (the survey was offered or started and not sent; 2 days after; **Marketing**)
Fields: customer, home

> en: Hello {{1}}, a reminder: your site survey for your {{2}} solar is not finished yet. It takes about 5 minutes. Tap the button to continue.

> mr: नमस्कार {{1}}, आठवण: तुमच्या {{2}} सोलरचे साइट सर्वेक्षण अजून पूर्ण झालेले नाही. यास सुमारे ५ मिनिटे लागतात. पुढे जाण्यासाठी बटण दाबा.

> hi: नमस्ते {{1}}, याद दिलाना: आपके {{2}} सोलर का साइट सर्वे अभी पूरा नहीं हुआ है। इसमें लगभग 5 मिनट लगते हैं। आगे बढ़ने के लिए बटन दबाएँ।

Examples: Ramesh Patil · Sangli

**Button:** one quick reply: en `Continue survey`; mr `सर्वे पुढे करा`; hi `सर्वे आगे बढ़ाएँ`. Payload `ss:go:<id>`. Also sent when the engineer asks for an item again and the 24-hour window is closed. Off until approved.

### 52. `self_survey_approved` — **New** (the survey was approved; **Utility**)
Fields: customer, home, amount (only the clause after "approved": the discount and the payment, or a short thanks)

> en: Hello {{1}}, your site survey for your {{2}} solar is approved. {{3}}

> mr: नमस्कार {{1}}, तुमच्या {{2}} सोलरचे साइट सर्वेक्षण मंजूर झाले. {{3}}

> hi: नमस्ते {{1}}, आपके {{2}} सोलर का साइट सर्वे मंज़ूर हो गया। {{3}}

Examples: Ramesh Patil · Sangli · ₹1,000 off your payment: Before dispatch.

No buttons. The app fills {{3}} in the customer's language. Off until approved. Meta may reject a body ending with a field: if so, add a closing line such as "Thank you." and change the app's wording to match.

### 53. `problem_fixed_check` — **New** (a problem was resolved: "Is it working now?"; **Utility**)
Fields: customer, topic

> en: Hello {{1}}, we have fixed "{{2}}". Is it working now? Tap a button to tell us.

> mr: नमस्कार {{1}}, "{{2}}" आम्ही दुरुस्त केले आहे. आता ते नीट चालते का? सांगण्यासाठी बटण दाबा.

> hi: नमस्ते {{1}}, "{{2}}" हमने ठीक कर दिया है। क्या अब यह ठीक चल रहा है? बताने के लिए बटन दबाएँ।

Examples: Ramesh Patil · inverter

**Buttons:** two quick replies: en `Yes, working`, `Still a problem`; mr `हो, चालू आहे`, `अजून अडचण आहे`; hi `हाँ, चालू है`, `अभी भी समस्या है`. Payloads `fx:y:<id>`, `fx:n:<id>`. Inside 24 hours the chat message goes without this template. While it is off and the window is closed, the older `service_update` ("resolved") still goes.

### 54. `reward_upi_ask` — **New** (a referral reward was approved: share a UPI ID; **Utility**)
Fields: customer, amount

> en: Hello {{1}}, your OneOhm referral reward of {{2}} is approved. Share your UPI ID to receive it.

> mr: नमस्कार {{1}}, तुमचे OneOhm रेफरल बक्षीस {{2}} मंजूर झाले आहे. ते मिळवण्यासाठी तुमचा UPI आयडी द्या.

> hi: नमस्ते {{1}}, आपका OneOhm रेफरल इनाम {{2}} मंज़ूर हो गया है। इसे पाने के लिए अपना UPI आईडी दें।

Examples: Ramesh Patil · ₹2,000

**Button:** one quick reply: en `Share UPI ID`; mr `UPI आयडी द्या`; hi `UPI आईडी दें`. Payload `up:go:<id>` (opens the "Share your UPI ID" form, or asks for it in the chat). Also used when staff say Ask again. While it is off and the window is closed, the plain "referral reward approved" message goes as before.

### 55. `amc_renewal_offer` — **New** (the AMC ends within 30 days; **Marketing** category)
Fields: customer, home, date

> en: Hello {{1}}, the annual maintenance plan for your {{2}} solar ends on {{3}}. Renew it to keep your free visits and cleaning.

> mr: नमस्कार {{1}}, तुमच्या {{2}} सोलरची वार्षिक देखभाल योजना {{3}} रोजी संपते. मोफत भेटी आणि सफाई चालू ठेवण्यासाठी ती नूतनीकरण करा.

> hi: नमस्ते {{1}}, आपके {{2}} सोलर की सालाना देखरेख योजना {{3}} को खत्म होती है। मुफ़्त विज़िट और सफ़ाई जारी रखने के लिए इसे रिन्यू करें।

Examples: Ramesh Patil · Sangli · 12 Dec

**Buttons:** two quick replies: en `Renew AMC`, `Talk to us`; mr `AMC नूतनीकरण`, `आमच्याशी बोला`; hi `AMC रिन्यू करें`, `हमसे बात करें`. Payloads `amc:renew:<id>`, `amc:talk:<id>`. **Marketing:** cost per message; never sent to a customer who said STOP. Off until Meta approves all three languages.

### Newer version: `stage_rating_request` (one rating system, redesign §13)
The approved text and the app wording stay as they are ("... How did we do? Please rate it in the OneOhm app."), so SMS and in-person customers keep the app route. A newer Meta version, submitted under a **new** name, has the body `Hello {{1}}, the {{2}} for your solar project {{3}} is done. How did we do? Tap the button to rate it.` and one quick reply: en `Rate now`; mr `आता रेटिंग द्या`; hi `अभी रेटिंग दें`; payload `rt:go:<id>` (opens the five rating taps in the chat). It sends only behind the template's own **quick replies** switch (with the new Meta name).

### Newer versions of three older templates (buttons on automatic messages, redesign §19)
`installation_started`, `commissioning_completed` and `project_waiting` have a second version with quick replies. The text
bodies do not change. Submit the new version under a **new** Meta name (en, mr, hi), then in Settings → WhatsApp messages
change the Meta name and turn on **Meta approved the version with file and buttons** and the template's own **quick
replies** switch together (as for `payment_reminder`). Until then the older text message keeps sending.
The switches also apply to the Marathi and Hindi names: submit and approve **all three languages together**, give the
Marathi and Hindi templates their own Meta names, and only then switch on; a language not approved yet sends its older
text. In the chat the Pay button reads `Pay ₹X` (the amount); the template's fixed title is `Pay now`.

| Template | Quick replies (en · mr · hi) | Payloads |
|---|---|---|
| `installation_started` | `Project update` · `प्रकल्पाची माहिती` · `प्रोजेक्ट अपडेट` | `go:update` |
| `commissioning_completed` | `Pay now` · `आता भरा` · `अभी भरें`; `Warranty & AMC` · `वॉरंटी आणि AMC` · `वारंटी और AMC` | `pay:<instalment id>` (else `go:payments`), `go:warranty` |
| `project_waiting` | `Send it now` · `आत्ता पाठवा` · `अभी भेजें` | the open ask (`sendit:<id>`, `locreq:<id>`, `pay:<id>`, `jr:<id>`); sent only when a step waiting on the customer has one |

## Staff templates

### 22. `staff_daily_digest` — Changed
Fields: name, overdue, today, followUps

> Good morning {{1}}, here is your OneOhm work summary for today. Overdue tasks: {{2}}. Tasks due today: {{3}}. Lead follow-ups: {{4}}. Open the OneOhm app to see them.

Examples: Priya · 2 · 5 · 3

### 23. `staff_welcome` — New
Fields: name, link

Sent when an admin adds a person, sends the invite again, asks for a new password or adds a
past member back. `{{2}}` is the website for staff, and the field app for resellers and
partners. Turn on with `STAFF_INVITES=on` only after Meta approves it.

> Hi {{1}}, you have been added to the OneOhm team. Open the app here: {{2}}. Sign in with this mobile number. For the website, choose "First time here?" to set your password.

Examples: Priya · https://app.oneohm.in

## Chat template

### 24. `chat_follow_up`
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

## Approved by Meta on 2026-11-03

All are category **Utility**. Fields and their order are the same as the English template.

| Meta name | Languages | Header | Buttons | Use in Settings |
|---|---|---|---|---|
| `quotation_sent_file` | en, mr, hi | Document (quote PDF) | Quick replies: Accept quote / I have a question (mr: कोटेशन स्वीकारा / मला प्रश्न आहे; hi: कोटेशन स्वीकारें / मेरा एक सवाल है) | `quotation_sent`: Meta name, Marathi name and Hindi name = `quotation_sent_file`, switch on |
| `payment_received_file` | en, mr, hi | Document (receipt PDF) | none | `payment_received`: all three names = `payment_received_file`, switch on |
| `project_started` | mr, hi | none | none | Marathi and Hindi names = `project_started` |
| `payment_reminder` | mr, hi | none | none | Marathi and Hindi names = `payment_reminder` (switch stays off) |
| `payment_link` | mr, hi | none | none | Marathi and Hindi names = `payment_link` (switch stays off) |

Wording changes in the new versions:
- `quotation_sent_file` ends with "Tap a button below, or reply here with any question."
- `payment_received_file` ends with "Thank you. Your receipt is attached." (no "OneOhm app" line).

Set the names for one template only when **every** language of it is approved. A file version
sent without its file is refused by Meta.

Not submitted yet: the **Pay now** URL button versions of `payment_link` and `payment_reminder`.
They need the production `API_PUBLIC_URL`, because Meta fixes the URL base at approval.
