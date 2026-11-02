# Task ownership: clear priority, visible blockers, fair points

Date: 2026-11-02
Status: draft, owner answers in (1A 2A 3A), waiting for final approval

## 1. Why

Today, people do not know which task to do first. Important tasks wait while easy ones get done.
People also do not update task status. So the owner must keep chasing staff and reminding them
of priorities, and the customer and the business do not get clear updates.

The original goal (PRD 3.12) is that employees take ownership of their work and get fair,
visible benefits for doing it well. The owner later decides whether points become money.

Success looks like this:

- Each person always knows their next task and why it is next.
- Blockers are visible to everyone, with who holds them and for how long.
- Status stays current without the owner chasing. The system sends the reminders.
- Points are fair. They count only what the person controls, and each point has a readable reason.
- One action updates every place that shows it: project history, customer timeline,
  dashboards, points, kanban, web and mobile. (Past bug: converting a lead to a customer did not
  update the lead history. That must not happen here.)
- The learning curve is low. No new concepts beyond priority, Do next, blockers and points.

### Goals
- Clickable tasks on web with a full task panel (same content as mobile).
- Kanban board by status.
- Priority: automatic order plus optional manual priority (Linear style).
- "Do next" list for each person.
- Blockers and "blocking" shown on every task surface.
- Reminders and escalation that actually run.
- Fair, connected points, with a monthly owner review per person.
- Project health (On track / At risk / Off track) worked out by the system.

### Non-goals
- Time tracking or timesheets.
- Task size estimates or story points (Linear style velocity). Capacity stays "open tasks against
  a limit" for now. We can add sizes later.
- Automatic payouts. Money is always the owner's decision.
- Recalculating past points.

### Anti-goals (a failure even if it works)
- Notification noise. With 100+ projects per person, a ping per task change is a failure.
- Points that feel unfair or unexplained.
- Any place that shows stale data after a change somewhere else.
- A new screen that needs training.

## 2. Current state (facts from the code)

- Web task rows do nothing on click. There is no web task detail. `ResponsiveTable` has no row
  click (`packages/design-system/src/web/layout/responsive-table.tsx`). `TaskCard` is a plain
  `li` (`apps/web/src/features/projects/tasks/task-card.tsx`).
- The mobile task screen is complete: `apps/field/src/features/tasks/task-screen.tsx` (notes,
  blocked-by, site visit, checklist, evidence, facts form, signature, timeline, reviewer).
- API: `GET /tasks/:id`, `/tasks/:id/activity`, `/tasks/:id/updates`, and the transition endpoints
  `start, waiting, complete, approve, assign, reschedule, return`. There is no generic status PATCH.
- The "Board" layout on a project is a list grouped by EPC stage, not a kanban
  (`apps/web/src/features/projects/control-room/task-board.tsx`). No drag-and-drop library is installed.
- Statuses: `pending | ready | in_progress | waiting | in_review | completed`. Waiting has a party:
  `internal | customer | bank | discom`. Wait periods are recorded (`projects/task-waits.ts`).
- Dependencies are enforced on the server (`task-guards.ts assertUnblocked`). Finishing a task moves
  dependents from `pending` to `ready`. A late finish shifts dependents later (`task-schedule.ts`).
- `finishTask` (`task-completion.ts`) already updates payments, customer notices, project status and
  history in one transaction. This is the pattern for "one action updates everything".
- Tasks have no priority field.
- Escalation and reminders already run. The Temporal worker job `daily-operations.workflow.ts`
  runs each morning (08:41). `apps/worker/src/activities/escalations.ts` reads `escalation_policy`
  and per-template `escalateAfterDays`, sends late tasks to the project manager, then to holders of
  `projects.manage`, and flags tasks stuck on internal or outside waits. Each step is sent once
  (dedupe keys). `apps/worker/src/activities/staff-digest.ts` sends one morning summary per person
  (in-app, push, WhatsApp) with overdue, due today and lead follow-ups.
- Instant task notices already exist (`task-notices.ts`, `task-flow.service.ts`): assigned, ready
  for review, returned, approved, rescheduled, messages.
- `dueDate` is NOT NULL. `completedByUserId` exists. Only `projects.manage` or `tasks.assign`
  holders can reschedule.
- Points: `points_entries` with `sourceType` and `sourceId`. `awardOnTimeTask`
  (`workforce/points.ts`) runs inside `finishTask`. Bonuses, standings, achievements and the
  "My rewards" mobile screen exist.
- Capacity: `GET /team/capacity` gives open tasks against a limit, due-by-week and leave-by-week.

### Bugs found in current points logic
1. **Customer, bank or DISCOM waits still cost points.** On-time compares today with `dueDate`.
   A task that waited 10 days on the customer and finished late gets 0. The code comment says
   this never happens, but it does.
2. **On-time uses the approval day.** For reviewed tasks, `finishTask` runs on approve. A slow
   reviewer makes an on-time submission count as late.
3. **All points go to the last assignee.** Reassigned work gives the full credit to whoever holds
   the task when it is approved.

## 3. Design

### 3.1 Task panel (web)
- A click on a task anywhere on web (project list, project board, kanban, Today / My work,
  Command Center) opens a side panel (`Sheet`). The URL carries `?task=<id>` so the panel can be
  linked and survives a refresh. Back and Escape close it.
- Sections match mobile: header (project, title, status, priority), meta (assignee, dates, stage,
  reviewer), notes and updates, **Waiting for** (blockers), **Blocking** (dependents, new),
  site visit, checklist, facts form, evidence and documents, signature, timeline.
- **Decision (owner confirmed):** office staff can do the work on web, not only look:
  tick the checklist, upload documents and photos, fill in facts, add notes, change status,
  complete. Site-only actions (customer signature, GPS site check-in) are shown but done on mobile.
- The panel uses the same API and the same guards as mobile. No web-only rules.

### 3.2 Kanban
- A third layout on the project Tasks tab: `?layout=board` becomes the kanban. The current
  stage-grouped view stays as "Stages".
- Columns are the six statuses. Done folds to a count with "show".
- Cards show: title, priority icon, assignee, due date (red when late), stage, a lock with
  "Waiting for: X" when blocked, and "Blocking N" when others wait on it.
- Dragging calls the same transition as the button. A move that needs input (complete needs
  proof; waiting needs a party; review needs approval rights) opens that same dialog. If the
  dialog is cancelled, the card goes back.
- Illegal moves do not happen. A blocked card cannot move to In progress (the reason shows). A
  person without the right capability cannot drag to Done or approve. The allowed moves come
  from one shared function that the buttons also use.
- Keyboard and touch work too (accessible drag-and-drop). The library choice is left to the builder.
- A cross-project kanban for "My tasks" uses the same component.

### 3.3 Priority and Do next
- New task field `priority`: `none | urgent | high | medium | low`, default `none`. Shown as a
  Linear-style icon on every task surface, web and mobile.
- Only people with `tasks.assign` (managers and the owner) can set it. The assignee sees it.
  Every change goes into the task history with who changed it and when.
- **Do next order** for one person's open, startable tasks:
  1. Manual priority, if set (urgent, high, medium, low).
  2. Then the automatic order: overdue first, then tasks that block others (more blocked work
     first, and anything that unlocks a payment milestone or the customer), then the earliest due date.
  3. Ties go to the oldest task. (Every task has a due date.)
- Each task in Do next shows its reason in plain words. Examples: "Overdue 2 days".
  "Blocks 3 tasks and a payment." "Marked Urgent by Asha."
- A blocked Urgent task is not startable. Its blocker goes to the top of Do next for the person
  who holds the blocker, with the reason "Blocks an Urgent task".
- Tasks waiting on the customer, bank or DISCOM leave Do next. They show in a separate "Waiting
  on others" group, which already exists on Today.
- The ranking lives in one shared domain function (in `packages/domain`), used by the API, web and mobile.

### 3.4 Blockers
- Every task surface shows "Waiting for: <task> (<person>, N days late)" and "Blocking: N tasks".
- If the blocker waits on the customer, bank or DISCOM, say so. Example: "Waiting for: Bank loan
  approval (bank, 6 days)". This makes it clear nobody on the team is at fault.
- If the person holding a blocker is on leave, their manager is told.
- On the project page, a "Blocked" filter lists everything that is held up and by what.

### 3.5 Reminders, stale tasks and escalation
- **Extend the existing worker jobs. Do not build a second reminder system** (it would send
  double notices). Add to `escalations.ts` and `staff-digest.ts`:
  - **Stale:** a task in progress or ready with no update for `stuckInternalDays` gets a stale
    badge and a reminder to the assignee.
  - **Late:** overdue by `managerAfterDays` goes to the manager. Overdue by `ownersAfterDays`
    goes to the owners.
  - **Waiting outside:** waiting on the customer, bank or DISCOM for `stuckOutsideDays` goes to
    the person who owns the follow-up (the assignee or project manager), not as blame.
- Stale is new: a task in progress or ready with no update for `stuckInternalDays`.
- Any update clears the stale state: a status change, note, checklist tick, upload or facts change.
- **No noise:** the existing daily summary gains stale, urgent and blocking counts ("You have 3
  overdue, 2 stale, 1 urgent"). New reminders go into the summary. Only Urgent priority is new as
  an instant notice. Existing instant notices that ask a person to act (assigned, ready for review,
  returned) stay instant (Claude's call). Each reminder is sent once per step (existing dedupe keys).
- **Who is "the manager":** keep the existing rule: the project manager, then holders of
  `tasks.assign` / `projects.manage` (Claude's call). The same rule is used for the blocker-on-leave notice.
- Days on approved leave do not count toward stale or late for that person.

### 3.6 One action updates everything
- Every task change goes through one server path that, in the same transaction, writes the task,
  the project history, the customer timeline when the task is customer-visible, points effects,
  and stale-state clearing. It then refreshes every cached view that shows tasks (project,
  projects list, my tasks, command center, capacity, kanban, rewards).
- New events (priority change, reassign, document upload, checklist tick) use the same path. A
  change in one place never needs a second manual step somewhere else.
- Tests prove each action updates every place listed above.

### 3.7 Points (fair and connected)
Points stay task by task and automatic. The owner approves each person's month.

**What earns points for a task** (policy values set in Settings, like today):
1. **On time:** handed in by the due date. The time spent waiting on the customer, bank or DISCOM
   (from the recorded wait periods) and approved leave days are added to the due date first.
2. **First-time right:** approved without being sent back. Each return lowers it.
3. **Complete proof:** all required evidence, checklist and facts present at hand-in.
4. **Ratings:** customer and stage ratings, as today (suggested, then approved by a manager).

**Rules**
- **Points never go down (owner decision).** Late work, rework or missing proof earn 0 for that
  part. They are shown as zero-point reason rows ("missed" entries), not deductions. The only
  negative entry allowed is a correction of a points mistake (see below).
- **Points count right away (owner decision).** Task points are written as `approved`, as today.
  The monthly review does not hold points back. It only decides money.
- **First-time right** is earned only when the task is approved with zero returns.
- On-time is judged on the **hand-in time** (when the person marked it complete), not the
  approval time. This needs a stored submitted-at time.
- **Due date moves:** if a manager reschedules, judge against the new date. If the assignee
  reschedules their own task, judge against the date before their change. A late upstream task
  that shifts dependents (`task-schedule.ts`) counts as a manager-side move for the dependents.
- **Reassignment:** credit goes to the person who handed the task in. The earlier holder gets
  nothing for the task, and loses nothing either. (Simple rule. A split credit is a possible later change.)
- **Points are never deleted.** Any correction is a new negative entry with a reason, linked to the
  original. Today, approved tasks cannot reopen. If reopen is ever added, it must reverse the
  task's points this way.
- **Every entry has a readable reason**, including lost chances. Example: "Sent back 2 times:
  first-time right not earned".
- **Partner crews and resellers** are paid, not scored (already true).
- **Cancelled projects or deleted tasks:** points already earned stay, with a note.
- **Past points stay unchanged.** New rules apply from the start date only.
- **Fair comparison:** the monthly review shows rates (for example, on-time % and first-time-right
  %) and the number of tasks, so a person with 3 tasks and a person with 300 can be compared.

**Employee view ("My rewards", web and mobile)**
- This month's points, rates, and the trend.
- A list of points earned and lost, each with its reason and a link to the task.
- Filter by project.

**Owner view (monthly review)**
- One row per staff person: points, on-time %, first-time-right %, proof %, rating average, tasks
  done, trend, and weak spots.
- Open a person to see the detail by project and by task.
- The owner decides each person's month: no money, or a bonus amount. Points are already counted
  either way. A bonus goes through the existing bonus path (proposed, then approved by someone
  with `finance.approve_payments`, then a payable). The monthly review creates a proposed bonus.
- A project page also shows who did well on that project (look-up only).

### 3.8 Project health
- On track / At risk / Off track, worked out by the system from overdue, stale and blocked tasks
  on the critical path. Waits on outside parties are shown separately and do not make the team
  look at fault. Rules and thresholds are left to the builder, with defaults in Settings.

## 4. Build order
Each phase can be released on its own.
1. Task panel (web, at parity with mobile) and kanban.
2. Priority, Do next, and blockers on every surface (web and mobile).
3. Stale tasks, urgent notices, and new counts in the existing worker escalation and daily summary.
4. Points fixes (the 3 bugs), the new points parts, "My rewards" on web, the monthly owner review.
5. Project health.

## 5. Constraints
- Monorepo: Next.js web, Expo mobile, NestJS API, Drizzle and Postgres, ts-rest contracts,
  TanStack Query, in-house design system (Radix based). Reuse these.
- Status changes stay transition based. No free status PATCH.
- Capabilities, not role names, decide who can do what.
- Every user-facing string goes through next-intl (web) and the copy files (mobile).
- Database changes use migrations. Existing data must keep working (priority defaults to `none`).
- Never reset or wipe the OneOhm database or volume.

## 6. Left to the builder
- Drag-and-drop library (must support keyboard and touch).
- Exact layout of the panel and kanban, within the design system.
- Exact stale and health thresholds (defaults in Settings).
- Exact daily summary channel and time (in-app, plus WhatsApp if already used for staff).
- How the ranking reasons are worded, kept short and plain.

## 7. Calls made by Claude (owner to check)
- The monthly review creates a *proposed* bonus, so the existing approval split still applies (3.7).
- Only managers and the owner set priority (3.3).
- Reassigned tasks give full credit to the person who hands in (3.7).
- Self-moved due dates are judged on the old date (3.7).
- New reminders go into the daily summary. Existing act-now notices stay instant (3.5).
- "Manager" means the project manager, as the existing escalation already does (3.5).
