# Phase 2: Priority, Do Next and Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every task gets a Linear-style priority that managers set, each person's Today list (web and mobile) is ordered by one shared "do next" rule with the reason shown, and every task surface shows what blocks it and what it blocks, with who and how late.

**Architecture:** One pure ranking function in `packages/domain` (`rankTasks` + `doNextReason`) is used by web and mobile, so both order tasks the same way. The API stores `priority` and who set it, and the task read model adds the facts the ranking needs (`unlocksPayment`, `blocksUrgent`, blocker details). Setting a priority is a new transition endpoint guarded by `tasks.assign`, which writes project history and audit in one transaction, like reschedule.

**Tech Stack:** Drizzle + Postgres migrations, NestJS, ts-rest + zod, Next.js web, Expo field app, vitest, acceptance runner.

**Spec:** `docs/superpowers/specs/2026-11-02-task-ownership-design.md` (sections 3.3, 3.4; build order phase 2). Owner decision for this phase: the Do next order lives inside the existing Today page (web and mobile), not on a new page.

## Global Constraints

- Priority values: `none | urgent | high | medium | low`, default `none`. Only `tasks.assign` holders set it. Every change goes into project history with who and when.
- Status changes stay transition based. Priority is set by its own endpoint, never by a generic PATCH.
- One ranking function shared by web and mobile (`@oneohm/domain`).
- Web strings via next-intl (`apps/web/messages/en-IN/*.json`); mobile strings via `apps/field/src/copy/*.ts`.
- Migrations via `pnpm --filter @oneohm/database db:generate`; next number is `0053`. Existing rows default to `none`.
- Every source file ≤ 250 lines (`pnpm check:file-size`); Biome lint clean on touched files.
- Never reset or wipe the OneOhm database or volume. Acceptance tests use their own database.
- Work on branch `feat/priority-do-next` from `main`.

## Ruling carried into this plan (Claude's call, flagged to the owner)

The spec lists manual priority (urgent, high, medium, low) above the automatic order. Read literally, a **Low** task would sit above an **overdue** unprioritised one, which defeats "Low". This plan orders in bands: **Urgent → High → (Medium and None, by the automatic order) → Low**. A task that blocks an Urgent task joins the Urgent band.

## Review Focus

1. A task whose blocker is Urgent but which itself has no priority: it must rank in the Urgent band, with the reason "Blocks an Urgent task".
2. A person without `tasks.assign` (for example a field crew member) must not see the priority control, and the API must refuse them (403) even if called directly.
3. Setting the same priority again must not write a second history line.
4. Priority on a completed task cannot be changed (409), and completed tasks never appear in Do next.
5. Tasks that wait on the customer, bank or DISCOM stay out of the ranked groups (they stay in "Waiting"), and their blocker line says who they wait on, not a person to blame.

---

### Task 1: The shared "do next" rule

**Files:**
- Create: `packages/domain/src/tasks/do-next.ts`
- Create: `packages/domain/src/tasks/do-next.test.ts`
- Modify: `packages/domain/src/tasks/index.ts` (export it)

**Interfaces:**
- Produces:
  ```ts
  export const TASK_PRIORITIES = ['none', 'urgent', 'high', 'medium', 'low'] as const;
  export type TaskPriority = (typeof TASK_PRIORITIES)[number];
  export interface RankInput {
    readonly priority: TaskPriority;
    readonly prioritySetBy: { readonly fullName: string } | null;
    readonly overdue: boolean;
    readonly dueDate: string;       // yyyy-mm-dd
    readonly startDate: string;     // tie-break: oldest first
    readonly blocking: readonly string[];
    readonly unlocksPayment: boolean;
    readonly blocksUrgent: boolean;
  }
  export type DoNextReason =
    | { readonly kind: 'priority'; readonly priority: 'urgent' | 'high'; readonly by: string | null }
    | { readonly kind: 'blocksUrgent' }
    | { readonly kind: 'overdue'; readonly days: number }
    | { readonly kind: 'blocks'; readonly count: number; readonly payment: boolean }
    | { readonly kind: 'due'; readonly date: string };
  export function rankTasks<T extends RankInput>(tasks: readonly T[], today: string): T[];
  export function doNextReason(task: RankInput, today: string): DoNextReason;
  ```

Order (stable): band (urgent or blocksUrgent = 0, high = 1, medium/none = 2, low = 3), then overdue before not overdue, then more `blocking` first, then `unlocksPayment` first, then earlier `dueDate`, then earlier `startDate`.
Reason, first that applies: priority urgent/high → `blocksUrgent` → overdue (days = today − dueDate) → blocks (count > 0 or payment) → due.

- [ ] **Step 1: Write the failing tests** with a `rank(partial)` helper that fills a `RankInput` (`priority: 'none'`, `overdue: false`, `dueDate: '2026-11-10'`, `startDate: '2026-11-01'`, `blocking: []`, `unlocksPayment: false`, `blocksUrgent: false`, `prioritySetBy: null`):
  - `'puts urgent before an overdue task with no priority'`
  - `'puts low after a not-overdue task with no priority'`
  - `'ranks a task that blocks an urgent one in the urgent band'`
  - `'puts overdue first, then more blocked work, then payment, then due date'`: four `none` tasks in reverse, expect ids `['overdue', 'blocks2', 'payment', 'early']`
  - `'breaks ties by the oldest start date'`
  - `'gives the reason, best first'`: `doNextReason(rank({ priority: 'urgent', prioritySetBy: { fullName: 'Asha' } }), today)` → `{ kind: 'priority', priority: 'urgent', by: 'Asha' }`; overdue by 2 days → `{ kind: 'overdue', days: 2 }`; `blocking: ['a','b'], unlocksPayment: true` → `{ kind: 'blocks', count: 2, payment: true }`; plain → `{ kind: 'due', date: '2026-11-10' }`

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @oneohm/domain exec vitest run src/tasks/do-next.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement `do-next.ts`**, then export it from the tasks index.

- [ ] **Step 4: Run the tests and build the package**

Run: `pnpm --filter @oneohm/domain exec vitest run src/tasks/do-next.test.ts && pnpm --filter @oneohm/domain build`
Expected: PASS (6 tests); build OK.

- [ ] **Step 5: Commit** `feat(domain): one shared do-next order with its reason`

---

### Task 2: Store priority and serve what the ranking needs

**Files:**
- Modify: `packages/database/src/schema/enums.ts` (`taskPriorityEnum = pgEnum('task_priority', TASK_PRIORITIES)`)
- Modify: `packages/database/src/schema/projects.schema.ts` (`projectTasks`: `priority` not null default `'none'`; `prioritySetByUserId` uuid null, FK users)
- Create: `packages/database/migrations/0053_*.sql` + meta (generated)
- Modify: `packages/api-contracts/src/schemas/project.schema.ts` (`projectTaskSchema` fields below; `setTaskPriorityInputSchema`)
- Modify: `packages/api-contracts/src/contracts/task-flow.routes.ts` (`setTaskPriority`)
- Create: `apps/api/src/common/read-models/task-blockers.ts` + `task-blockers.test.ts`
- Modify: `apps/api/src/common/read-models/project-tasks.ts`
- Create: `apps/api/src/modules/projects/task-priority.ts` (the transition)
- Modify: `apps/api/src/modules/projects/task-flow.service.ts`, `task-flow.handlers.ts`
- Create: `apps/api/test/acceptance/scenarios/23-task-priority.acceptance.ts`

**Interfaces:**
- Consumes: `TASK_PRIORITIES`, `TaskPriority` (Task 1).
- Produces on `ProjectTask`:
  ```ts
  priority: TaskPriority;
  prioritySetBy: UserRef | null;
  unlocksPayment: boolean;   // onComplete set and not 'project_operational'
  blocksUrgent: boolean;     // an open task waiting on this one is urgent
  blockers: { title: string; assignee: string | null; daysLate: number; waitingOn: WaitingParty | null }[];
  ```
  (`blockers` covers open dependency tasks only; `blockedBy` stays as is for change requests and budget holds.)
- Produces route: `POST /tasks/:id/priority`, body `{ priority: TaskPriority }`, 200 `ProjectTask`; 403 without `tasks.assign`; 409 `done` when completed.
- Produces: `blockerDetails(dep: { title; status; dueDate; waitingParty; assigneeName }, today): Blocker` in `task-blockers.ts`. `daysLate` = max(0, today − dueDate). `waitingOn` = `waitingParty` when status is `waiting` and party ≠ `internal`, else null.

- [ ] **Step 1: Write the failing unit test** `task-blockers.test.ts`: `'counts days late from the due date'` (due `2026-10-30`, today `2026-11-02` → 3), `'is zero when not late'`, `'names the outside party a waiting blocker waits on'` (`waiting` + `bank` → `'bank'`), `'names no party for internal waits'`.

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @oneohm/api exec vitest run src/common/read-models/task-blockers.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Add the schema, generate the migration, and implement.**
  - Run `pnpm --filter @oneohm/database db:generate`. Check the SQL creates the enum and the two columns with default `'none'`.
  - Rebuild `@oneohm/database`, `@oneohm/domain` and `@oneohm/api-contracts`.
  - In `presentTasks`, extend the dependency queries to read the dependency's status, dueDate, waitingParty, assignee name and priority. Fill the new fields.
  - `task-priority.ts` exports `setPriority(tx, actor, task, priority)`. It does nothing when the value is unchanged. Otherwise it updates `priority` and `prioritySetByUserId`, inserts `projectActivities` (`kind: 'priority_set'`, message `` `${title}: priority set to ${Label}.` ``, `data: { from, to }`) and calls `recordAudit(..., 'task.priority_set', ...)`.
  - `TaskFlowService.setPriority(actor, id, priority)`: call `assertCan(actor, 'tasks.assign')`, return 409 `done` on completed tasks, run the transaction, and return `present(id)`.

- [ ] **Step 4: Run unit tests and typecheck**

Run: `pnpm --filter @oneohm/api exec vitest run src/common/read-models && pnpm --filter @oneohm/api typecheck`
Expected: PASS, no errors.

- [ ] **Step 5: Write the acceptance scenario** `23-task-priority.acceptance.ts`:
  - `'an assigner sets urgent and it shows with who set it'`: admin posts `urgent`; the task returns `priority: 'urgent'` and `prioritySetBy.fullName`; its activity has one `priority set to Urgent` line.
  - `'setting the same priority twice writes one history line'`.
  - `'a blocker of an urgent task says so'`: mark a blocked task urgent; its blocker has `blocksUrgent: true`.
  - `'someone without tasks.assign is refused'`: use a staff session without that capability (from `support/tasks` helpers) → 403.
  - `'a done task cannot change priority'` → 409.

- [ ] **Step 6: Run it**

Run: `pnpm test:acceptance 23-task-priority 22-task-blocking 09-task-completion`
Expected: PASS.

- [ ] **Step 7: Commit** `feat(tasks): task priority with history, and blocker details`

---

### Task 3: Web: priority everywhere, ordered Today, richer blockers

**Files:**
- Create: `apps/web/src/features/projects/tasks/priority-icon.tsx` (Linear-style: urgent = filled alert square, high/medium/low = 3/2/1 bars, none = dashed)
- Create: `apps/web/src/features/projects/task-panel/priority-control.tsx` (Popover menu, shown only when `useCan('tasks.assign')`; posts `api.tasks.setTaskPriority`; then `useInvalidateWork()`)
- Create: `apps/web/src/features/today/do-next-reason.tsx` (renders `DoNextReason` as one short line)
- Modify: `apps/web/src/features/today/group-tasks.ts` (sort each group with `rankTasks`, except `waiting`, which keeps due order) + test `group-tasks.test.ts`
- Modify: `apps/web/src/features/projects/tasks/task-card.tsx` (priority icon before the title; `DoNextReason` line when `showProject`, which is Today)
- Modify: `apps/web/src/features/projects/control-room/task-table.tsx`, `kanban-card.tsx` (priority icon)
- Modify: `apps/web/src/features/projects/task-panel/task-panel-body.tsx` (PriorityControl in the header), `task-panel-sections.tsx` (blockers with person, days late or outside party)
- Modify: `apps/web/src/features/projects/control-room/task-scope.ts` (+ `'blocked'` scope: open and `isBlocked`) + test
- Modify: `apps/web/messages/en-IN/projects.json`, `today.json`

**Interfaces:**
- Consumes: `rankTasks`, `doNextReason`, `TaskPriority` (Task 1); the new `ProjectTask` fields and `api.tasks.setTaskPriority` (Task 2).

- [ ] **Step 1: Write the failing tests**
  - `group-tasks.test.ts`: `'orders the overdue group by the do-next rule'` (an urgent task due later comes before a none task due earlier); `'keeps the waiting group in due-date order'`.
  - `task-scope.test.ts`: `'blocked shows only open tasks that wait for others'`.

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @oneohm/web exec vitest run src/features/today src/features/projects/control-room`
Expected: FAIL.

- [ ] **Step 3: Implement** the files above. Message keys: `projects.priority.{none,urgent,high,medium,low,set,label}`; `today.reason.{priority,blocksUrgent,overdue,blocks,blocksPayment,payment,due}` with ICU plurals (for example `"Blocks {count, plural, one {# task} other {# tasks}}{payment, select, true { and a payment} other {}}"`); `projects.panel.blocker` = `"{title} · {who}, {days, plural, =0 {on time} one {# day late} other {# days late}}"` and `projects.panel.blockerOutside` = `"{title} · waiting on the {party}"`; `projects.board.views.blocked`.

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `pnpm --filter @oneohm/web test && pnpm --filter @oneohm/web typecheck && pnpm exec biome check apps/web/src`
Expected: PASS, no errors.

- [ ] **Step 5: Check in the browser** (use a separate stack: the acceptance API with `--keep`, plus a web production build on :3300 with `API_INTERNAL_URL=http://127.0.0.1:4300`, as in phase 1):
  - Set Urgent in the panel; the icon shows on the list, kanban and Today.
  - Today orders the Urgent task first, with "Marked Urgent by …".
  - As a user without `tasks.assign`, there is no priority control.
  - The panel's "Waiting for" shows the person and days late.
  - The project's "Blocked" filter lists only blocked tasks.

- [ ] **Step 6: Commit** `feat(web): priority, do-next order on Today, richer blockers`

---

### Task 4: Mobile: same order and the same facts

**Files:**
- Modify: `apps/field/src/features/tasks/task-groups.ts` (sort with `rankTasks`, except `waiting` and `review`) + `task-groups.test.ts` (new case, plus fixture fields)
- Modify: `apps/field/src/features/tasks/task-row.tsx` (priority mark + reason line)
- Modify: `apps/field/src/features/tasks/task-screen.tsx` (priority in meta; blocker details; a "Blocking" card using `blocking`)
- Modify: `apps/field/src/copy/tasks.ts` (`TASK.priority.*`, `TASK.reason.*`, `TASK.blockingTitle`, `TASK.blocker(...)`)

**Interfaces:**
- Consumes: `rankTasks`, `doNextReason` (Task 1); the `ProjectTask` fields (Task 2). Mobile has no priority control (spec 3.3: assignees see it, managers set it on web).

- [ ] **Step 1: Write the failing test** in `task-groups.test.ts`: `'orders the overdue group by the do-next rule'`.

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @oneohm/field exec vitest run src/features/tasks/task-groups.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the sort, the row and screen additions, and the copy. Reason text is plain English, matching web wording.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @oneohm/field test && pnpm --filter @oneohm/field typecheck`
Expected: PASS, no errors.

- [ ] **Step 5: Commit** `feat(field): do-next order, priority and blockers on mobile`

---

### Task 5: Whole-phase check

- [ ] **Step 1:** Run `pnpm typecheck && pnpm test` and lint on all files this branch touched. Expected: all pass.
- [ ] **Step 2:** Run `pnpm test:acceptance 09-task-completion 22-task-blocking 23-task-priority`. Expected: PASS.
- [ ] **Step 3:** Walk through as a manager and as an assignee. The manager marks a blocked task Urgent. The assignee holding its blocker sees that blocker first on Today with "Blocks an Urgent task". The history shows who set the priority.
