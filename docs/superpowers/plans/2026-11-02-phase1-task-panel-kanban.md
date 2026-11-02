# Phase 1: Task Panel and Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every task on web opens a side panel with everything mobile shows, and the project Tasks tab gets a kanban board by status.

**Architecture:** The panel is one `Sheet` mounted once in the app layout and driven by a `?task=<id>` URL param, so any task surface opens it by setting the param. It loads the task with the existing `GET /tasks/:id` and reuses the existing task actions and dialogs, so web follows the same rules as mobile. The kanban reuses the same step rules (`primaryStep` / `menuSteps`) through one pure `boardMove()` function, so a drag can never do something a button cannot.

**Tech Stack:** Next.js 16 App Router, React, TanStack Query 5, ts-rest, zod, next-intl, in-house `@oneohm/design-system/web`, NestJS + Drizzle API, vitest. New: `@dnd-kit/core@6.3.1`.

**Spec:** `docs/superpowers/specs/2026-11-02-task-ownership-design.md` (sections 3.1, 3.2, 3.6; build order phase 1)

## Global Constraints

- Status changes stay transition based (start, waiting, complete, approve, return). No free status PATCH.
- Capabilities, not role names, decide who can do what.
- Every user-facing web string goes through next-intl, in `apps/web/messages/en-IN/*.json`.
- Office staff can do the work on web (owner decision 3A). Site-only actions (customer signature, GPS site check-in) are shown, not done, on web.
- The panel uses the same API and guards as mobile. No web-only rules.
- One action updates everything: every task change refreshes every cached view that shows tasks.
- Phone width: no horizontal page scroll; the `Sheet` goes full-screen on phones.
- Never reset or wipe the OneOhm database or volume.
- Every source file stays at or under 250 lines (`pnpm check:file-size`). Lint is Biome (`pnpm lint`).
- Work on a branch, not `main`. `main` has unrelated uncommitted changes: commit only the files each task names.

## Review Focus

1. Opening `?task=<id>` for a task the person cannot see (403) or that does not exist (404) shows a "Task not found" state, and Close still works.
2. Dropping a card that opens a dialog, then cancelling, leaves the card in its old column (no optimistic move).
3. Keyboard-only and touch users can move cards (dnd-kit keyboard and pointer sensors). A plain click on a card title opens the panel and does not start a drag.
4. Clicking the action button or "more" menu inside a card does not open the panel or start a drag.
5. A change made in the panel (start, complete, upload, note) refreshes the project list, kanban, Today, Command Center and the team views without a reload.

---

### Task 1: API returns what each task is blocking

**Files:**
- Modify: `packages/api-contracts/src/schemas/project.schema.ts` (in `projectTaskSchema`, after `changeBlockers`)
- Create: `apps/api/src/common/read-models/task-blocking.ts`
- Create: `apps/api/src/common/read-models/task-blocking.test.ts`
- Modify: `apps/api/src/common/read-models/project-tasks.ts` (`presentTasks`)
- Create: `apps/api/test/acceptance/scenarios/21-task-blocking.acceptance.ts`

**Interfaces:**
- Produces: `ProjectTask.blocking: string[]`: titles of open tasks that wait on this task. Empty when this task is completed.
- Produces: `blockingTitles(taskId: string, taskDone: boolean, dependents: readonly { dependsOnTaskId: string; title: string; status: TaskStatus }[]): string[]`

- [ ] **Step 1: Write the failing unit test** in `task-blocking.test.ts`

```ts
describe('blockingTitles', () => {
  const deps = [
    { dependsOnTaskId: 'a', title: 'Structure install', status: 'pending' },
    { dependsOnTaskId: 'a', title: 'Panel install', status: 'ready' },
    { dependsOnTaskId: 'a', title: 'Old step', status: 'completed' },
    { dependsOnTaskId: 'b', title: 'Other', status: 'pending' },
  ] as const;
  it('lists open tasks waiting on this one', () => {
    expect(blockingTitles('a', false, deps)).toEqual(['Structure install', 'Panel install']);
  });
  it('is empty once this task is done', () => {
    expect(blockingTitles('a', true, deps)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @oneohm/api exec vitest run src/common/read-models/task-blocking.test.ts`
Expected: FAIL, `blockingTitles` is not defined.

- [ ] **Step 3: Implement `blockingTitles` in `task-blocking.ts`**, then add `blocking: z.array(z.string())` to `projectTaskSchema` with the doc comment `/** Open tasks that wait for this one to finish. */`. In `presentTasks`, add one more query: `taskDependencies` joined to `projectTasks` on `taskDependencies.taskId`, where `taskDependencies.dependsOnTaskId in ids`, selecting `dependsOnTaskId`, `title`, `status`. Set `blocking: blockingTitles(task.id, task.status === 'completed', dependents)`.

- [ ] **Step 4: Run the unit test and the API typecheck**

Run: `pnpm --filter @oneohm/api exec vitest run src/common/read-models/task-blocking.test.ts && pnpm --filter @oneohm/api typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Write the acceptance scenario** `21-task-blocking.acceptance.ts`, in the style of `08-task-communication.acceptance.ts` (use `Session.admin()`, `sellProject`, `project` from `../support`). Test `'a blocked task names its blocker, and the blocker names it back'`: load the project, find a task with `blockedBy.length > 0`, find the task whose `title` is `blockedBy[0]`, and expect that task's `blocking` to contain the first task's title.

- [ ] **Step 6: Run it** (needs the local stack running)

Run: `pnpm test:acceptance -- 21-task-blocking`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api-contracts/src/schemas/project.schema.ts apps/api/src/common/read-models/task-blocking.ts apps/api/src/common/read-models/task-blocking.test.ts apps/api/src/common/read-models/project-tasks.ts apps/api/test/acceptance/scenarios/21-task-blocking.acceptance.ts
git commit -m "feat(tasks): return the tasks each task is blocking"
```

---

### Task 2: One rule for kanban moves

**Files:**
- Create: `apps/web/src/features/projects/tasks/board-moves.ts`
- Create: `apps/web/src/features/projects/tasks/board-moves.test.ts`

**Interfaces:**
- Consumes: `primaryStep`, `menuSteps`, `TaskStep`, `TaskRights` from `./task-menu`; `isBlocked` from `./task-status`.
- Produces:
  ```ts
  export const BOARD_COLUMNS = ['pending', 'ready', 'in_progress', 'waiting', 'in_review', 'completed'] as const;
  export type BoardColumn = (typeof BOARD_COLUMNS)[number];
  export type BoardMove =
    | { readonly kind: 'step'; readonly step: TaskStep }
    | { readonly kind: 'denied'; readonly reason: 'blocked' | 'backwards' | 'notAllowed' | 'same' };
  export function boardMove(task: ProjectTask, to: BoardColumn, rights: TaskRights): BoardMove;
  export function boardColumns(tasks: readonly ProjectTask[]): Record<BoardColumn, ProjectTask[]>;
  ```

`boardMove` picks the first step key, from this list for the target column, that appears in `[primaryStep(...), ...menuSteps(...)]`:

| Target column | Step keys, in order |
|---|---|
| `in_progress` | `start`, `resume`, `sendBack` |
| `waiting` | `waiting` |
| `in_review` | `complete` |
| `completed` | `approve`, `complete` |
| `pending`, `ready` | none (always `backwards`) |

When no step matches: `same` if `to === task.status`; `backwards` for `pending` or `ready`; `blocked` if `isBlocked(task)`; otherwise `notAllowed`.

`boardColumns` groups by `task.status`. Inside each column, sort overdue first, then by `dueDate`.

- [ ] **Step 1: Write the failing tests** in `board-moves.test.ts`. Build tasks with a small `taskOf(partial)` helper that fills a valid `ProjectTask`.

```ts
const worker: TaskRights = { work: true, manage: false, assign: false, review: false };
const reviewer: TaskRights = { work: false, manage: false, assign: false, review: true };
it('starts a ready task dropped on In progress', () =>
  expect(boardMove(taskOf({ status: 'ready' }), 'in_progress', worker)).toMatchObject({ kind: 'step', step: { key: 'start' } }));
it('opens complete when a task in progress is dropped on Done', () =>
  expect(boardMove(taskOf({ status: 'in_progress' }), 'completed', worker)).toMatchObject({ step: { key: 'complete' } }));
it('approves when a reviewer drops a task in review on Done', () =>
  expect(boardMove(taskOf({ status: 'in_review' }), 'completed', reviewer)).toMatchObject({ step: { key: 'approve' } }));
it('sends back when a reviewer drops a task in review on In progress', () =>
  expect(boardMove(taskOf({ status: 'in_review' }), 'in_progress', reviewer)).toMatchObject({ step: { key: 'sendBack' } }));
it('refuses a blocked task', () =>
  expect(boardMove(taskOf({ status: 'pending', blockedBy: ['Survey'] }), 'in_progress', worker)).toEqual({ kind: 'denied', reason: 'blocked' }));
it('refuses moving back to not started', () =>
  expect(boardMove(taskOf({ status: 'in_progress' }), 'ready', worker)).toEqual({ kind: 'denied', reason: 'backwards' }));
it('refuses someone without rights', () =>
  expect(boardMove(taskOf({ status: 'in_progress' }), 'completed', { ...worker, work: false })).toEqual({ kind: 'denied', reason: 'notAllowed' }));
it('puts overdue tasks first in a column', () => {
  const cols = boardColumns([taskOf({ id: '1', status: 'ready', dueDate: '2026-11-01' }), taskOf({ id: '2', status: 'ready', dueDate: '2026-10-01', overdue: true })]);
  expect(cols.ready.map((t) => t.id)).toEqual(['2', '1']);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @oneohm/web exec vitest run src/features/projects/tasks/board-moves.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement `board-moves.ts`** as specified above.

- [ ] **Step 4: Run the tests**

Run: same command as Step 2.
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/projects/tasks/board-moves.ts apps/web/src/features/projects/tasks/board-moves.test.ts
git commit -m "feat(web): one rule for kanban moves, shared with task buttons"
```

---

### Task 3: Let anything run a task step (refactor, no behaviour change)

**Files:**
- Create: `apps/web/src/features/projects/tasks/use-task-steps.tsx`
- Modify: `apps/web/src/features/projects/tasks/task-actions.tsx`
- Modify: `apps/web/src/features/projects/tasks/use-task-actions.ts` (`useInvalidateWork`)

**Interfaces:**
- Produces:
  ```ts
  export function useTaskRights(task: ProjectTask): TaskRights;
  export function useTaskSteps(task: ProjectTask): {
    readonly rights: TaskRights;
    readonly primary: TaskStep | null;
    readonly menu: readonly TaskStep[];
    readonly run: (step: TaskStep) => void;
    readonly pendingKey: string | null;   // 'start' | 'approve' while that quick action runs
    readonly dialogs: ReactNode;          // the six dialogs, to render once
  };
  ```

- [ ] **Step 1: Move the rights calculation, the `run` function, the dialog state and the six dialog elements out of `TaskActions` into `useTaskSteps`.** `TaskActions` keeps only the button, the popover and `{steps.dialogs}`. Keep the comment about "a new key per opening".

- [ ] **Step 2: Add `['team']` to `useInvalidateWork`** so task changes also refresh team capacity, points and workload (spec 3.6).

- [ ] **Step 3: Typecheck and run the web tests**

Run: `pnpm --filter @oneohm/web typecheck && pnpm --filter @oneohm/web test`
Expected: no errors, all tests pass.

- [ ] **Step 4: Check by hand.** Open a project Tasks tab. Start a task, add an update, then cancel the complete dialog. All work as before.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/projects/tasks/use-task-steps.tsx apps/web/src/features/projects/tasks/task-actions.tsx apps/web/src/features/projects/tasks/use-task-actions.ts
git commit -m "refactor(web): task steps can be run from any surface"
```

---

### Task 4: The task panel

**Files:**
- Create: `apps/web/src/features/projects/task-panel/task-panel-url.ts`
- Create: `apps/web/src/features/projects/task-panel/task-panel-url.test.ts`
- Create: `apps/web/src/features/projects/task-panel/use-task-panel.ts`
- Create: `apps/web/src/features/projects/task-panel/task-panel.tsx` (host + sheet)
- Create: `apps/web/src/features/projects/task-panel/task-panel-body.tsx` (the sections)
- Create: `apps/web/src/features/projects/task-panel/task-timeline.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx` (mount `<TaskPanel />` once inside `CurrentUserProvider`)
- Modify: `apps/web/messages/en-IN/projects.json` (new `projects.panel.*` keys)

**Interfaces:**
- Consumes: `useTaskSteps` (Task 3); `ProjectTask.blocking` (Task 1); `api.tasks.getTask`, `api.tasks.taskActivity`; existing `EvidenceUploader`, `TaskCardNotes`, `TaskVisitLine`, `StatusPill`, `Sheet`.
- Produces:
  ```ts
  export const TASK_PARAM = 'task';
  export function withTask(search: string, taskId: string | null): string; // returns '?…' or ''
  export function useTaskPanel(): { readonly taskId: string | null; readonly open: (id: string) => void; readonly close: () => void };
  export const taskKey = (id: string) => ['tasks', 'detail', id] as const;
  ```

- [ ] **Step 1: Write the failing test** for `withTask`

```ts
it('adds the task and keeps other params', () =>
  expect(withTask('?tab=tasks&layout=list', 't1')).toBe('?tab=tasks&layout=list&task=t1'));
it('replaces an open task', () => expect(withTask('?task=t1', 't2')).toBe('?task=t2'));
it('removes it and leaves nothing when empty', () => expect(withTask('?task=t1', null)).toBe(''));
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @oneohm/web exec vitest run src/features/projects/task-panel/task-panel-url.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement `withTask` and `useTaskPanel`.** `useTaskPanel` reads the param with `useSearchParams` and changes it with `router.replace(pathname + withTask(...), { scroll: false })`, like `use-room-tab.ts`.

- [ ] **Step 4: Run the test**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Build `TaskPanel`.** When `taskId` is set, render `Sheet` (`side="right"`, `width="lg"`) and load the task with `useQuery({ queryKey: taskKey(id), queryFn: () => expectStatus(api.tasks.getTask({ params: { id } }), 200) })`. While loading, show `ListSkeleton`. On a 403 or 404, show `EmptyState` with `projects.panel.notFound`. Any other error shows `LoadError`. Closing calls `close()`.

- [ ] **Step 6: Build `TaskPanelBody`.** Sections, in order, each hidden when it has nothing:
  1. Header: project code and name (a link when `useCan('projects.view_all')`), title, status pill, assignee, due date, stage, reviewer. Then the primary button and the menu from `useTaskSteps`, and `{dialogs}`.
  2. Description.
  3. `TaskCardNotes` (returned work).
  4. **Waiting for:** `task.blockedBy`, each on its own line with a lock icon.
  5. **Blocking:** `task.blocking`, with the count in the heading.
  6. Checklist: `task.checklist`, read-only, with ticks for `done`.
  7. Facts: `task.captureFields` with values from `task.knownFacts`, read-only.
  8. Files: `EvidenceUploader` (upload and remove while the task is open). Signature files show as thumbs; the panel never offers signing.
  9. Site visit: `TaskVisitLine`.
  10. Timeline: `TaskTimeline`, the latest 10 entries from `api.tasks.taskActivity`, with query key `['tasks', 'activity', id]`, plus a "Post update" button that runs the `update` step when it is in the menu.

  Ticking checklist items and filling facts still happens in the existing complete dialog. Do not add a second way to save them.

- [ ] **Step 7: Mount `<TaskPanel />`** in the app layout. Add the message keys: `panel.notFound`, `panel.waitingFor`, `panel.blocking` (with an ICU count), `panel.checklist`, `panel.facts`, `panel.files`, `panel.timeline`, `panel.postUpdate`, `panel.close`.

- [ ] **Step 8: Typecheck and test**

Run: `pnpm --filter @oneohm/web typecheck && pnpm --filter @oneohm/web test`
Expected: no errors, all tests pass.

- [ ] **Step 9: Check by hand** with the dev server (`run` skill or `pnpm --filter @oneohm/web dev`):
  - Open `/projects/<id>?tab=tasks&task=<taskId>`: the panel opens.
  - Refresh: it is still open. Escape closes it and removes `task=` from the URL.
  - Try a made-up id: "Task not found".
  - Start the task from the panel: the status updates in the panel and in the list behind it.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/projects/task-panel apps/web/src/app/\(app\)/layout.tsx apps/web/messages/en-IN/projects.json
git commit -m "feat(web): task panel with everything mobile shows"
```

---

### Task 5: Every task surface opens the panel

**Files:**
- Modify: `apps/web/src/features/projects/tasks/task-card.tsx` (title)
- Modify: `apps/web/src/features/projects/control-room/task-table.tsx` (title cell)
- Modify: `apps/web/src/features/command-center/tasks/task-board-table.tsx` (title cell)

**Interfaces:**
- Consumes: `useTaskPanel().open` (Task 4).

- [ ] **Step 1: Make the task title a `<button type="button">`** that calls `open(task.id)`, styled as the title text with a hover underline and a focus outline. Only the title is the button, not the whole row, so the action buttons and menu keep working. Today / My work uses `TaskCard`, so it gets this for free.

- [ ] **Step 2: In the Command Center task board,** the title opens the panel. Keep the existing project link next to it.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @oneohm/web typecheck`
Expected: no errors.

- [ ] **Step 4: Check by hand.** Click a title on the project list, project stages view, Today and Command Center. Each opens the panel. Clicking the action button on a card does not open the panel. Tab to a title and press Enter: the panel opens.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/projects/tasks/task-card.tsx apps/web/src/features/projects/control-room/task-table.tsx apps/web/src/features/command-center/tasks/task-board-table.tsx
git commit -m "feat(web): task titles open the task panel everywhere"
```

---

### Task 6: Kanban board

**Files:**
- Modify: `apps/web/package.json` (add `"@dnd-kit/core": "6.3.1"`)
- Create: `apps/web/src/features/projects/control-room/task-kanban.tsx`
- Create: `apps/web/src/features/projects/control-room/kanban-card.tsx`
- Modify: `apps/web/src/features/projects/control-room/use-room-tab.ts` (`TASK_LAYOUTS = ['board', 'list', 'kanban']`)
- Modify: `apps/web/src/features/projects/control-room/tasks-tab.tsx` (third layout option)
- Modify: `apps/web/messages/en-IN/projects.json` (`projects.kanban.*`, `projects.tasksTab.kanban`, rename the `board` label to "Stages")

**Interfaces:**
- Consumes: `boardMove`, `boardColumns`, `BOARD_COLUMNS` (Task 2); `useTaskSteps` (Task 3); `useTaskPanel` (Task 4); `ProjectTask.blocking` (Task 1).

The existing `?layout=board` key stays the stage view (labelled "Stages"), so old links still work. The kanban is `?layout=kanban`.

- [ ] **Step 1: Install the library**

Run: `pnpm --filter @oneohm/web add @dnd-kit/core@6.3.1`
Expected: `package.json` and `pnpm-lock.yaml` updated.

- [ ] **Step 2: Build `KanbanCard`.** It shows the title (a button that opens the panel), assignee, due date (overdue in the overdue tone), stage, the rework badge, a lock with "Waiting for: …" when blocked, and "Blocking N" when `blocking.length > 0`. Each card calls `useTaskSteps(task)` and renders its `dialogs`. The card is draggable via `useDraggable`. Use a drag handle area that excludes the title button and the action button.

- [ ] **Step 3: Build `TaskKanban`.** It renders one droppable column per entry in `BOARD_COLUMNS`, using `boardColumns(shown)`, each with a heading and count. The Done column shows the count and a "Show" toggle, folded by default. Use `DndContext` with a `PointerSensor` (`activationConstraint: { distance: 6 }`), a `TouchSensor` (`delay: 200, tolerance: 6`) and a `KeyboardSensor`, and set the announcements for screen readers from messages. On drop:
  - `boardMove(...)` returns a step: call that card's `run(step)`. Quick steps run at once; dialog steps open the same dialog as the button.
  - It returns denied: show a toast with `projects.kanban.denied.<reason>`. Skip the toast for `same`.
  - Never move a card on the client. Columns come only from server data after the refresh.

  On phones and narrow screens, the columns scroll sideways inside the board container, with a minimum width of about 16rem each. The page itself never scrolls sideways.

- [ ] **Step 4: Add the layout option** in `tasks-tab.tsx`: `{ value: 'kanban', label: tabT('kanban'), icon: <Columns3 aria-hidden /> }`, rendering `<TaskKanban tasks={shown} />`. The Open / Mine / All filter still applies.

- [ ] **Step 5: Typecheck and test**

Run: `pnpm --filter @oneohm/web typecheck && pnpm --filter @oneohm/web test`
Expected: no errors, all tests pass.

- [ ] **Step 6: Check by hand** at desktop width and at phone width (375px):
  - Drag a ready task to In progress: it starts.
  - Drag an in-progress task to Done: the complete dialog opens. Cancel it: the card stays in In progress.
  - Drag a blocked card: the "blocked" toast shows and the card stays.
  - Drag a card back to Ready: the "backwards" toast shows.
  - Move a card with the keyboard (focus the handle, press Space, use the arrow keys, press Space).
  - Click a title: the panel opens and no drag starts.
  - No sideways page scroll at 375px.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/features/projects/control-room/task-kanban.tsx apps/web/src/features/projects/control-room/kanban-card.tsx apps/web/src/features/projects/control-room/use-room-tab.ts apps/web/src/features/projects/control-room/tasks-tab.tsx apps/web/messages/en-IN/projects.json
git commit -m "feat(web): kanban board for project tasks"
```

---

### Task 7: Whole-phase check

- [ ] **Step 1: Run everything**

Run: `pnpm check` (lint, file size, typecheck, tests)
Expected: all pass.

- [ ] **Step 2: Run the acceptance tests for tasks**

Run: `pnpm test:acceptance -- 08-task-communication 09-task-completion 21-task-blocking`
Expected: PASS.

- [ ] **Step 3: Walk through as two people.** As an office staff user: open a task from Today, upload a document in the panel, then complete the task from the panel. As a reviewer: drag that task from In review to Done on the kanban. Check that Today, the project list, the kanban and Command Center all show it done without a reload.
