# Phase 4: Fair Points and the Monthly Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Task points are fair and explained. Each finished task is judged on two parts, **on time** and **first-time right**, by one pure rule. Every part earned or missed leaves a readable line. Employees see their month on web and mobile. The owner reviews each person once a month and can propose a bonus through the existing approval flow.

**Architecture:** A pure judge in `packages/domain` takes the facts of a finished task and returns the two parts with reasons. The API gathers those facts in `finishTask` (hand-in time and person from `task_reviews`, outside waits from `task_waits` plus any open wait, the credited person's approved leave, self-reschedules from project history) and writes one entry per part: points when earned, **0-point "missed" rows** when not. A new `monthly_reviews` table records each person-month decision. A "bonus" decision calls the existing `BonusesService.propose` (no project), so money still needs `finance.approve_payments`.

**Tech Stack:** Drizzle/Postgres (migration 0055), NestJS, ts-rest + zod, Next.js web, Expo field app, vitest, acceptance runner.

**Spec:** `docs/superpowers/specs/2026-11-02-task-ownership-design.md` §3.7. Owner decisions: points never go down (2A), points count right away (1A), office staff work on web (3A). Phase 4: **1A**, up to 20 points per task (on time 10, first-time right 10, both set in Settings); **2A**, no "complete proof" part, because the system already blocks completion without the required proof.

## Global Constraints

- **Points never go down.** A missed part is a row with `points: 0` and `status: 'approved'`, plus a reason. No negative rows are created in this phase.
- **Points count right away** (`status: 'approved'`). The monthly review only decides money.
- **Credit goes to the person who handed the task in:** `task_reviews.submittedByUserId` of the approved review for approval tasks, else `completedByUserId`. Staff only (the existing `isStaff`). Partners and resellers get nothing, as today.
- **On time** compares the **hand-in date** (India date of the last hand-in that was accepted: the approved review's `createdAt`, or `completedAt` when there is no review) with the **judged due date**:
  - Start from the task's current `dueDate`. Due dates moved by a manager, or by the late-task cascade, count as the real date.
  - If the credited person rescheduled the task themselves (`project_activities` kind `'rescheduled'`, `userId` = the credited person), use the earliest `data.from` of their own moves instead.
  - Then add every outside-party wait day (`task_waits` with party ≠ `internal`, plus an open `waitingSince` when party ≠ internal) and every approved leave day of the credited person. Count days from the task's `startDate` to the hand-in date, each day once.
- **First-time right** applies only to tasks that need approval. It is earned when the task has zero `task_reviews` rows with outcome `'returned'`. Tasks with no approval step get no first-time row at all.
- **Source types** (text column, no migration): `task_on_time` (kept) and the new `task_first_time`. There is one row per task, part and person, held by the existing unique key (`source_type`, `source_id`, `user_id`).
- **Past points stay as they are.** The new rule applies to tasks finished after release. Nothing is recalculated.
- **India months** come from one helper in `packages/shared` (`monthOf(instant)`, `monthRange('YYYY-MM')`). It also fixes the two current month bugs: standings use the database session's timezone, and my-rewards uses the UTC month.
- **Monthly decisions need `people.manage`.** A bonus is a proposal; approving it still needs `finance.approve_payments` (or `people.manage` within the limit), as today. Each person-month can be decided once.
- Web strings via next-intl; mobile via `apps/field/src/copy`. Files ≤ 250 lines; Biome clean. Branch `feat/fair-points`.

## Review Focus

1. A task that waited 5 days on the bank and was handed in 3 days after its due date must earn **on time**, with a reason that names the wait.
2. On an approval task, a slow reviewer who approves after the due date must not cost the doer the on-time points. The hand-in date counts.
3. A task sent back once and then approved earns on time if it qualifies, but **not** first-time right. The missed row says "Sent back 1 time".
4. If a manager completes a task on someone's behalf, the manager is credited (spec rule). If the credited person is a partner or reseller, no rows are written.
5. Deciding the same person-month twice is refused (409). A bonus decision creates a **proposed** bonus that needs a separate approval.

---

### Task 1: The fair-points judge, month helpers and the new setting

**Files:**
- Create: `packages/domain/src/workforce/task-points.ts` + `task-points.test.ts`
- Create: `packages/shared/src/time/month.ts` + `month.test.ts` (export from the shared index)
- Modify: `packages/domain/src/workforce/policy.ts` (`points.firstTimeRight`, default 10, merged in by `withPolicyDefaults`)
- Modify: `packages/api-contracts/src/schemas/workforce.schema.ts` (`firstTimeRight` 0–1000; add `'task_first_time'` to the source type list)
- Modify: `packages/database/src/schema/workforce.schema.ts` (the Drizzle enum list for `sourceType`)
- Modify: `apps/web/src/features/settings/rewards/points-section.tsx` and messages (the new field)

**Interfaces:**
- Produces:
  ```ts
  export interface TaskPointFacts {
    readonly dueDate: string;               // current
    readonly startDate: string;
    readonly handedInOn: string;            // India date
    readonly selfMovedFrom: readonly string[]; // `from` of reschedules by the credited person
    readonly outsideWaits: readonly { from: string; to: string; party: string }[]; // India dates, inclusive
    readonly leave: readonly { from: string; to: string }[];
    readonly needsApproval: boolean;
    readonly returns: number;
  }
  export interface PartResult { readonly earned: boolean; readonly reason: string }
  export function judgeTask(facts: TaskPointFacts): {
    readonly onTime: PartResult & { readonly judgedDue: string; readonly daysLate: number };
    readonly firstTimeRight: PartResult | null; // null when no approval step
  };
  ```
  Reason texts are exact:
  - "On time" / "On time (after 5 days waiting on the bank)" / "Late by 2 days: on-time not earned" / "Late by 2 days after 3 days waiting on others: on-time not earned"
  - "First-time right" / "Sent back 1 time: first-time right not earned" / "Sent back 2 times: …"
  - Wait text names one party ("the bank", "the customer", "the DISCOM") or "others" when there are several.
- Produces in `@oneohm/shared`: `monthOf(instant: Date, timeZone?: string): string` ('YYYY-MM' in IST), `monthRange(month: string): { start: string; end: string }` (first and last day), and `previousMonth(month): string`.

- [ ] **Step 1: Write the failing tests** (`task-points.test.ts`):
  - `'on time when handed in by the due date'`
  - `'adds outside waits to the due date and says so'`: due 11-01, bank wait 10-28..11-01 (5 days), handed in 11-04 → earned, reason contains "5 days waiting on the bank"
  - `'does not add internal waits'`
  - `'adds approved leave days'`
  - `'judges against the date before a self-reschedule'`: due 11-10, `selfMovedFrom` `['2026-11-03']`, handed in 11-05 → not earned, `daysLate` 2
  - `'counts a day covered by both a wait and leave once'`
  - `'first-time right only with an approval step'` → null without approval
  - `'sent back once loses first-time right with the count'`

  `month.test.ts`:
  - `'an instant just after midnight IST belongs to the new India month'`: `2026-10-31T19:00:00Z` → `'2026-11'`
  - `'month range covers the whole month'`: `'2026-02'` → start `2026-02-01`, end `2026-02-28`
  - `'previous month wraps the year'`

- [ ] **Step 2: Run them and see them fail.** Run `pnpm --filter @oneohm/domain exec vitest run src/workforce/task-points.test.ts && pnpm --filter @oneohm/shared exec vitest run src/time/month.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, add the policy field, the Settings input and the source type, then build `shared`, `domain`, `api-contracts` and `database`.
- [ ] **Step 4: Run the tests and typecheck.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): fair task points judge, India months, first-time-right setting`

---

### Task 2: Award task points fairly when a task finishes

**Files:**
- Create: `apps/api/src/modules/workforce/task-point-facts.ts` (gathers `TaskPointFacts` and the credited person from the database, inside the finishing transaction)
- Modify: `apps/api/src/modules/workforce/points.ts` (replace `awardOnTimeTask` with `awardTaskPoints(tx, task)`; keep `isStaff`)
- Modify: `apps/api/src/modules/projects/task-completion.ts` (call `awardTaskPoints`)
- Create: `apps/api/test/acceptance/scenarios/25-fair-points.acceptance.ts` (uses `support/db.ts` helpers to set due dates, waits and leave in the acceptance database)

**Interfaces:**
- Consumes: `judgeTask` (Task 1); `loadPolicy` (`points.onTimeTask`, `points.firstTimeRight`).
- Produces: `awardTaskPoints(tx: Transaction, task: { id; title; projectId; dueDate; startDate; approval; completedByUserId? }): Promise<void>`. It writes up to two `points_entries` rows with `onConflictDoNothing`:
  - `task_on_time`: `points` is the policy value when earned, else 0.
  - `task_first_time`: the same, only for approval tasks.
  - Each row's reason is `` `${part.reason}: ${task.title}` ``.
  - If a policy value is 0, the part's row is still written with 0 points, so the reason stays visible.
- The facts query reads `task_reviews` (latest `approved` or `self_approved`, plus the count of `returned`), `task_waits`, `project_tasks.waitingSince/waitingParty`, approved `leave_requests` for the credited person, and `project_activities` with kind `'rescheduled'` and `userId` = the credited person.

- [ ] **Step 1: Write the acceptance scenario:**
  - `'earns on time and first-time right on a clean approval task'`: 2 rows, 10 + 10
  - `'a late reviewer does not cost the doer'`: set the due date to today − 1 after the hand-in row exists; the hand-in was before the due date → earned
  - `'a bank wait keeps a late task on time, with the reason'`
  - `'sent back once: on time earned, first-time right missed with 0 points and a reason'`
  - `'a partner earns nothing'`
  - `'a task without approval gets only the on-time row'`

  Add `support/db.ts` helpers: `setTaskDates(taskId, { dueDate?, startDate? })`, `addTaskWait(taskId, party, from, to)`, and `approveLeave(userId, from, to)` (inserts an approved `leave_requests` row). All of these run on the acceptance database only.
- [ ] **Step 2: Run it and see it fail.** Run `pnpm test:acceptance 25-fair-points`. Expected: FAIL.
- [ ] **Step 3: Implement** the facts gatherer and `awardTaskPoints`, and wire it into `finishTask`.
- [ ] **Step 4: Run it, plus the scenarios that touch points:** `pnpm test:acceptance 25-fair-points 09-task-completion 14-engagement 23-task-priority`. Expected: PASS. Check whether 14-engagement assumed the old rule; if it does, change only those assertions to the new rule and note it in the ledger.
- [ ] **Step 5: Commit** `feat(points): fair on-time and first-time-right points with reasons`

---

### Task 3: Months in India time, and the monthly review API

**Files:**
- Modify: `apps/api/src/modules/workforce/points.service.ts` (standings use `monthRange(monthOf(now))` on `created_at at time zone 'Asia/Kolkata'`)
- Modify: `apps/api/src/modules/workforce/my-rewards.service.ts` (`thisMonth` via `monthOf`; add this month's rates: `onTimeRate`, `firstTimeRate`, `tasksJudged`, and the missed lines)
- Modify: `packages/database/src/schema/workforce.schema.ts` (`monthlyReviews`: `id`, `userId`, `month` text `YYYY-MM`, `decision` text `none|bonus`, `bonusId` uuid null FK, `note` text null, `decidedByUserId`, `createdAt`; unique (`user_id`, `month`)) → migration `0055_monthly_reviews`
- Create: `packages/api-contracts/src/schemas/monthly-review.schema.ts`, `contracts/monthly-review.contract.ts` (registered in the contracts index)
- Create: `apps/api/src/modules/workforce/monthly-review.service.ts` + controller wiring
- Create: `apps/api/test/acceptance/scenarios/26-monthly-review.acceptance.ts`

**Interfaces:**
- `GET /points/monthly?month=YYYY-MM` (`people.view`) → `{ month, rows: MonthlyRow[] }`. One row per active staff person who has any points row that month, or a review. `MonthlyRow`:
  ```ts
  { user: UserRef; points: number; previousPoints: number; tasksJudged: number;
    onTimeRate: number | null;      // earned / judged, null when 0 judged
    firstTimeRate: number | null;   // earned / approval tasks judged
    ratingAverage: number | null;   // stage-rating stars naming them that month
    review: { decision: 'none' | 'bonus'; bonusId: string | null; amountPaise: number | null; status: string | null } | null }
  ```
- `GET /points/monthly/:userId?month=` (`people.view`): that person's point rows for the month, grouped by project (project code and name, task title, part, points, reason).
- `POST /points/monthly/:userId/decide` (`people.manage`), body `{ month, decision: 'none' | 'bonus', amountPaise?: number, note?: string }`:
  - 409 if already decided.
  - 400 if `month` is the current or a future month. Only finished months can be decided.
  - The actor may not decide their own month (403).
  - `bonus` calls `BonusesService.propose(actor, { projectId: null, reason: 'Monthly review <Mon YYYY>: <note or "good work">', totalPaise: amountPaise, people: [{ userId, shares: 1 }] })` and stores the `bonusId`.
  - Audit `points.month_decided`.
- My rewards (web and mobile) adds `month: { points; tasksJudged; onTimeRate; firstTimeRate; missed: { reason; points: 0; projectCode; createdAt }[] }`.

- [ ] **Step 1: Write the acceptance scenario:**
  - `'lists a person with their month and rates'`
  - `'deciding a bonus creates a proposed bonus and records the review'`
  - `'the same month cannot be decided twice'`
  - `'the current month cannot be decided'`
  - `'nobody decides their own month'`
  - `'my rewards shows this month's missed lines'`
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.** Generate the migration, rename it `0055_monthly_reviews`, and update the journal tag. Keep the services under 250 lines; split read and write files.
- [ ] **Step 4: Run** `pnpm test:acceptance 26-monthly-review 25-fair-points 14-engagement` and the API typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `feat(points): India-month totals and the monthly owner review`

---

### Task 4: Web: My rewards page and the monthly review screen

**Files:**
- Create: `apps/web/src/app/(app)/rewards/page.tsx`, `apps/web/src/features/rewards/*` (month card: points, rates and trend; missed lines with reasons; history; bonuses)
- Modify: `apps/web/src/features/shell/sidebar.tsx` (a "My rewards" link for everyone)
- Create: `apps/web/src/features/team/points/monthly-review.tsx` (table: person, points, trend, on-time %, first-time %, rating, review status; a month picker defaulting to last month), `monthly-person-sheet.tsx` (rows by project), `decide-month-dialog.tsx` (decision "No money" / "Propose bonus" with amount in ₹ and a note)
- Modify: `apps/web/src/features/team/points/points-tab.tsx` (adds the review section for `people.view`)
- Create: `apps/web/src/features/team/points/weak-spot.ts` + test (picks the lowest rate under 80% as the "needs attention" line; nothing when all rates are ≥ 80% or nothing was judged)
- Modify: messages

- [ ] **Step 1: Write the failing tests** for `weakSpot(row)`: `'names the lowest rate under 80%'`, `'says nothing when all are good'`, `'says nothing when nothing was judged'`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** the pages and dialogs. The decide button shows only with `people.manage` and for finished months, and hides on the viewer's own row. Rupee input is converted to paise.
- [ ] **Step 4: Run** web tests, typecheck and Biome. Expected: PASS.
- [ ] **Step 5: Browser check on the test stack:**
  - My rewards shows the month and missed lines.
  - The monthly review lists people; open a person to see rows by project.
  - Propose a bonus; it shows as "Proposed", and Team → Bonuses lists it waiting for approval.
- [ ] **Step 6: Commit** `feat(web): My rewards and the monthly owner review`

---

### Task 5: Mobile: month rates and missed lines

**Files:**
- Modify: `apps/field/src/features/rewards/rewards-screen.tsx`, `points-history.tsx`, `rewards-card.tsx`, and copy
- Test: `apps/field/src/features/rewards/format.test.ts` (rate formatting: `null` → "–", 0.875 → "88%")

- [ ] **Step 1: Write the failing test** for `ratePercent`.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.** The month card shows points, on-time %, first-time % and tasks judged. History shows 0-point rows as "Missed" with the reason, in a muted tone.
- [ ] **Step 4: Run** field tests and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `feat(field): month rates and missed lines in My rewards`

---

### Task 6: Whole-phase check

- [ ] Run `pnpm typecheck && pnpm test`, Biome on changed files, and the full `pnpm test:acceptance`. Expected: all pass.
- [ ] Walk through: finish a task late after a bank wait (on time, reason shown); send one back (first-time missed); the owner reviews last month and proposes a bonus; the bonus waits for payment approval.
