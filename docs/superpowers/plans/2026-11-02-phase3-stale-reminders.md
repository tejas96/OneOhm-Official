# Phase 3: Stale Tasks and Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Status stays current without the owner chasing. A task nobody has touched for a while is marked **stale** everywhere and its holder is reminded once. Urgent work is announced at once. The existing morning summary gains stale, urgent and blocking counts. People on approved leave are not nagged, and their manager hears when they hold up someone else.

**Architecture:** One pure rule in `packages/domain` decides staleness from a task's last update (task row, its history lines, its files), with approved leave days removed. The API read model adds `stale` and `lastUpdateAt`, so web and mobile show a "Stale" badge from the same rule. The existing Temporal morning job (`apps/worker`: `escalations.ts`, `staff-digest.ts`) is **extended, not duplicated** (spec 3.5): it sends stale reminders, blocker-on-leave notices and the new digest counts, each once per step through the existing dedupe keys. The "urgent" notice is sent instantly from the API when a priority becomes Urgent.

**Tech Stack:** Drizzle/Postgres, NestJS, Temporal worker activities, ts-rest + zod, Next.js web, Expo field app, vitest, acceptance runner.

**Spec:** `docs/superpowers/specs/2026-11-02-task-ownership-design.md` (section 3.5; build order phase 3).

## Global Constraints

- Extend `apps/worker/src/activities/escalations.ts` and `staff-digest.ts`; never add a second reminder system.
- Every reminder is sent once per step, by a dedupe key.
- The stale threshold is the existing setting `escalation_policy.stuckInternalDays` (default 3). There is no new setting.
- **Stale** means status `ready` or `in_progress`, and no update for at least that many days. Waiting, in-review, pending (blocked) and done tasks are never stale.
- **An update** is any of: a change to the task row (`project_tasks.updated_at`), a history line for the task (`project_activities` with that `task_id`), or a file on the task (`documents.task_id`, `created_at`).
- **Approved leave** days (`leave_requests` with status approved, overlapping the window) do not count toward staleness. Nobody gets a stale reminder on a day they are on leave.
- Existing instant notices (assigned, ready for review, returned, approved, rescheduled) stay as they are. The only new instant notice is "marked Urgent".
- "Manager" means the project manager, then holders of `tasks.assign` / `projects.manage`. This is the existing `tellManager` rule.
- Web strings via next-intl; mobile strings via `apps/field/src/copy`; WhatsApp template payloads only add fields (the existing template keeps working).
- Files ≤ 250 lines; Biome clean; branch `feat/stale-reminders` from `main`. No database migration is needed.

## Review Focus

1. A note, a checklist completion or a file upload on a stale task clears "stale" at once (read model) and stops the next reminder.
2. Someone on approved leave today gets no stale reminder, and the days they were on leave do not make their task stale.
3. Re-running the morning job on the same day sends nothing new (dedupe keys).
4. A task marked Urgent twice, or changed Urgent → High → Urgent, notifies the assignee once per change to Urgent, and never notifies the person who set it if they are the assignee.
5. A task with no assignee is never "stale for someone": no reminder is sent; it still shows the stale badge.

---

### Task 1: The stale rule

**Files:**
- Create: `packages/domain/src/tasks/staleness.ts`
- Create: `packages/domain/src/tasks/staleness.test.ts`
- Modify: `packages/domain/src/tasks/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LeaveSpan { readonly from: string; readonly to: string } // yyyy-mm-dd, inclusive
  export function idleDays(lastUpdate: string, today: string, leave: readonly LeaveSpan[]): number;
  export function isStale(input: {
    readonly status: string;
    readonly lastUpdate: string;   // yyyy-mm-dd in India
    readonly today: string;
    readonly leave: readonly LeaveSpan[];
    readonly thresholdDays: number;
  }): boolean;
  export function onLeave(today: string, leave: readonly LeaveSpan[]): boolean;
  ```
  `idleDays` = days from `lastUpdate` to `today`, minus the days in that range that fall inside any leave span (count each day once). `isStale` = status is `ready` or `in_progress`, and `idleDays ≥ thresholdDays`.

- [ ] **Step 1: Write the failing tests:**
  - `'counts whole days since the last update'`: `idleDays('2026-10-28', '2026-11-02', [])` → 5.
  - `'does not count days on leave'`: leave from `2026-10-29` to `2026-10-31` → 2.
  - `'counts overlapping leave days once'`.
  - `'only ready and in-progress tasks can be stale'`: `waiting` and `pending` → false even after 10 idle days.
  - `'is stale at the threshold, not before'`: 3 idle days with threshold 3 → true; 2 → false.
  - `'knows when someone is on leave today'`.

- [ ] **Step 2: Run them and see them fail.** Run `pnpm --filter @oneohm/domain exec vitest run src/tasks/staleness.test.ts`. Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement, export it, and build.** Run `pnpm --filter @oneohm/domain build`.

- [ ] **Step 4: Run the tests.** Expected: 6 pass.

- [ ] **Step 5: Commit** `feat(domain): one rule for stale tasks, leave aware`

---

### Task 2: API: stale on every task, and an instant Urgent notice

**Files:**
- Create: `apps/api/src/common/read-models/task-freshness.ts` (loads last update and the assignee's leave for a set of tasks; reads `stuckInternalDays` from `escalation_policy`, falling back to `DEFAULT_ESCALATION`)
- Modify: `apps/api/src/common/read-models/project-tasks.ts`
- Modify: `packages/api-contracts/src/schemas/task-priority.schema.ts` (`taskFreshnessSchema`) and `project.schema.ts` (`stale`, `lastUpdateAt`)
- Modify: `apps/api/src/modules/projects/task-priority.ts` (Urgent notice)
- Create: `apps/api/test/acceptance/scenarios/24-stale-tasks.acceptance.ts`

**Interfaces:**
- Consumes: `isStale`, `LeaveSpan` (Task 1).
- Produces on `ProjectTask`: `stale: boolean`, `lastUpdateAt: string` (ISO instant of the latest update).
- Produces: `loadFreshness(db, tasks: { id; assigneeUserId; updatedAt }[], today): Promise<Map<taskId, { lastUpdateAt: Date; stale: boolean }>>`. It runs one grouped query each for activities and documents, and one for approved leave of the assignees.
- Urgent notice: when `setPriority` actually changes the value to `urgent`, and the assignee exists and is not the actor, call `notify(tx, { userId: assignee }, { kind: 'task_urgent', title: 'Marked Urgent on <code>', body: '<title>', subject, dedupeKey: 'urgent:<taskId>:<activityId>' })`. The dedupe key uses the new history line id, so each change to Urgent notifies once.

- [ ] **Step 1: Write the acceptance scenario** `24-stale-tasks.acceptance.ts`. It uses the acceptance database helper to backdate rows (add `ageTask(taskId, days)` to `support/db.ts`; it sets `project_tasks.updated_at` and the task's `project_activities.created_at` back by `days`). Tests:
  - `'a ready task untouched for 3 days is stale'`
  - `'a note clears stale at once'` (post `/tasks/:id/updates`, then `stale` is false)
  - `'a waiting task is never stale'`
  - `'marking urgent tells the assignee once'`: set urgent twice and check the assignee's notifications through their session `GET /me/notifications` (one `task_urgent`); then set high and urgent again (two).

- [ ] **Step 2: Run it and see it fail.** Run `pnpm test:acceptance 24-stale-tasks`. Expected: FAIL (`stale` is undefined).

- [ ] **Step 3: Implement** the schema fields, `loadFreshness`, the read-model fill and the Urgent notice. Rebuild the contracts.

- [ ] **Step 4: Run it, plus the earlier task scenarios.** Run `pnpm test:acceptance 24-stale-tasks 23-task-priority 22-task-blocking 09-task-completion`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(tasks): stale tasks and an instant Urgent notice`

---

### Task 3: Morning job: stale reminders, blocker on leave, richer summary

**Files:**
- Create: `apps/worker/src/activities/stale-reminders.ts` (+ `stale-reminders.test.ts` for the pure message builders)
- Modify: `apps/worker/src/activities/escalations.ts` (call the new reminders from `queueEscalations`, or add one activity to `daily-operations.workflow.ts` in the same run)
- Modify: `apps/worker/src/activities/staff-digest.ts` (counts: `stale`, `urgent`, `blocking`; body text; WhatsApp payload gets the same three as strings)

**Interfaces:**
- Consumes: `isStale`, `onLeave`, `idleDays` (Task 1); the same last-update sources as Task 2. Extract the shared SQL into `packages/database/src/queries/task-freshness.ts`, so the API and the worker use one query.
- Produces:
  - `queueStaleReminders(db, today): Promise<number>`. For each stale task with an assignee not on leave today: `notify` the assignee with `kind: 'task_stale'`, `title: 'No update on <code>'`, `body: '<title> has had no update for <n> days. Add a note or move it on.'`, dedupe key `stale:<taskId>:<lastUpdateDate>`. A new update makes a new key, so the next quiet spell reminds again.
  - `queueBlockerOnLeave(db, today)`. For each open dependency task whose assignee is on approved leave today and whose dependent is open: `tellManager(...)` with `kind: 'blocker_on_leave'`, dedupe key `leave-block:<taskId>:<leaveFrom>`.
  - The digest body adds `"<n> stale"`, `"<n> urgent"` and `"<n> blocking others"` when above 0. A person with only stale, urgent or blocking work also gets a summary.
- Pure helpers with tests: `staleMessage(task, days)`, `digestSummary(counts)`. Rename the current `summary` and export it.

- [ ] **Step 1: Write the failing tests** for `staleMessage` and `digestSummary`: `'lists only counts above zero, stale and urgent included'`; `'writes 1 day and n days correctly'`.

- [ ] **Step 2: Run them and see them fail.** Run `pnpm --filter @oneohm/worker exec vitest run src/activities`. Expected: FAIL.

- [ ] **Step 3: Implement.** Keep `escalations.ts` and `staff-digest.ts` under 250 lines.

- [ ] **Step 4: Run tests and typecheck.** Run `pnpm --filter @oneohm/worker test && pnpm --filter @oneohm/worker typecheck`. Expected: PASS.

- [ ] **Step 5: Run the jobs once against the acceptance database.** Use the worker's existing job runner (`job-runners.ts`), or a short script under `apps/worker/test/` that calls the activities with the acceptance `DATABASE_URL`. Run it twice on the same day. The second run must queue 0 new notices (Review Focus 3).

- [ ] **Step 6: Commit** `feat(worker): stale reminders, blocker-on-leave notice, richer morning summary`

---

### Task 4: Show "Stale" on web and mobile

**Files:**
- Modify: `apps/web/src/features/projects/tasks/task-card.tsx`, `control-room/task-table.tsx`, `control-room/kanban-card.tsx`, `task-panel/task-panel-body.tsx` (a "Stale · no update for n days" badge in the at-risk tone)
- Modify: `apps/field/src/features/tasks/task-row.tsx`, `task-screen.tsx`
- Create: `apps/web/src/features/projects/tasks/stale-badge.tsx`
- Modify: messages (`projects.task.stale`) and mobile copy (`TASK.stale`)

**Interfaces:**
- Consumes: `ProjectTask.stale` and `lastUpdateAt` (Task 2). Day count = `daysBetween(lastUpdateAt (India date), today)`. Read the fields as `task.stale === true`, so an older API shows nothing.

- [ ] **Step 1: Write the failing test** `staleLabelDays(lastUpdateAt, today)` in `stale-badge.test.ts` (web) and the same helper's test on mobile: `'counts India days since the last update'` (an instant just after midnight IST counts as that India day).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** the badge and wire it into each surface.
- [ ] **Step 4: Run** web and field tests, typecheck and Biome. Expected: PASS.
- [ ] **Step 5: Browser check** on the separate test stack (acceptance API on :4300 + web build on :3300). Backdate one task with `ageTask`; it shows "Stale" on the list, kanban, Today and panel. Post a note; the badge goes away.
- [ ] **Step 6: Commit** `feat: show stale tasks on web and mobile`

---

### Task 5: Whole-phase check

- [ ] Run `pnpm typecheck && pnpm test`, Biome on the changed files, and the full `pnpm test:acceptance`. Expected: all pass.
- [ ] Walk through: a stale task gets one reminder; a note clears it; marking Urgent tells the assignee once; the morning summary shows the new counts.
