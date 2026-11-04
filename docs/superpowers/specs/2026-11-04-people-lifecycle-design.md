# People lifecycle: join, first sign-in, leave

Date: 2026-11-04. Status: draft for approval.

## Why

Today an admin types a first password for every new person and has to tell them that password. Nobody gets a link to the app. When someone leaves, the admin turns off a status switch, and that person's open leads, tasks and projects stay with an account nobody uses. Resellers are added like staff, and nothing stops a payout to someone with no bank details.

OneOhm is one company. This app does not need multi-tenant support.

## Product rules (from the owner)

- Keep it simple, flexible, easy and predictable. Think about the end user first.
- Do not add any new MSG91 templates. Use only the two DLT templates we already have: login OTP and password reset OTP.
- If we need a new message, use WhatsApp. Meta approves WhatsApp templates fast.

## Goals

1. A new person can sign in on day one without ever hearing a password from anyone.
2. "First sign-in" and "Forgot password" are the same screen and the same steps.
3. Admins never see or type anyone's password.
4. When someone leaves, all of their open work moves to one named person in one step, and nothing gets lost.
5. A reseller can't be paid until their payout details are on file.

## Non-goals

- Multi-tenant or org support.
- Email of any kind. The app has no email channel, and we won't add one.
- A public "apply to be a reseller" form. Admins still add resellers. We can add a form later if volume grows.
- Full KYC checks (document upload, verification APIs).

## Anti-goals (this fails even if it works)

- Two different "set password" flows that look different.
- A leave flow that asks the admin to reassign work item by item.
- Hard deletes. History must keep the person's name.

---

## Flow 1: Add a person (staff or reseller)

The admin opens **Team → Add person**. The form has:
- Full name
- Mobile number (now required, because it's how they sign in and reset)
- Email (optional)
- Employee ID (optional)
- Roles
- Reports to

The "first password" field goes away.

On **Add**:
1. Create the user with no password (`password_hash = null`).
2. Send the WhatsApp template `staff_welcome` (new, see below). It contains the person's first name, the app link and how to sign in.
3. The new row shows the badge **Invited, not signed in yet**. The badge goes away on their first successful sign-in (`last_active_at` is set).
4. The row menu gets **Send invite again**. It re-sends the WhatsApp message and is limited to once every 10 minutes.

If the WhatsApp send fails, the row shows **Invite not delivered**, with the same re-send action and a **Copy invite text** fallback. Then the admin can paste the text anywhere.

### New WhatsApp template `staff_welcome` (category: utility)

> Hi {{1}}, you have been added to the OneOhm team. Open the app here: {{2}}. Sign in with this mobile number. For the website, choose "First time here?" to set your password.

- `{{1}}` is the first name.
- `{{2}}` is the field-app link (`FIELD_APP_URL`) only when every role the person holds is a reseller or partner role. Anyone with a staff role gets the website link (`WEB_BASE_URL`), with or without an email, because the website accepts a mobile number.

This is one of two new WhatsApp templates (the other is `contact_changed`, below). There is no new SMS template.

## Flow 2: First sign-in and Forgot password (one flow)

**Mobile field app:** nothing changes. The person enters their mobile number and gets the existing **login OTP** SMS. They're in. A password is never needed on mobile.

**Web, every day:** sign in with email, employee ID **or mobile number**, plus the password. The SMS code is used only to set or reset the password, never for daily web sign-in. Mobile number is now accepted because many people have no email or employee ID. Without it, a phone-only person could set a password and still have nothing to type in the first box.

**Web:** the sign-in card keeps its identifier and password fields. It adds one quiet link under the button: **First time here, or forgot your password?**

The link opens a 3-step card:
1. **Your mobile number.** Enter the number and tap **Send code**. This sends the existing **password reset OTP** SMS (`MSG91_PASSWORD_RESET_TEMPLATE_ID`). Unknown or inactive numbers get the same "If this number is on the team, a code is on its way" answer, and no SMS is sent.
2. **Enter the 6-digit code.** The code expires in 5 minutes, with a resend timer.
3. **Choose a password.** Use at least 8 characters, with a show or hide toggle. There are no symbol rules. After **Save**, the person is signed in straight away and lands on their home screen.

On the password field, if they type a password while their account has no password yet, the error says: "You haven't set a password yet. Tap 'First time here?' below." The error doesn't say "wrong password". This tells new people where to go without leaking anything useful. My call: this applies only after the identifier matches an active user with a null password. Every other case keeps the single generic error, so the message adds no real attack surface beyond "this account exists". That is acceptable for an internal staff app.

The rules:
- Saving a new password signs the person out on every other device.
- The OTP budget (`OTP_REQUESTS_PER_10_MIN`) is separate for purpose `password_reset`, so it can't be used to drain login OTPs.
- Wrong codes count toward the existing lockout.
- Audit entries: `auth.password_set` for the first time, and `auth.password_reset` after that.

**Old email-only accounts (no phone):** they keep working with their current password. If they choose "forgot", the card says "Ask your admin to add your mobile number." My call: we don't migrate them.

## Flow 3: Admin "reset password"

In the person's edit sheet, the admin's password box becomes one button: **Make them set a new password**. It clears the password, signs the person out everywhere and re-sends `staff_welcome`. The admin never types a password again.

## Flow 4: Reseller payout details

- In the field app, the reseller profile gets a **Payout details** card with these fields: name on account, bank account number and IFSC, or UPI ID, plus PAN.
- Until those details are filled in, the reseller home screen shows one banner: **Add payout details to get paid**.
- Finance can't mark a commission entry **paid** for a reseller with no payout details. The button is disabled and says why. Pending and approved entries still work as normal.
- Account numbers and PAN show masked (`••••1234`) everywhere except to people with `finance.record_payments`.
- Changing the details writes an audit entry and notifies finance. This guards against payout redirection.

## Flow 5: Someone leaves

**Team → person → Remove from team** replaces the raw status switch. The API refuses the old switch: `PATCH /people/:id` with `status: 'inactive'` returns 409 `use_remove` ("Use Remove from team so their work is handed over."), and `status: 'active'` on a past member returns 409 `use_rejoin`.

The removal sheet shows:
- **What they have open**, as counts: leads they own, tasks, service requests, DISCOM requests, projects they manage, project teams they're on, and people who report to them. For a reseller, it also shows pending and approved commission entries.
- **Hand everything to:** one person picker. It defaults to their manager and offers active staff only.
- **Last working day:** a date that defaults to today.
- One button: **Remove and hand over**.

In one transaction:
1. Open leads, tasks, service requests and DISCOM requests get the new owner. Each project and lead gets a note: "Handed over from Asha (left the team)". Project manager slots and project team memberships move to the new person. Their direct reports now report to the new person.
2. The status is set to `inactive`, and the `left_on` date is stored. `left_on` is a new nullable column.
3. Sessions are deleted, push devices are removed and open OTP challenges are cancelled.
4. For a reseller, their per-reseller commission rules stay on, so leads they brought in still earn. Approved entries stay payable, because we still owe them. Pending entries stay for finance to decide. Leads they brought in keep the reseller attribution, including leads they owned that move to the new owner.
5. The new owner gets one notice: "You are now covering Asha's work: 12 leads, 4 tasks…". This reuses the leave-cover notice pattern.
6. An audit entry is written: `person.removed`.

The last Super Admin still can't be removed. The existing guard stays.

**History:** old records keep the person's name with a small **Left** tag. Removed people are hidden from pickers and the team list by default, and a **Show past members** filter brings them back.

**Bring back:** a past member has **Add back to team**. It sets them active, clears their password, clears `left_on` and re-sends `staff_welcome`. Work isn't moved back.

---

## Edge cases

### Joining
- **The number belongs to a past member.** Phone numbers are unique, and company SIMs get passed to new joiners. In that case, Add person says "This number belongs to Asha (left on 3 Oct)." It offers two buttons:
  - **Add Asha back**, which is the rejoin case.
  - **Give the number to the new person**, which removes the number from Asha's record.

  It never fails with a raw "already exists" error.
- **The number belongs to an active member.** Add person shows a plain error with their name.
- **The person has no WhatsApp on that number.** The invite shows **Invite not delivered**, with **Copy invite text** as a fallback. The SMS reset flow still works without the invite.
- **The WhatsApp template is not approved yet at launch.** Invites stay off with a setting, and the admin uses **Copy invite text**. Nothing else is blocked.
- **The SMS wording says "reset".** The DLT template text is fixed. The screen above the code box says "We sent a code to set your password", so a new joiner isn't confused.
- **The admin changes someone's mobile number.** Sign them out of the mobile app, because the old number may belong to someone else now.
- **Existing people with admin-made passwords.** They keep working. My call: no forced change.

### Leaving
- **Open work is wider than leave cover.** Handover also moves:
  - WhatsApp chats assigned to them (`wa_conversations.assigned_user_id`)
  - tasks where they are the proposed person (`project_tasks.proposed_user_id`)
  - leave approvals waiting on them (`leave_manager_reviews` in state `waiting`)
- **They are someone's leave backup.** For approved upcoming leave where they are the backup, the backup becomes the new owner, and the person on leave is told.
- **Their own pending leave requests** are cancelled.
- **Reporting loop.** If the new owner is one of the leaver's direct reports, that one person moves to the leaver's own manager, or to no manager. They can't report to themselves.
- **Bad picks are blocked.** You can't hand work to the leaver, to an inactive person or to a reseller. You can't remove yourself. The last Super Admin can't be removed. If the target is removed at the same moment, the save fails with "Pick someone else", because the target row is locked in the transaction.
- **Sole holder of a key permission.** If they are the only active person with `finance.approve_payments`, `people.manage` or `roles.manage`, the sheet warns "Nobody else can approve payments after this" before the confirm. It warns but doesn't block.
- **Last working day.** Only today or an earlier date is allowed. Scheduling a future removal is out of scope. The admin removes them on the day.
- **Money owed to them.** Salary and bonus payables (`payables.party_user_id`) and approved commissions stay payable. Nothing is cancelled.
- **A reseller who left still has money owed.** They can't sign in any more. Finance can add or fix their payout details for them, and the edit is audited.
- **A lead that a removed reseller brought in wins later.** The commission entry is still made as **pending**, and finance approves or rejects it as usual. My call: they brought the customer in.
- **History rows** (created by, approved by, visit reports, points) keep pointing at the person. They are never moved.

### Work in progress at the moment of removal
- **They are checked in on a site.** An open `site_visits` row with no check-out is closed at removal time, with the note "Closed: person left the team".
- **They are clocked in today.** The `attendance_days` row is closed at removal time, so they don't show up as "still working".
- **Location tracking stops.** Their `location_consents` are revoked, and push devices are removed. We never keep tracking someone who has left.
- **Tasks keep their progress.** Status, photos and checklist steps stay as they are. Only the assignee changes, so the new owner continues from where the leaver stopped.

### Points, bonuses and claims (their earnings)
- **Points stay with the person who earned them.** They are never moved to the new owner.
  - Approved points stay in history.
  - Pending points still wait for the manager's normal decision.
  - Removed people are hidden from the live leaderboard. They still show in past-period reports.
- **Things still owed to them stay open**: pending travel claims, project bonus shares, payables and approved commissions.
- **Final settlement list.** The removal sheet shows these items as one list: "Still to settle for Asha: 2 travel claims (₹1,840), 1 bonus share (₹5,000), 40 pending points." After removal, finance sees the same list on the person's past-member page. My call: nothing is cancelled automatically, so money owed is never lost by accident.

### Customer communication
- **The customer app shows the new contact automatically.** The customer home reads the project manager's name and phone from `projects.manager_user_id` (`customer-home.ts:90`). Once the manager slot moves, the customer sees the new person's name and number straight away.
- **Customers are told once, on WhatsApp.** The removal sheet has a checkbox, on by default: **Tell customers who their new contact is**. Each customer whose project manager, open service request or open lead owner changed gets one message, deduped per phone number. It uses a new utility template `contact_changed`:
  > Hi {{1}}, {{2}} is now your OneOhm contact for {{3}}. You can call them on {{4}}, or reply here any time.
  
  This is the second new WhatsApp template. There is still no new SMS template. Leads in the early stages (`new`, not yet contacted) are skipped, because they don't know anyone yet.
- **WhatsApp chats go to the new owner.** The assistant picks who answers as `assignedUserId ?? handledByUserId` (`whatsapp/assistant/hand-over.ts:146`). `answererFor` (`packages/database/src/chat-answerer.ts:40`) already skips inactive people, but then it falls back to "the team" with no name. The handover moves both `assigned_user_id` and `handled_by_user_id` from the leaver to the new owner, so the customer's chat has a named person straight away. The assistant code doesn't change.
- **Messages in the queue.** Pending `outbox` rows addressed to the leaver (staff digests, reminders, alerts) are marked `skipped`. Customer messages already queued are not rewritten, because the queue drains in minutes.
- **The leaver's personal phone.** Customers who saved the leaver's personal number may still call them. The app can't stop that. The `contact_changed` message is our answer, so the customer has the right number from the company.

## Constraints

- Follow the style of `affectedWork` (`apps/api/src/modules/workforce/leave-impact.ts`) and `handOverWork` (`leave-handover.ts`). Don't extend them. Both are tied to a leave date window and a leave row, while removal moves **all** open work. Removal gets its own `people/departure/` files, and the notes and notices use the same wording style.
- Reuse `otp_challenges` with `purpose = 'password_reset'`.
- Add `MSG91_PASSWORD_RESET_TEMPLATE_ID` to `apps/api/src/config/environment.ts`. Production needs it whenever `OTP_PROVIDER=msg91`. Dev mode logs the code, as it does today.
- Secrets live in `.env` only, and never in git.
- WhatsApp goes through the existing outbox and worker path, not a direct call from the API.

## Left to the builder

- Exact component layout. Follow the existing sign-in card and team sheets.
- Migration naming and order.
- The payout-details table shape. My call: a separate `reseller_payout_details` table, one row per reseller, not columns on `users`.

## Decisions made without asking (please check)

1. Mobile number is required for new people.
2. One handover target for everything, not per type.
3. No public reseller application form, and no KYC beyond PAN and bank details.
4. Mobile keeps OTP-only sign-in. Passwords are for the website only.
5. One new WhatsApp template, `staff_welcome`. No new SMS templates.
6. Web sign-in also accepts the mobile number.
7. A removed reseller's lead that wins later still makes a pending commission. Their commission rules stay on, not archived, so this works.
8. Removal happens today only. There is no scheduled future removal.
9. Points stay with the person who earned them, and nothing owed to them is cancelled automatically.
10. A second WhatsApp template, `contact_changed`, tells customers about their new contact. It is on by default, and the admin can turn it off.
