import type {
  CommandCenter,
  DelaysReport,
  ProjectTask,
  TaskBoard,
  TeamLoad,
} from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { addDays, type Sale, sellProject, today } from '../support/sales';
import { advanceTo, project, sessionOf, taskByKey } from '../support/tasks';
import { staffId } from '../support/team';
import { patchTeam, setManagerTerms } from '../support/team-change';

// PRD 13 "Owner dashboard": the owner sees the major risks and the causes of delay without
// opening every project. Three scenario projects carry a problem each: work running late
// (internal), a step waiting on MSEDCL, and papers waiting on the customer.
describe('Owner dashboard', () => {
  let admin: Session;
  let late: Sale;
  let utility: Sale;
  let papers: Sale;
  let discomTask: ProjectTask;
  let customerTask: ProjectTask;
  let overdue: ProjectTask[] = [];
  let watcherId = '';
  let lateWatcherId = '';

  /** The assignee starts the task, then marks it waiting on someone outside OneOhm. */
  async function waitOn(task: ProjectTask, party: 'discom' | 'customer'): Promise<ProjectTask> {
    if (!task.assignee) throw new Error(`${task.title} has no assignee.`);
    const doer = await sessionOf(admin, task.assignee.id);
    await doer.post(`/tasks/${task.id}/start`);
    return doer.post<ProjectTask>(`/tasks/${task.id}/waiting`, {
      party,
      note: `Waiting on the ${party} (test)`,
    });
  }

  beforeAll(async () => {
    admin = await Session.admin();
    // Started six weeks ago and never touched: its early tasks are well past due.
    late = await sellProject(admin, {
      name: 'Dashboard Late Project (test)',
      project: { startDate: addDays(today(), -45) },
    });
    overdue = (await project(admin, late.project.id)).tasks.filter((task) => task.overdue);
    lateWatcherId = await staffId(admin, 'liaisoning');
    await patchTeam(admin, late.project.id, { managerUserId: lateWatcherId });
    // Reports follow who managed the project when; this manager has had it since it began.
    await setManagerTerms(late.project.id, [{ userId: lateWatcherId, days: 45 }]);

    utility = await sellProject(admin, { name: 'Dashboard DISCOM Wait (test)' });
    const sanction = await advanceTo(admin, utility.project.id, 'discom_sanction');
    discomTask = await waitOn(sanction, 'discom');
    // A manager of their own, so the owner can narrow the dashboard to just this project.
    watcherId = await staffId(admin, 'execution');
    await patchTeam(admin, utility.project.id, { managerUserId: watcherId });

    papers = await sellProject(admin, { name: 'Dashboard Customer Wait (test)' });
    const details = taskByKey(await project(admin, papers.project.id), 'electricity_details');
    customerTask = await waitOn(details, 'customer');
  });

  it('sets up projects that are late and waiting', () => {
    expect(overdue.length).toBeGreaterThan(0);
    expect(discomTask.status).toBe('waiting');
    expect(discomTask.waitingParty).toBe('discom');
    expect(customerTask.waitingParty).toBe('customer');
  });

  it('puts the late work at the top of the risks, with counts and project states', async () => {
    const center = await admin.get<CommandCenter>('/command-center');
    const risk = center.risks.find((row) => row.projectId === late.project.id);
    expect(risk?.kind).toBe('overdue');
    expect(risk?.days).toBeGreaterThan(0);
    expect(risk?.party).toBe('internal');
    expect(center.kpis.overdueTasks).toBeGreaterThanOrEqual(overdue.length);
    // The late project counts as a problem (overdue, at risk or blocked by late work).
    const lateRow = center.projects.find((row) => row.id === late.project.id);
    expect(['overdue', 'atRisk', 'blocked']).toContain(lateRow?.tone);
    const { overdue: overdueNow, atRisk, blocked } = center.states;
    expect(overdueNow + atRisk + blocked).toBeGreaterThanOrEqual(1);
    expect(center.states.waiting).toBeGreaterThanOrEqual(1);
  });

  it('names the cause on each live project without opening it', async () => {
    const center = await admin.get<CommandCenter>('/command-center');
    const byId = new Map(center.projects.map((row) => [row.id, row]));
    expect(byId.get(late.project.id)?.overdueTasks).toBeGreaterThan(0);
    expect(byId.get(utility.project.id)?.waitingOn).toBe('discom');
    expect(byId.get(papers.project.id)?.waitingOn).toBe('customer');
  });

  it('shows the DISCOM wait as a risk when narrowed to its manager', async () => {
    const center = await admin.get<CommandCenter>(`/command-center?managerUserId=${watcherId}`);
    expect(center.narrowed).toBe(true);
    expect(center.projects.map((row) => row.id)).toContain(utility.project.id);
    expect(center.projects.every((row) => row.manager?.id === watcherId)).toBe(true);
    const risk = center.risks.find((row) => row.taskId === discomTask.id);
    expect(risk?.kind).toBe('waiting');
    expect(risk?.party).toBe('discom');
  });

  it('splits delay causes in the delays report, DISCOM time kept apart', async () => {
    const report = await admin.get<DelaysReport>('/business-reports/delays');
    expect(report.totals.waitingNow).toBeGreaterThanOrEqual(2);
    expect(report.byParty.map((row) => row.party).sort()).toEqual(
      ['bank', 'customer', 'discom', 'internal'].sort(),
    );
    // Each late step counts under its own cause: the late project's internal steps under
    // internal, its MSEDCL steps under DISCOM (never mixed into internal time).
    for (const party of ['internal', 'discom'] as const) {
      const row = report.byParty.find((entry) => entry.party === party);
      const own = overdue.filter((task) => task.waitingParty === party).length;
      expect(row?.openLate).toBeGreaterThanOrEqual(own);
    }
    // Narrowed to the late project's manager, its late steps lead the list, cause internal.
    const mine = await admin.get<DelaysReport>(
      `/business-reports/delays?managerUserId=${lateWatcherId}`,
    );
    const lateRow = mine.waiting.find((row) => row.projectId === late.project.id);
    expect(lateRow?.daysLate).toBeGreaterThan(0);
    expect(lateRow?.party).toBe('internal');
    // Utility time has its own section, per DISCOM, apart from internal days.
    const msedcl = report.discoms.find((row) => row.code === 'MSEDCL');
    expect(msedcl?.openNow).toBeGreaterThanOrEqual(1);
  });

  it('lists every task waiting on the DISCOM or the customer, by cause', async () => {
    const board = (party: string) =>
      admin.get<TaskBoard>(`/command-center/tasks?show=waiting&party=${party}`);
    const discom = (await board('discom')).rows.find((row) => row.id === discomTask.id);
    expect(discom?.waitingParty).toBe('discom');
    expect(discom?.projectId).toBe(utility.project.id);
    const customer = (await board('customer')).rows.find((row) => row.id === customerTask.id);
    expect(customer?.waitingParty).toBe('customer');
  });

  it('drills down from a figure to the tasks behind it', async () => {
    const lateRows = await admin.get<TaskBoard>(
      `/command-center/tasks?show=overdue&projectId=${late.project.id}`,
    );
    expect(lateRows.rows.length).toBe(overdue.length);
    expect(lateRows.rows.every((row) => row.daysLate > 0)).toBe(true);
  });

  it('shows who carries the late work on the team view', async () => {
    const team = await admin.get<TeamLoad>('/command-center/team');
    const owners = new Set(overdue.map((task) => task.assignee?.id).filter(Boolean));
    const behind = team.people.filter((person) => owners.has(person.userId));
    expect(behind.length).toBeGreaterThan(0);
    expect(behind.every((person) => person.overdue > 0)).toBe(true);
  });
});
