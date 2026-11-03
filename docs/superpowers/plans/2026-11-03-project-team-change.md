# Project Team Change — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make changing a project's manager, named team and target finish safe: fair credit, no stuck saves or reviews, no lost tasks or chats, and the customer is told.

**Architecture:** A new `project_manager_terms` table records who managed a project and when; rating points and manager report filters read it instead of only `projects.managerUserId`. `ProjectTeamService.update` becomes the one place that applies a team change: rules (who may manage, locked projects, version check), task handover, `outsideTeam` recompute, chat move, customer message, notices, timeline and audit. The web team sheet and team panel follow the new contract.

**Tech Stack:** NestJS + drizzle-orm (Postgres) in `apps/api`, worker in `apps/worker`, Next.js + react-query in `apps/web`, zod contracts in `packages/api-contracts`, pure rules in `packages/domain` (vitest), end-to-end tests in `apps/api/test/acceptance` (`pnpm test:acceptance <filter>`).

**Spec:** The review in this session and the owner's 6 decisions:
1. Manager credit is split by date: the old manager keeps work done before the change.
2. Removing a person who holds open tasks asks "move them to …?" before saving.
3. The customer is told (WhatsApp + in-app) when the manager changes.
4. Only people who can see projects (`projects.view_all`) can be manager.
5. Chats move only when the project is the customer's newest live project.
6. Completed and cancelled projects are locked for team changes.
Plus the bugs found: inactive manager/member blocks save; inactive manager blocks reviews; escalations never reach a new manager; double rating credit; stale `outsideTeam`; team panel ignores the named team; lost updates.

## Global Constraints

- Work on a new branch `fix/project-team-change`. `main` is 23 commits ahead of origin; do not push.
- Never touch the `oneohm-postgres` volume. Migrations run with `pnpm --filter @oneohm/database db:migrate`.
- New migration number: `0064_project_manager_terms.sql` (generate with `pnpm --filter @oneohm/database db:generate`, then append the backfill SQL by hand).
- "Live" project = status `active` or `operational`. "Locked" = `completed` or `cancelled`.
- Staff copy follows the repo style: short, plain English; every web string goes in `apps/web/messages/en-IN/project-team.json` (and the same keys in other locales present under `apps/web/messages/`).
- New WhatsApp template key: `project_manager_changed`, fields `customer, project, manager, phone`, audience `customer`. Body: `Hello {{1}}, your solar project {{2}} now has a new project manager: {{3}}. You can reach them on {{4}}. Reply here if you have any questions.`
- Files must pass `pnpm check:file-size`. Split a file before it goes over the limit.
- Run `pnpm lint && pnpm typecheck` before each commit.

## Review Focus

1. A project with **no manager** (created with "manager later") — terms table has no open term; rating points, reports and the customer message must skip quietly, not crash.
2. **Same manager re-saved** — no new term, no customer message, no chat move, no notice.
3. **Manager changed twice on the same day** — a zero-length term must get 0 points and not break the split.
4. **Handover target is the person being removed, or inactive** — must be rejected with a field error.
5. **Customer has 2 live projects** with different managers — changing the manager of the older one must not move the chat.

Each line has a test in the owning task (Tasks 1, 3, 7, 8).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/database/src/schema/project-team.schema.ts` | add `projectManagerTerms` table |
| `packages/database/migrations/0064_project_manager_terms.sql` | table + backfill |
| `packages/database/src/manager-terms.ts` (new) | `openManagerTerm`, `managerTermsOf` |
| `packages/domain/src/workforce/rating-split.ts` (new) | pure split of rating points by term |
| `packages/domain/src/tasks/project-assignment.ts` | add `outsideTeamFor` |
| `apps/api/src/modules/workforce/points.ts` | split + withdraw rating points |
| `apps/api/src/modules/business-reports/report-scope.ts` | manager filter by term overlap |
| `apps/api/src/modules/projects/project-team-rules.ts` (new) | `checkManagerCandidate`, `assertTeamEditable` |
| `apps/api/src/modules/projects/project-team-handover.ts` (new) | move removed people's open tasks |
| `apps/api/src/modules/projects/project-team-notices.ts` (new) | notices, timeline lines, customer message |
| `apps/api/src/modules/projects/project-team.service.ts` | orchestrates the above |
| `apps/api/src/modules/whatsapp/chat-owner.ts`, `packages/database/src/chat-team.ts` | live-project rule |
| `apps/api/src/modules/projects/task-review.ts`, `packages/database/src/pending-approvals.ts`, `apps/worker/src/activities/escalations.ts`, `apps/worker/src/activities/stale-reminders.ts` | inactive manager + dedupe keys |
| `packages/api-contracts/src/schemas/project-team.schema.ts`, `project.schema.ts` | contract changes |
| `apps/web/src/features/projects/team/*`, `.../overview/team-panel.tsx` | UI |
| `apps/api/test/acceptance/scenarios/47-project-team-change.acceptance.ts` (new) | end-to-end tests |

---

### Task 1: Manager terms (history of who managed when)

**Files:**
- Modify: `packages/database/src/schema/project-team.schema.ts`
- Create: `packages/database/migrations/0064_project_manager_terms.sql`
- Create: `packages/database/src/manager-terms.ts` (export from `packages/database/src/index.ts`)
- Modify: `apps/api/src/modules/projects/project-creation.service.ts:153-183`
- Test: `apps/api/test/acceptance/scenarios/47-project-team-change.acceptance.ts`

**Interfaces:**
- Produces:
  - table `projectManagerTerms`: `id primaryId()`, `projectId uuid notNull → projects cascade`, `userId uuid notNull → users cascade`, `startedAt instant notNull`, `endedAt instant null`, `createdAt`. Index `(project_id)`, partial unique index `project_manager_terms_open_unique` on `(project_id) WHERE ended_at IS NULL`.
  - `openManagerTerm(tx: Transaction, projectId: string, userId: string | null, at: Date): Promise<void>` — closes the open term (`endedAt = at`) and, when `userId` is not null, inserts a new open term. No-op when the open term already belongs to `userId`.
  - `managerTermsOf(db: DatabaseExecutor, projectId: string): Promise<ManagerTerm[]>` with `ManagerTerm = { userId: string; startedAt: Date; endedAt: Date | null }`, ordered by `startedAt`.

- [ ] **Step 1: Write the failing test** `it('records a manager term at creation and on each change')`: sell a project (`sellProject`), PATCH `/projects/:id` with a new manager twice; `SELECT user_id, ended_at IS NULL AS open FROM project_manager_terms WHERE project_id=$1 ORDER BY started_at` equals `[[creator,false],[m1,false],[m2,true]]`. Second case `it('re-saving the same manager adds no term')`: PATCH with the current manager → still one open term, row count unchanged.
- [ ] **Step 2:** Run `pnpm test:acceptance 47-project-team-change` → FAIL (table missing).
- [ ] **Step 3:** Add the table, run `db:generate`, rename the file to `0064_project_manager_terms.sql`, append backfill: `INSERT INTO project_manager_terms (project_id, user_id, started_at) SELECT id, manager_user_id, created_at FROM projects WHERE manager_user_id IS NOT NULL;`
- [ ] **Step 4:** Implement `openManagerTerm` / `managerTermsOf`. Call `openManagerTerm(tx, project.id, managerUserId, new Date())` in project creation right after the insert. (The update call comes in Task 8.)
- [ ] **Step 5:** Run the test → still FAIL only on the change case (update not wired yet). Mark that `it` as `.todo` until Task 8, run again → PASS.
- [ ] **Step 6:** Commit `feat(projects): record manager terms`.

### Task 2: Split rating points by manager term

**Files:**
- Create: `packages/domain/src/workforce/rating-split.ts` (+ `rating-split.test.ts`, export from the workforce index)
- Modify: `apps/api/src/modules/workforce/points.ts:72-96`, `apps/api/src/modules/customer-portal/customer-portal.service.ts:208`

**Interfaces:**
- Consumes: `managerTermsOf` (Task 1).
- Produces: `splitRatingPoints(terms: readonly { userId: string; from: Date; to: Date | null }[], total: number, at: Date): { userId: string; points: number }[]` — share by milliseconds managed up to `at`; largest-remainder rounding so shares sum to `total`; same user's terms merged; zero shares dropped; order by first `from`.

- [ ] **Step 1: Write failing unit tests** in `rating-split.test.ts`:
  - one term → `[{A,10}]`
  - A 30 days, B 10 days, total 10 → `[{A,8},{B,2}]` (7.5/2.5 → largest remainder, tie goes to earlier term)
  - zero-length term (changed twice same moment) → that user dropped
  - A, then B, then A again → A's days merged into one line
  - empty terms → `[]`
- [ ] **Step 2:** `pnpm --filter @oneohm/domain test rating-split` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Change `suggestRatingPoints(db, { projectId, rating })`:
  - rating < 4 → set every `customer_rating` entry for this project with status `pending` to `cancelled` (`decidedAt = now`), then return.
  - rating ≥ 4 → shares = `splitRatingPoints(terms, points.goodRating, now)`; for each share upsert on `(source_type, source_id, user_id)`: insert as `pending`; on conflict update `points` **only where status = 'pending'**; also reopen a `cancelled` row to `pending`. Approved rows are never changed. Rows for users not in the shares that are still `pending` → `cancelled`.
  - No terms (no manager ever) → return.
- [ ] **Step 6: Acceptance tests** in scenario 47:
  - `it('splits rating points between old and new manager')`: set terms to A 30 days / B 10 days with SQL helper, customer rates 5 → pending rows A=8, B=2.
  - `it('a re-rating does not double credit')`: rate 5, rate 5 again → still one row per manager, same total.
  - `it('a low re-rating withdraws pending points')`: rate 5 then 2 → rows `cancelled`; an already `approved` row stays `approved`.
- [ ] **Step 7:** Run `pnpm test:acceptance 47-project-team-change` → PASS. Commit `fix(points): split rating points by manager term`.

### Task 3: Reports filter by manager term

**Files:**
- Modify: `apps/api/src/modules/business-reports/report-scope.ts:28-31`
- Test: scenario 47

**Interfaces:**
- Consumes: `projectManagerTerms` (Task 1).
- Produces: `reportScope(...).projects` manager filter = `EXISTS (SELECT 1 FROM project_manager_terms t WHERE t.project_id = projects.id AND t.user_id = :manager AND t.started_at < :until AND (t.ended_at IS NULL OR t.ended_at >= :from))`.

The command center and the project list keep using the current manager (they answer "who runs it now"). Team report already ignores the manager filter.

- [ ] **Step 1: Failing test** `it('the old manager keeps the project in reports for the months they ran it')`: project with terms A (last month) → B (from this month). `GET /business-reports/delivery?managerUserId=A&period=last_month` includes the project; `period=this_month` with A does not; with B `this_month` does.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with drizzle `exists(...)`.
- [ ] **Step 4:** Run → PASS. Also run `pnpm --filter @oneohm/api test report` (unit tests that build scopes) → PASS.
- [ ] **Step 5:** Commit `fix(reports): manager filter follows manager terms`.

### Task 4: Who may manage, and locked projects

**Files:**
- Create: `apps/api/src/modules/projects/project-team-rules.ts`
- Modify: `project-team.service.ts` (`checkManager` removed → rules), `project-creation.service.ts:153`, `project-team.service.ts:options()`
- Modify: `packages/api-contracts/src/schemas/project-team.schema.ts` (people get `canManage: boolean`)
- Test: scenario 47

**Interfaces:**
- Produces:
  - `checkManagerCandidate(db, userId: string): Promise<void>` — active, staff role, not crew, and in `holdersOf(db, 'projects.view_all')`; else `invalid('Pick someone who can see projects as manager.', { managerUserId: 'This person cannot open projects. Pick someone else.' })`.
  - `assertTeamEditable(project: { status: string }): void` — `completed`/`cancelled` → `conflict('This project is closed. Its team can no longer change.', 'project_closed')`.
  - `TeamOptions.people[number].canManage: boolean`.

- [ ] **Step 1: Failing tests:**
  - `it('rejects an HR person as manager')` → PATCH with `STAFF.hr` → 400, `fieldErrors.managerUserId`.
  - `it('rejects an HR person as manager at creation')` → create with HR manager → 400.
  - `it('saves other changes while the manager is inactive')`: retire the manager, PATCH with the same `managerUserId` and a new target date → 200 (the manager is only checked when it changes).
  - `it('locks completed projects')`: set status `completed` by SQL → PATCH → 409 `project_closed`.
  - `it('lists who can manage')`: `GET /project-team/options` → execution person `canManage: true`, HR `false`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. In `update`, call `checkManagerCandidate` only when `input.managerUserId !== project.managerUserId`. In creation, call it when `input.managerUserId` is given; skip it when the manager defaults to the actor.
- [ ] **Step 4:** Run → PASS. Commit `fix(projects): only people who can see projects can manage them; lock closed projects`.

### Task 5: An inactive manager does not block work

**Files:**
- Modify: `apps/api/src/modules/projects/task-review.ts:20-33`, `packages/database/src/pending-approvals.ts:~55-65`, `apps/worker/src/activities/escalations.ts:42-45,126,141`, `apps/worker/src/activities/stale-reminders.ts:81`

**Interfaces:**
- Produces: `activeManagerOf(db, projectId): Promise<string | null>` in `packages/database/src/manager-terms.ts` — the project's manager only when `users.status = 'active'`.

- [ ] **Step 1: Failing tests (scenario 47):**
  - `it('reviews go to approvers when the manager is inactive')`: project-manager review task, deactivate the manager (`retire`), submit → the task's reviewers are the `tasks.approve` holders; admin can approve → 200.
  - `it('a new manager gets the late alert the old one got')`: make a task late, run the escalation activity (existing helper used by scenario 24), change manager, run again → a `task_late` notification exists for the new manager.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Use `activeManagerOf` in `reviewPeople`, pending approvals and `tellManager` (null → existing fallback). Add the recipient to dedupe keys: `escalate:${id}:manager:${managerUserId}`, `stuck:${id}:${since}:${managerUserId ?? 'holders'}`, `leave-block:${id}:${from}:${managerUserId ?? 'holders'}`.
- [ ] **Step 4:** Run → PASS; run `pnpm --filter @oneohm/worker test` → PASS. Commit `fix(tasks): an inactive manager no longer blocks reviews or alerts`.

### Task 6: Team sheet never gets stuck; team panel shows the named team

**Files:**
- Modify: `packages/api-contracts/src/schemas/project-team.schema.ts` (`team` items gain `active: boolean`), `packages/api-contracts/src/schemas/project.schema.ts:193` (detail gains `version: number`), `projectUpdateSchema` gains `version: z.number().int()` (required)
- Modify: `apps/api/src/modules/projects/project-team.ts` (`projectTeamOf` returns `active`; `checkTeam` checks only ids **not already** on the team), project read model (expose `version`)
- Modify: `apps/web/src/features/projects/team/team-sheet.tsx`, `team-members-field.tsx`, `apps/web/src/features/projects/control-room/overview/team-panel.tsx`

**Interfaces:**
- Produces: `checkTeam(db, userIds, keep: readonly string[] = [])` — ids in `keep` skip the check.
- Version: `update` runs `UPDATE projects SET version = version + 1 ... WHERE id = $1 AND version = $2`; 0 rows → `conflict('Someone else changed this project. Reload and try again.', 'stale')`.

- [ ] **Step 1: Failing tests (scenario 47):**
  - `it('saves when a team member became inactive')`: team [X, Y], retire X, PATCH keeping X → 200.
  - `it('rejects a stale save')`: PATCH with `version` 1 twice → second is 409 `stale`.
- [ ] **Step 2:** Run → FAIL. Step 3: implement API. Step 4: run → PASS.
- [ ] **Step 5: Web:**
  - `TeamMembersField` renders current members missing from `people` as extra checkboxes labelled with name + `t('inactive')` so they can be unticked.
  - Manager `Select` options = people with `canManage`, plus the current manager if missing, labelled `(inactive)` / `(cannot manage)`.
  - `TeamSheet` resets state only when `open` turns true (`useEffect` deps `[open]`, read `project` via ref), sends `version: project.version`; on 409 `stale` show the error and refetch the project.
  - `TeamPanel` lists: manager first, then named team members (open/done counts from tasks), then a "Not on the team" group for other assignees with open tasks. `TeamSetupSummary` drops the "Named team" names line (now in the list) but keeps contractor, target finish, outside count. Hide **Change** when the project is completed/cancelled.
- [ ] **Step 6:** `pnpm --filter @oneohm/web typecheck && pnpm --filter @oneohm/web test` → PASS. Check in the browser preview: add a person with no tasks → shows in the list after save. Commit `fix(team): sheet saves with inactive members; panel shows the named team`.

### Task 7: Move a removed person's open tasks

**Files:**
- Create: `apps/api/src/modules/projects/project-team-handover.ts`
- Modify: `projectUpdateSchema` (`handOver: z.array(z.object({ fromUserId: idSchema, toUserId: idSchema.nullable() })).max(30).optional()`), `project-team.service.ts`
- Modify: `apps/web/src/features/projects/team/team-sheet.tsx` + new `handover-field.tsx`

**Interfaces:**
- Produces: `handOverTasks(tx, actor: Actor, projectId: string, moves: readonly { fromUserId: string; toUserId: string | null }[], team: readonly string[]): Promise<number>`:
  - each move: open tasks (status not `completed`) in this project with `assigneeUserId = from` get `assigneeUserId = to`; `proposedUserId = from` gets `proposedUserId = to`.
  - `toUserId = null` means "keep with them" → nothing moves (explicit choice).
  - `to` must be active staff (or crew of the project's contractor) and not equal to a removed person → else `invalid(..., { handOver: 'Pick an active person who stays on the project.' })`.
  - then `syncWorkOrders`, `tellAssignee` once per moved task, audit `task.assigned` per task with `{ userId, reason: 'team_change' }`.
- Rule in `update`: if a removed person has open tasks and no `handOver` entry for them → `invalid('Choose who takes their open tasks.', { handOver: '...' })`.

- [ ] **Step 1: Failing tests (scenario 47):**
  - `it('asks what to do with a removed person's open tasks')`: remove X who holds 2 open tasks, no handOver → 400 `fieldErrors.handOver`.
  - `it('moves open tasks and proposals to the chosen person')` → both tasks now on Y; a completed task of X stays with X; Y has a notification.
  - `it('keeps tasks when told to')`: `toUserId: null` → 200, tasks still on X.
  - `it('rejects handing over to a removed or inactive person')` → 400.
- [ ] **Step 2:** Run → FAIL. Step 3: implement. Step 4: run → PASS.
- [ ] **Step 5: Web:** when unticked members hold open tasks (counted from `project.tasks`), the sheet shows one row each: "{name} has {n} open tasks" + Select (people on the new team, other `canManage`/staff, or "Keep with {name}"). Save is disabled until each row has a choice.
- [ ] **Step 6:** typecheck + browser check. Commit `feat(team): hand over a removed person's open tasks`.

### Task 8: Apply the change: outsideTeam, chats, customer, notices, timeline

**Files:**
- Create: `apps/api/src/modules/projects/project-team-notices.ts`
- Modify: `project-team.service.ts`, `packages/domain/src/tasks/project-assignment.ts`, `apps/api/src/modules/whatsapp/chat-owner.ts`, `packages/database/src/chat-team.ts:23-34`
- Modify (template): `packages/domain/src/messaging/message-templates.ts`, `packages/database/src/customer-message.ts`, `customer-message-hi.ts`, `customer-message-mr.ts`, `customer-message-words.ts`, `docs/whatsapp-templates.md`

**Interfaces:**
- Consumes: `openManagerTerm` (Task 1), `handOverTasks` (Task 7), `checkManagerCandidate`/`assertTeamEditable` (Task 4).
- Produces:
  - `outsideTeamFor(userId: string | null, team: readonly string[], crew: ReadonlySet<string>): boolean` — true only when team non-empty, user set, not crew, not in team.
  - `moveCustomerChats(db, customerId, toUserId, projectId)` — returns 0 unless `projectId` is the customer's newest project with status `active`/`operational`.
  - `chatOwnerFor` prefers the newest **live** project, then newest of any status.
  - `tellTeamChange(tx, actor, project, diff: { added: string[]; removed: string[]; oldManager: string | null; newManager: string | null; oldTarget: string | null; newTarget: string | null })` — notices + timeline + customer message.

Order inside `update`'s transaction: lock row with version check → `openManagerTerm` (if manager changed) → `replaceTeam` → `handOverTasks` → recompute `outsideTeam` for open tasks of the project → `moveCustomerChats` (if manager changed) → `tellTeamChange` → audit with `previousTeamUserIds`, `previousTargetFinishDate`, `previousManagerUserId`.

`tellTeamChange` does:
- new manager: existing notice + "{n} reviews wait for you" when `n > 0`.
- old manager (if active and not the actor): `project_manager_removed` notice "You no longer manage {code}".
- added / removed members (not the actor): `project_team_added` / `project_team_removed` notices.
- timeline (`projectActivities`): `manager_changed` "{new} now manages this project (was {old})."; `team_changed` "Added: …. Removed: …."; `target_changed` "Target finish moved to {date}." Only for parts that changed.
- customer: `queueWhatsApp(tx, phone, 'project_manager_changed', { customer, project: code, manager, phone }, 'project_manager_changed:${projectId}:${newManager}')` — only when manager changed, a new manager is set, and the project is live.

- [ ] **Step 1: Failing unit tests** for `outsideTeamFor` in `project-assignment.test.ts`: empty team → false; in team → false; crew → false; outside → true; null → false.
- [ ] **Step 2: Failing acceptance tests (scenario 47):**
  - `it('clears the outside flag when the person joins the team')`.
  - `it('does not move the chat for an older project')`: one customer, 2 live projects, change manager of the older → `wa_conversations.assigned_user_id` unchanged; change the newer → moved.
  - `it('tells the customer about a new manager')`: an outbox row with template `project_manager_changed`; none when re-saving the same manager; none on a project without a manager change.
  - `it('tells added, removed people and the old manager')`.
  - `it('writes the change to the timeline and audit')`: activities `manager_changed`, `team_changed`, `target_changed`; audit has `previousTeamUserIds`.
  - Un-todo the Task 1 case `records a manager term ... on each change`.
- [ ] **Step 3:** Run both → FAIL. Step 4: implement. Step 5: run → PASS. Also `pnpm --filter @oneohm/domain test` and `pnpm --filter @oneohm/database test` (template tables stay in sync) → PASS.
- [ ] **Step 6:** Commit `feat(team): apply team changes fully — chats, customer, notices, timeline`.

### Task 9: Full check

- [ ] Run `pnpm check` → all PASS.
- [ ] Run `pnpm test:acceptance` (whole suite, not only 47) → PASS. Scenarios 04, 13, 24, 25, 28-* and 42 touch the same code.
- [ ] Browser check on the Overview tab: add, remove with handover, change manager, closed project has no **Change** button.

## Out of scope (named so they are not a surprise)

- The `project_manager_changed` WhatsApp template must be approved by Meta before WhatsApp sends it. Until then the customer still gets the in-app message.
- A chat passed by hand is still not marked as manual; the 24-hour rule protects only active conversations.
- The project's contractor still cannot be changed from the sheet.
- Capacity limits are still not checked when tasks are auto-assigned.
- Task points still go to the finisher, not the assignee, on tasks without approval.
- Mobile staff app screens were not reviewed.
