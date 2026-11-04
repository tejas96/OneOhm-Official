# People Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New people set their own web password with an SMS code, admins never handle passwords, resellers can't be paid without payout details, and removing someone hands all of their open work, chats and customers to one named person.

**Architecture:** There are three parts. Each part lands and ships on its own, in this order: **A** sign-in and invites, **B** reseller payout details, **C** removal and handover.
- Server logic lives in NestJS services, with pure rules in small files that get unit tests.
- Database behaviour is proven by acceptance scenarios against the throw-away database.
- WhatsApp goes through the existing `outbox` and worker. SMS goes through the existing MSG91 OTP sender, using only the two DLT templates we already have.

**Tech Stack:** NestJS 11, Drizzle ORM and drizzle-kit (Postgres), ts-rest and zod contracts, Next.js web with next-intl, the Expo field app, vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-11-04-people-lifecycle-design.md`. Read it before any task. Its "Edge cases" section is part of the requirements.

## Global Constraints

- Add no new MSG91 templates. Login OTP uses `MSG91_LOGIN_TEMPLATE_ID`. Set or reset password uses `MSG91_PASSWORD_RESET_TEMPLATE_ID`.
- Add only two new WhatsApp templates: `staff_welcome` (staff audience, utility) and `contact_changed` (customer audience, utility). Use the template text in the spec exactly.
- OTP is 6 digits, expires in 300 seconds and allows 5 wrong tries. `OTP_REQUESTS_PER_10_MIN` is counted separately for purpose `password_reset`.
- Passwords need at least 8 characters, with no symbol rules.
- Every handwritten source file must be 250 lines or fewer (`pnpm check:file-size`). `people.service.ts` is already at 242 lines, so new logic goes in new files.
- Never hard-delete a user. Past members keep their name on old records.
- Secrets live in `.env` only. Never commit MSG91 keys.
- All UI copy goes in `apps/web/messages/en-IN/*.json` or the field app's word files. Keep it plain and short, with one action per screen.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The phone number is typed in different ways** (`98765 43210`, `+91 9876543210`, `09876543210`). Sign-in, the password code and Add person must all match the same person. The test sits in A3.
2. **Someone asks for a password code for an unknown or inactive number.** They get the same 202 answer, no SMS is sent and no challenge row is made. The test sits in A2.
3. **Two admins remove people at the same moment, and one picks the other leaver as the target.** One request must fail with `target_not_active`, and no work may land on an inactive person. The test sits in C3.
4. **The new owner is one of the leaver's direct reports.** No reporting line may point a person at themselves. The DB check `reporting_lines_not_self` would throw. The test sits in C1 and C3.
5. **Finance tries to pay a reseller who has a PAN but only half their bank details.** It must be blocked with `payout_details_missing`. The test sits in B1 and B2.

---

## Part A: First sign-in and invites

### Task A1: Password-reset template and OTP purpose

**Files:**
- Modify: `apps/api/src/config/environment.ts:30-33,166`
- Modify: `apps/api/src/config/environment.test.ts`
- Modify: `apps/api/src/modules/auth/otp-sender.ts`
- Create: `apps/api/src/modules/auth/otp-sender.test.ts`
- Modify: every caller of `OtpSender.send` (`auth.service.ts:91`, `customer-portal/customer-auth.service.ts:48`)

**Interfaces:**
- Produces: `type OtpPurpose = 'login' | 'password_reset'`; `OtpSender.send(phoneE164: string, code: string, purpose: OtpPurpose): Promise<void>`; `templateIdFor(env: Pick<Environment, 'MSG91_LOGIN_TEMPLATE_ID' | 'MSG91_PASSWORD_RESET_TEMPLATE_ID'>, purpose: OtpPurpose): string`.

- [ ] **Step 1: Write the failing tests.**
  - `otp-sender.test.ts › picks the reset template for password_reset`: `templateIdFor({ MSG91_LOGIN_TEMPLATE_ID: 'L', MSG91_PASSWORD_RESET_TEMPLATE_ID: 'R' }, 'password_reset')` returns `'R'`, and `'login'` returns `'L'`.
  - `environment.test.ts › msg91 needs the reset template`: parsing with `OTP_PROVIDER: 'msg91'`, a key and a login template but no `MSG91_PASSWORD_RESET_TEMPLATE_ID` throws a message that contains `MSG91_PASSWORD_RESET_TEMPLATE_ID`.
- [ ] **Step 2: Run the tests.** Run `pnpm --filter @oneohm/api test -- otp-sender environment`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add `MSG91_PASSWORD_RESET_TEMPLATE_ID: z.string().optional()` to the environment.
  - `createOtpSender` throws `'OTP_PROVIDER=msg91 needs MSG91_AUTH_KEY, MSG91_LOGIN_TEMPLATE_ID and MSG91_PASSWORD_RESET_TEMPLATE_ID.'` when one is missing.
  - `Msg91OtpSender` keeps both IDs and uses `templateIdFor` for each send.
  - `LocalOtpSender` logs the purpose with the code.
  - Existing callers pass `'login'`. Customer OTP keeps the login template.
- [ ] **Step 4: Run the tests.** Same command. Expected: PASS. Also run `pnpm --filter @oneohm/api typecheck` and expect no errors.
- [ ] **Step 5: Commit.** `git commit -m "feat(auth): send password codes with the DLT reset template"`

### Task A2: Set-password API (first time and forgot)

**Files:**
- Create: `apps/api/src/modules/auth/session-issuer.ts`. Move `issueSession` out of `auth.service.ts:176-185` into it.
- Create: `apps/api/src/modules/auth/password-setup.service.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` to use `issueSession` from the new file.
- Modify: `apps/api/src/modules/auth/auth.controller.ts` and `auth.module.ts`
- Modify: `packages/api-contracts/src/contracts/auth.contract.ts`
- Test: `apps/api/test/acceptance/scenarios/52-first-sign-in.acceptance.ts`

**Interfaces:**
- Consumes: `OtpSender.send(..., 'password_reset')` from A1.
- Produces:
  - `issueSession(db: Database, env: Environment, userId: string, client: 'web' | 'mobile'): Promise<IssuedSession>`
  - Contract `requestPasswordCode`: `POST /auth/password/code`, body `{ phone: phoneSchema }`, responds `202 { expiresInSeconds: number }`.
  - Contract `setPassword`: `POST /auth/password`, body `{ phone: phoneSchema, code: /^\d{6}$/, password: string.min(8, 'Use at least 8 characters.') }`, responds `200 { user: currentUserSchema }` and sets the web session cookie the same way `signIn` does.
  - `PasswordSetupService.requestCode(phoneE164: string): Promise<{ expiresInSeconds: number }>`
  - `PasswordSetupService.setPassword(phoneE164: string, code: string, password: string, ip: string | null): Promise<IssuedSession>`

- [ ] **Step 1: Write the failing acceptance scenario `52-first-sign-in`.**
  - `a new person with no password sets one and is signed in`:
    1. Make a person with `ownPerson`.
    2. POST `/auth/password/code` returns 202.
    3. Read the code from the dev log, or set `OTP_DEVELOPMENT_CODE` the way the existing OTP scenarios do.
    4. POST `/auth/password` returns 200 with `user.id` equal to the person.
    5. Then `/auth/sign-in` with phone and new password returns 200.
  - `the first set writes auth.password_set, a later one writes auth.password_reset`: count rows in `audit_log` by action.
  - `setting a password signs out every other session`: hold an earlier session, set the password, and expect the old session's `/auth/me` to return 401.
  - `unknown and inactive numbers get 202 and no challenge`: expect 202, and `otp_challenges` has 0 rows for that phone with `purpose = 'password_reset'`.
  - `a wrong code counts toward lockout and the code dies after 5 tries`: after 5 wrong tries, the right code returns 401 `bad_code`.
  - `password budget is separate from login budget`: use up `OTP_REQUESTS_PER_10_MIN` on `/auth/otp`, and `/auth/password/code` still returns 202 with a challenge row.
- [ ] **Step 2: Run the scenario.** Run `pnpm test:acceptance 52-first-sign-in`. Expected: FAIL with 404 on `/auth/password/code`.
- [ ] **Step 3: Implement `PasswordSetupService`.**
  - It mirrors `requestOtp` and `verifyOtp`, with `otpChallenges.purpose = 'password_reset'` and `assertOtpBudget(db, phone, 'password_reset', env.OTP_REQUESTS_PER_10_MIN)`.
  - It only acts on `users.status = 'active'`.
  - On success, in one transaction: set `passwordHash`, delete all of the user's `sessions` and write the audit entry (`auth.password_set` when the old hash was null, otherwise `auth.password_reset`). Then `issueSession(..., 'web')`.
- [ ] **Step 4: Run the scenario.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(auth): set or reset a web password with an SMS code"`

### Task A3: Sign in with a mobile number, and a "not set yet" hint

**Files:**
- Create: `apps/api/src/modules/auth/sign-in-identifier.ts` and `sign-in-identifier.test.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts:41-73`
- Modify: `packages/api-contracts/src/contracts/auth.contract.ts:13`. The hint becomes "Enter your email, employee ID or mobile number."
- Test: add to `52-first-sign-in.acceptance.ts`

**Interfaces:**
- Produces: `parseIdentifier(raw: string): { kind: 'email' | 'code' | 'phone'; value: string }`. Phones become E.164 `+91XXXXXXXXXX`.

- [ ] **Step 1: Write the failing tests.**
  - `sign-in-identifier.test.ts`:
    - `'98765 43210'`, `'+91 98765 43210'`, `'09876543210'` and `'919876543210'` all return `{ kind: 'phone', value: '+919876543210' }`.
    - `' Asha@OneOhm.in '` returns `{ kind: 'email', value: 'asha@oneohm.in' }`.
    - `'EMP-12'` returns `{ kind: 'code', value: 'emp-12' }`.
  - In the acceptance file:
    - `sign in with mobile and password`: returns 200.
    - `an active person with no password gets password_not_set`: returns 401 with code `password_not_set` and the message `You haven't set a password yet. Tap "First time here?" below.`
    - `a wrong password for a person who has one keeps bad_credentials`.
- [ ] **Step 2: Run the tests.** Run `pnpm --filter @oneohm/api test -- sign-in-identifier`, then `pnpm test:acceptance 52-first-sign-in`. Expected: FAIL.
- [ ] **Step 3: Implement.** `signInWithPassword` matches on the parsed kind. It throws `password_not_set` only when the user is found, active, and `passwordHash` is null. The failed attempt is still recorded.
- [ ] **Step 4: Run the tests.** Same commands. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(auth): web sign-in by mobile number; tell new people to set a password"`

### Task A4: Add a person with no password, plus WhatsApp invites

**Files:**
- Modify: `packages/domain/src/messaging/message-templates.ts:140-146`. Add `staff_welcome` with audience `staff`, fields `['name', 'link']` and preview copied from the spec.
- Create: `packages/domain/src/identity/invite-text.ts` and `invite-text.test.ts`
- Modify: `apps/api/src/config/environment.ts`. Add `FIELD_APP_URL: z.string().url().default('http://localhost:8081')` and `STAFF_INVITES: z.enum(['on', 'off']).default('off')`.
- Create: `apps/api/src/modules/people/person-invite.ts`
- Modify: `apps/api/src/modules/people/people.service.ts` (create and the unique check), `people.controller.ts` and `people-read.ts`
- Modify: `packages/api-contracts/src/contracts/people.contract.ts` and `packages/api-contracts/src/schemas/identity.schema.ts:27-49`
- Modify: `apps/api/src/modules/people/person-fields.ts`. Drop `password`.
- Test: `apps/api/test/acceptance/scenarios/53-invites.acceptance.ts`. Update the helper `apps/api/test/acceptance/support/team.ts` `ensurePerson` if it sends a password.

**Interfaces:**
- Produces:
  - `inviteText(firstName: string, link: string): string`. This is the exact `staff_welcome` body with the values filled in.
  - `inviteLink(roleKinds: readonly RoleKind[], env): string`. It returns `FIELD_APP_URL` when every role kind is `reseller` or the person has no email, otherwise `WEB_BASE_URL`.
  - `queueInvite(tx, env, user: { id: string; fullName: string; phoneE164: string; roleKinds: RoleKind[] }): Promise<void>`. It inserts an `outbox` row with channel `whatsapp`, template `staff_welcome`, payload `{ name, link }` and dedupe key `staff_welcome:${userId}:${Date.now()}`. When `STAFF_INVITES = 'off'`, it does nothing.
  - `Person` gains these fields:
    - `invite: 'not_signed_in' | 'signed_in'` (it is `signed_in` when `last_active_at` is not null)
    - `inviteDelivery: 'sent' | 'failed' | 'queued' | null` (from the newest outbox row with a `staff_welcome:${id}:` key)
    - `inviteText: string | null` (only while `not_signed_in`)
    - `leftOn: string | null` (filled in by Part C. Read it as null until then.)
  - `createPerson` body: `phone` is required (`phoneSchema`), `password` is removed and `email` stays optional.
  - `updatePerson` body: `password` is removed. Add `requireNewPassword: z.literal(true).optional()`.
  - `POST /people/:id/invite` responds 202. It returns 409 `invite_too_soon` within 10 minutes of the last invite, and 409 `already_signed_in` after the first sign-in.
  - `POST /people/:id/release-phone` responds 200 `Person`. It only works on an inactive person, sets their phone to null and writes the audit entry `person.phone_released`.
  - The unique check's phone conflict carries code `phone_of_past_member` with `details: { userId, fullName, leftOn }` when the holder is inactive. When the holder is active it keeps `duplicate_phone` and the message `This mobile number belongs to {fullName}.`

- [ ] **Step 1: Write the failing tests.**
  - `invite-text.test.ts`: `inviteText('Asha', 'https://app.oneohm.in')` equals the spec's sentence with those values filled in.
  - `53-invites`:
    - `create needs a phone and takes no password`: no phone returns 400, and a password field is ignored or rejected.
    - `create queues one staff_welcome when invites are on`: 1 outbox row.
    - `resend inside 10 minutes is refused`: 409 `invite_too_soon`.
    - `requireNewPassword clears the hash, signs out, re-queues the invite`.
    - `a past member's number gives phone_of_past_member, release-phone frees it, then create works`.
    - `changing someone's phone deletes their mobile sessions only`.
- [ ] **Step 2: Run the tests.** Run `pnpm --filter @oneohm/domain test -- invite-text`, then `pnpm test:acceptance 53-invites`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `create` calls `queueInvite` inside its transaction.
  - `update` with `requireNewPassword` sets `passwordHash: null`, deletes the sessions and calls `queueInvite`.
  - A phone change deletes sessions where `client = 'mobile'`.
  - Put the new endpoints in `person-invite.ts` so `people.service.ts` stays at 250 lines or fewer.
  - Run the acceptance scenarios with `STAFF_INVITES=on`.
- [ ] **Step 4: Run the tests.** Same commands, plus `pnpm check:file-size`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(people): add people without a password; WhatsApp invite"`

### Task A5: Web screens for sign-in and the team

**Files:**
- Create: `apps/web/src/features/auth/set-password-form.tsx`, with three steps: phone, code, password.
- Modify: `apps/web/src/features/auth/sign-in-form.tsx`. Add the link and the `password_not_set` hint, and change the identifier hint.
- Create: the route `apps/web/src/app/(auth)/sign-in/set-password/page.tsx`. Follow the sibling `page.tsx`.
- Modify: `apps/web/src/features/team/add-person-dialog.tsx`, `person-row.tsx` and `edit-person-sheet.tsx`
- Modify: `apps/web/messages/en-IN/sign-in.json` and `team.json`

**Interfaces:**
- Consumes: the A2 to A4 contracts.

- [ ] **Step 1: Sign-in.**
  - Under the button, add the link `First time here, or forgot your password?`. It goes to `/sign-in/set-password`.
  - The set-password card:
    - Step 1 asks for the mobile number, with the button `Send code`.
    - Step 2 has the line `We sent a code to set your password`, a 6-digit box and a 30-second resend timer.
    - Step 3 has a password field with a show or hide toggle, the hint `At least 8 characters` and the button `Save and sign in`.
    - After saving, `router.replace('/')`.
    - If the account has no phone, show the copy `Ask your admin to add your mobile number.` after a 202 with no code arriving. My call: show it as a quiet hint under step 2 after 60 seconds.
  - On `password_not_set`, show the API message. The "First time here?" link stays visible.
- [ ] **Step 2: Add person.**
  - Remove the password field. Mark mobile as required.
  - On `phone_of_past_member`, show `This number belongs to {name} (left on {date}).` with two buttons: `Add {name} back` (wired in Part C, Task C5) and `Give the number to the new person`. The second calls release-phone, then retries create.
- [ ] **Step 3: Person row and edit sheet.**
  - Badges:
    - `Invited, not signed in yet` when `invite = 'not_signed_in'`
    - `Invite not delivered` when `inviteDelivery = 'failed'`
  - Row menu: `Send invite again` and `Copy invite text`. Copy uses `navigator.clipboard` with `person.inviteText`.
  - Edit sheet: replace the password box with the button `Make them set a new password`. Confirm with the line `They will be signed out and get a new invite.`
- [ ] **Step 4: Verify.** Run `pnpm --filter @oneohm/web typecheck && pnpm lint`. Expect no errors. Then start the web preview and walk through Add person, the badge, the set-password flow (with `OTP_DEVELOPMENT_CODE`) and signing in by mobile number. Screenshot each.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): set-password flow and invite badges"`

---

## Part B: Reseller payout details

### Task B1: Payout-details rules and table

**Files:**
- Create: `packages/domain/src/commissions/payout-details.ts` and `payout-details.test.ts`. Export them from the domain index.
- Create: `packages/database/src/schema/reseller-payouts.schema.ts`. Export it from the schema index.
- Generate: the migration via `pnpm --filter @oneohm/database db:generate --name reseller_payout_details`

**Interfaces:**
- Produces:
  - Table `reseller_payout_details`:
    - `user_id` (uuid, primary key, references users and cascades)
    - `bank_account_name`, `bank_account_number`, `bank_ifsc`, `upi_id` and `pan` (all nullable text)
    - `updated_by_user_id`
    - `updated_at`
    
    The column names match the vendors and contractors bank columns.
  - `interface PayoutDetails { bankAccountName: string | null; bankAccountNumber: string | null; bankIfsc: string | null; upiId: string | null; pan: string | null }`
  - `payoutDetailsComplete(d: PayoutDetails | null): boolean`. True when `pan` is set and either the UPI ID is set or all three bank fields are set.
  - `maskAccount(value: string | null): string | null`. It returns `'••••' + last 4` characters.
  - `payoutDetailsProblems(d: PayoutDetails): Partial<Record<keyof PayoutDetails, string>>`. The format checks:
    - PAN `/^[A-Z]{5}[0-9]{4}[A-Z]$/`
    - IFSC `/^[A-Z]{4}0[A-Z0-9]{6}$/`
    - UPI `/^[\w.-]{2,}@[a-zA-Z]{2,}$/`
    - account number 9 to 18 digits

    Values are trimmed and uppercased before the check.

- [ ] **Step 1: Write the failing tests.**
  - `complete with PAN + UPI`.
  - `complete with PAN + all bank fields`.
  - `not complete: PAN + account number but no IFSC`.
  - `not complete: no PAN`.
  - `maskAccount('123456781234') === '••••1234'`.
  - `abcde1234f is fixed to ABCDE1234F and passes`.
  - `IFSC 'SBIN1234567' fails`, because its fifth character must be 0.
- [ ] **Step 2: Run the tests.** Run `pnpm --filter @oneohm/domain test -- payout-details`. Expected: FAIL.
- [ ] **Step 3: Implement.** Write the functions and the table, then generate the migration.
- [ ] **Step 4: Run the tests.** Same command. Expected: PASS. Run `pnpm --filter @oneohm/database db:migrate` and expect it to apply cleanly.
- [ ] **Step 5: Commit.** `git commit -m "feat(commissions): reseller payout details table and rules"`

### Task B2: Payout-details API, plus the block on paying

**Files:**
- Create: `apps/api/src/modules/commissions/payout-details.service.ts`
- Modify: `apps/api/src/modules/commissions/commissions.controller.ts` and `commission-entries.service.ts:112-123`
- Modify: `packages/api-contracts/src/contracts/commissions.contract.ts`. Also add `payoutReady: boolean` to the commission entry schema.
- Test: `apps/api/test/acceptance/scenarios/54-reseller-payout-details.acceptance.ts`

**Interfaces:**
- Consumes: B1.
- Produces:
  - `GET /resellers/:id/payout-details` returns `PayoutDetails & { complete: boolean }`. Account number and PAN come back masked unless the actor has `finance.record_payments`.
  - `PUT /resellers/:id/payout-details` with a `PayoutDetails` body returns the same shape.
  - Both endpoints are allowed for the reseller themselves (`actor.userId === id`) or for an actor with `finance.record_payments`. Anyone else gets 403.
  - On save:
    - write the audit entry `reseller.payout_details_saved`, with field names only and no values
    - `notify` every active holder of `finance.record_payments` with kind `payout_details_changed` and the title `{name} changed their payout details`, but only when the reseller saved their own details
  - `pay()` throws `conflict("Add {name}'s payout details before marking this paid.", 'payout_details_missing')` when the details are not complete.

- [ ] **Step 1: Write the failing scenario.**
  - `reseller saves own details and sees them masked`.
  - `finance sees them unmasked`.
  - `another staff member gets 403`.
  - `pay is blocked until complete, then works`.
  - `half bank details + PAN still blocks pay`.
  - `finance is told when the reseller changes details`.
  - `finance can fill details for an inactive reseller`.
- [ ] **Step 2: Run the scenario.** Run `pnpm test:acceptance 54-reseller-payout-details`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces above.
- [ ] **Step 4: Run the scenario.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(commissions): payout details; block paying without them"`

### Task B3: Payout-details screens

**Files:**
- Create: `apps/field/src/features/profile/payout-details-card.tsx`
- Modify: `apps/field/src/features/profile/profile-screen.tsx` and `apps/field/src/features/reseller/earnings-screen.tsx` (the banner)
- Modify: the web finance commission list under `apps/web/src/features/team/resellers/`. Disable "Mark paid" when `!payoutReady` and show the tooltip `Payout details missing`. Add a `Payout details` panel for finance.

- [ ] **Step 1: Field app.**
  - The card has a choice between `Bank account` and `UPI`, plus a PAN field.
  - Field errors come from `payoutDetailsProblems`.
  - Saved values show masked, with the button `Change`.
  - On the earnings screen, show the banner `Add payout details to get paid` until the details are complete. Tapping it opens the card.
- [ ] **Step 2: Web.** Make the disabled pay button and the finance panel.
- [ ] **Step 3: Verify.** Run `pnpm --filter @oneohm/field typecheck && pnpm --filter @oneohm/web typecheck && pnpm lint`. Expect no errors. Preview the web finance list and screenshot the disabled button.
- [ ] **Step 4: Commit.** `git commit -m "feat(reseller): payout details card and banner"`

---

## Part C: Removal and handover

### Task C1: The `left_on` column and the pure removal rules

**Files:**
- Modify: `packages/database/src/schema/identity.schema.ts:15-39`. Add `leftOn: calendarDate('left_on')`. Generate the migration `--name user_left_on`.
- Create: `apps/api/src/modules/people/departure/departure-rules.ts` and `departure-rules.test.ts`
- Modify: `apps/api/src/modules/people/people-read.ts`. Fill in `leftOn`.

**Interfaces:**
- Produces:
  - `checkRemoval(input: { actorId: string; leaverId: string; target: { id: string; status: 'active' | 'inactive'; kinds: RoleKind[] } | null; lastWorkingDay: string; today: string }): RemovalProblem | null`
    - `RemovalProblem` is one of: `'remove_self' | 'target_is_leaver' | 'target_not_active' | 'target_is_reseller' | 'future_date'`.
    - `target_is_reseller` applies when every role kind is `reseller`.
  - `newManagers(input: { leaverId: string; leaverManagerId: string | null; targetId: string; reportIds: readonly string[] }): Map<string, string | null>`. Each report goes to `targetId`, except the report who is the target, who goes to `leaverManagerId`. The value is null when that would equal the report.

- [ ] **Step 1: Write the failing tests.**
  - `blocks removing yourself`.
  - `blocks handing to the leaver`.
  - `blocks an inactive target`.
  - `blocks a reseller-only target`.
  - `blocks a future last day`.
  - `allows today and earlier`.
  - `newManagers`:
    - reports `[a, target]` with leaver manager `m` gives `{ a → target, target → m }`
    - the same with leaver manager `null` gives `{ a → target, target → null }`
    - when `m === target`, `target → null`
- [ ] **Step 2: Run the tests.** Run `pnpm --filter @oneohm/api test -- departure-rules`. Expected: FAIL.
- [ ] **Step 3: Implement**, and generate the migration.
- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(people): left_on and removal rules"`

### Task C2: Removal summary (read)

**Files:**
- Create: `apps/api/src/modules/people/departure/departure-work.ts`. It holds the open work, as IDs and counts.
- Create: `apps/api/src/modules/people/departure/departure-settlement.ts`. It holds what is still owed.
- Modify: `packages/api-contracts/src/contracts/people.contract.ts`. Add `getDeparture: GET /people/:id/departure`, which needs `people.manage`.
- Modify: `people.controller.ts`
- Test: `apps/api/test/acceptance/scenarios/55-remove-person.acceptance.ts` (first cases)

**Interfaces:**
- Produces:
  - `openWork(db, userId): Promise<OpenWork>`. All of these are ID lists, from the open rows only:
    - `leads`: `leads.owner_user_id`, stage not `won` or `lost`
    - `tasks`: `project_tasks.assignee_user_id`, status not `completed`
    - `proposedTasks`: `project_tasks.proposed_user_id`, status not `completed`
    - `serviceRequests`: assignee, status not `resolved`
    - `discomSteps`: `change_request_steps.assignee_user_id`, status not `completed`
    - `managedProjects`: `projects.manager_user_id`, with the project not finished. Use the project status enum's open values.
    - `teamProjects`: `project_team_members`
    - `directReports`: `reporting_lines.manager_user_id`
    - `chats`: `wa_conversations` where `assigned_user_id` or `handled_by_user_id` is the leaver
    - `leaveApprovals`: `leave_manager_reviews` in state `waiting`
    - `backupFor`: `leave_requests` where `backup_user_id = leaver`, status `approved` and `to_date >= today`
    - `ownPendingLeave`: their own `leave_requests` in status `pending`
    - `commissionRules`: the per-reseller rules
  - `settlement(db, userId): Promise<Settlement>`. It covers:
    - `travelClaims` (pending or approved: count and paise)
    - `bonusShares` (from `project_bonus_shares` joined to `project_bonuses` in pending or approved: count and paise)
    - `payables` (`party_user_id`, not paid: count and paise)
    - `commissions` (pending and approved: count and paise)
    - `pendingPoints` (sum)
  - `soleHolders(db, userId): Promise<Capability[]>`. These are the capabilities from `['finance.approve_payments', 'people.manage', 'roles.manage']` that no other active person holds.
  - `DepartureSummary = { counts: Record<keyof OpenWork, number>; settlement: Settlement; soleHolderOf: Capability[]; suggestedTargetId: string | null }`. The suggested target is the leaver's manager when that manager is active.

- [ ] **Step 1: Write the failing scenario cases.** Seed a leaver with:
  - 1 lead
  - 1 task
  - 1 proposed task
  - 1 service request
  - 1 managed project
  - 1 team membership
  - 2 direct reports
  - 1 assigned chat
  - 1 waiting leave approval
  - 1 backup-for leave
  - 1 pending travel claim of ₹1,840

  Then `GET /people/:id/departure` must return those exact counts, `settlement.travelClaims` equal to `{ count: 1, paise: 184000 }` and `suggestedTargetId` equal to their manager. A second case: `soleHolderOf includes finance.approve_payments when nobody else has it`.
- [ ] **Step 2: Run the scenario.** Run `pnpm test:acceptance 55-remove-person`. Expected: FAIL.
- [ ] **Step 3: Implement.** Each file stays at 250 lines or fewer, so split the queries by kind if needed.
- [ ] **Step 4: Run the scenario.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(people): removal summary of open work and money owed"`

### Task C3: Remove and hand over (write)

**Files:**
- Create: `apps/api/src/modules/people/departure/departure-handover.ts`. It holds the moves and notes.
- Create: `apps/api/src/modules/people/departure/departure-wrapup.ts`. It holds sessions, devices, location, visits, attendance, outbox and leave.
- Create: `apps/api/src/modules/people/departure/departure.service.ts`
- Modify: the people contract, controller and module
- Modify: `people.service.ts:129-131`. A PATCH with `status: 'inactive'` also calls `wrapUp`, without any handover, so the old API path and the test helper `retire` still work.
- Test: `55-remove-person.acceptance.ts`

**Interfaces:**
- Consumes: C1 and C2.
- Produces:
  - `removePerson: POST /people/:id/remove`, body `{ handToUserId: idSchema; lastWorkingDay: dateSchema; tellCustomers: boolean }`, returns `200 Person`. Needs `people.manage`.
  - Errors are 409 with the `RemovalProblem` code. The target error says `Pick someone else`. The last Super Admin keeps `last_super_admin`.
  - `handOver(tx, actorId: string, leaver: { id; fullName }, target: { id; fullName }, work: OpenWork): Promise<number>`
    - Moves leads, tasks, proposed tasks, service requests, DISCOM steps, managed projects and chats (both columns) to the target.
    - Swaps team memberships to the target, skipping any project where the target is already on the team.
    - Replaces reporting lines using `newManagers`. A null value deletes the line.
    - Moves waiting leave reviews to the target.
    - Sets the leave backup to the target, and `notify`s the person on leave.
    - Writes the note `Handed over from {name} (left the team)` on each project (`project_activities`, kind `task_handover`) and lead (`lead_activities`, internal note).
    - Sends one `notify` to the target: kind `departure_cover`, title `You are now covering {name}'s work`, and a body of counts in the style of `coveringBody`.
  - `wrapUp(tx, userId: string, now: Date): Promise<void>`
    - deletes `sessions`
    - sets `push_devices.disabled_at = now` with `disabled_reason = 'left_team'`
    - sets `location_consents.withdrawn_at = now`
    - closes open `site_visits` (`check_out_at = now`) and today's open `attendance_days`
    - cancels their pending `leave_requests`
    - deletes unconsumed `otp_challenges` for their phone
    - marks pending `outbox` rows with `recipient = their phone` and channel `whatsapp` as `skipped`
    - archives their per-reseller `commission_rules`
  - `DepartureService.remove(actor, id, input)` opens one transaction:
    1. `SELECT … FOR UPDATE` on both user rows.
    2. `checkRemoval`, then `assertKeepsASuperAdmin`. The last becomes reachable when the private method moves to `people/super-admin-guard.ts` as `assertKeepsASuperAdmin(tx, userId, nextRoleIds, nextStatus)`.
    3. `openWork`, then `handOver`, then `wrapUp`.
    4. Sets `status: 'inactive'` and `leftOn`.
    5. Writes the audit entry `person.removed` with `{ handTo, counts }`.
    6. When `tellCustomers` is set, calls `tellCustomers(tx, …)` from C4.

- [ ] **Step 1: Write the failing scenario cases.**
  - `remove moves everything to the target`: every count from C2 is 0 for the leaver afterwards, and the target owns them.
  - `a direct report who is the target goes to the leaver's manager`.
  - `sessions gone, devices disabled, consent withdrawn, open visit closed, pending leave cancelled, pending staff outbox skipped`.
  - `pending and approved commissions and travel claims are untouched`.
  - `target gets one departure_cover notice`.
  - `remove yourself` returns 409 `remove_self`, and a `future date` returns 409 `future_date`.
  - `two removals racing`: remove A to B and remove B to A with `Promise.all`. Exactly one succeeds, and the other returns 409 `target_not_active`.
  - `the last Super Admin cannot be removed`.
  - `PATCH status inactive still works and wraps up`.
  - `a lead brought in by a removed reseller still makes a pending commission when it wins`. If `modules/commissions/reseller-attribution.ts` skips inactive resellers, change it to keep the attribution.
- [ ] **Step 2: Run the scenario.** Run `pnpm test:acceptance 55-remove-person`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces above.
- [ ] **Step 4: Run the tests.** Run the same scenario, plus `pnpm test:acceptance 47-alert-routing 49-customer-clarity` to check nothing that uses `retire` broke. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(people): remove from team with one-step handover"`

### Task C4: Tell customers their new contact

**Files:**
- Modify: `packages/domain/src/messaging/message-templates.ts`. Add `contact_changed`: audience `customer`, fields `['customer', 'staff', 'subject', 'phone']`, preview copied from the spec. Add its customer app-inbox words wherever `customerNotice` reads them.
- Create: `apps/api/src/modules/people/departure/departure-customers.ts`
- Test: add to `55-remove-person.acceptance.ts`

**Interfaces:**
- Consumes: `OpenWork` from C2 and `queueWhatsApp` (`apps/api/src/common/outbox.ts`).
- Produces: `tellCustomers(tx, leaverId: string, target: { fullName; phoneE164 }, work: OpenWork): Promise<number>`
  - It collects recipients from:
    - `managedProjects`: the customer phone, with the project in plain words as the subject
    - `serviceRequests`: the customer phone, with subject `your service request`
    - `leads` in a stage other than `new`: the lead phone, with subject `your solar enquiry`
  - It dedupes by phone, keeping the first subject.
  - It queues one message per phone with dedupe key `contact_changed:${leaverId}:${phone}` and returns the count.

- [ ] **Step 1: Write the failing cases.**
  - `one message per customer phone even with project + service request`.
  - `a lead in stage new gets nothing`.
  - `tellCustomers false queues nothing`.
  - `the customer home shows the new manager name`: read the customer-portal home and check `managerName` equals the target.
- [ ] **Step 2: Run the scenario.** Run `pnpm test:acceptance 55-remove-person`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the scenario.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(people): tell customers who their new contact is"`

### Task C5: Rejoin and past members

**Files:**
- Modify: the people contract, controller and `departure.service.ts`. Add `rejoinPerson: POST /people/:id/rejoin`, which returns `200 Person`.
- Modify: the reader that lists people for the current month's points or ranking (`apps/api/src/modules/workforce/monthly-review.read.ts`), so it only includes `users.status = 'active'` for the current period. Past periods stay as they are.
- Test: add to `55-remove-person.acceptance.ts`

**Interfaces:**
- Produces: `rejoin(actor, id)`. Only for inactive people. It sets `status: 'active'`, `leftOn: null` and `passwordHash: null`, calls `queueInvite` and writes the audit entry `person.rejoined`. Work does not move back.

- [ ] **Step 1: Write the failing cases.**
  - `rejoin makes them active with no password and queues an invite`.
  - `rejoin an active person returns 409`.
  - `the removed person is not in this month's ranking but their points rows remain`.
- [ ] **Step 2: Run the scenario.** Run `pnpm test:acceptance 55-remove-person`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the scenario.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(people): add a past member back"`

### Task C6: Removal screens

**Files:**
- Create: `apps/web/src/features/team/remove-person-sheet.tsx`
- Modify: `apps/web/src/features/team/edit-person-sheet.tsx`. Remove the status switch and add the button `Remove from team`.
- Modify: `apps/web/src/features/team/people-tab.tsx`. Add the filter `Show past members`, off by default.
- Modify: `apps/web/src/features/team/person-chip.tsx`. Add a `Left` tag when `leftOn` is set.
- Modify: `add-person-dialog.tsx`, so the `Add {name} back` button calls rejoin.
- Modify: `apps/web/messages/en-IN/team.json`
- Check: every web person picker hides people with `status = 'inactive'`. Search `features/**/use-*.ts` for people lists.

- [ ] **Step 1: The removal sheet, in this order.**
  - The `What they have open` count list. It hides zero rows.
  - The picker `Hand everything to`. It is preset to `suggestedTargetId` and lists active staff only.
  - `Last working day`: a date that can't be later than today.
  - The checkbox `Tell customers who their new contact is`, on by default.
  - A warning for each item in `soleHolderOf`, for example: `Nobody else can approve payments after this.`
  - The `Still to settle for {name}` list, built from `settlement`.
  - The button `Remove and hand over`.
  - After a successful save, the toast `{name} removed. {n} items are now with {target}.`
- [ ] **Step 2: The past-member page.** It shows the same settlement list, plus the button `Add back to team`.
- [ ] **Step 3: Verify.** Run `pnpm --filter @oneohm/web typecheck && pnpm lint && pnpm check:file-size`. Expect no errors. Preview the flow: open the sheet, remove a seeded person, see the toast, turn on the past members filter and use Add back. Screenshot each step.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): remove-from-team sheet and past members"`

---

## Final check

- [ ] Run `pnpm check`, then `pnpm test:acceptance`. Expected: everything passes.
- [ ] Add `MSG91_PASSWORD_RESET_TEMPLATE_ID`, `FIELD_APP_URL` and `STAFF_INVITES` to the API section of `docs/DEPLOYMENT.md`, with no secret values. Add `staff_welcome` and `contact_changed` to `docs/whatsapp-templates.md` using the spec's text.
- [ ] Commit: `git commit -m "docs: people lifecycle env and WhatsApp templates"`
