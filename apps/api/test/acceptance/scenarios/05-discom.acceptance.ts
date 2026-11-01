import type { DelaysReport, ProjectDetail, ProjectTask } from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { addDays, type Sale, sellProject, today, uniquePhone } from '../support/sales';
import { advanceTo, project, sessionOf, taskByKey } from '../support/tasks';
import { ensurePerson } from '../support/team';

// PRD 13 "DISCOM": selecting a DISCOM adds its tasks; DISCOM waiting time is reported
// separately (PRD 3.1, 3.16). The MSEDCL project was planned from 45 days ago and nothing
// on it is done, so its steps are genuinely late today and the delays report has real
// days to split by cause (finishing a step re-plans the steps after it from today, so
// "finished late" days need real time to pass; the report's unit tests cover those). A
// manager of their own keeps the report to this scenario's two projects.
const MSEDCL_ONLY = [
  'discom_application',
  'discom_sanction',
  'install_generation_meter',
  'generation_meter_test',
  'discom_inspection',
  'net_meter_installation',
];
const TATA = ['tata_application', 'tata_sanction', 'tata_inspection', 'tata_net_meter'];

const keys = (detail: ProjectDetail) => detail.tasks.map((task) => task.templateKey);
const indiaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Days late of the open tasks waiting on one party, as the report counts them today. */
function openLateDays(tasks: readonly ProjectTask[], party: string): number[] {
  return tasks
    .filter((task) => task.status !== 'completed' && task.waitingParty === party)
    .map((task) => daysBetween(task.dueDate, indiaToday()))
    .filter((days) => days > 0);
}
const sum = (list: readonly number[]) => list.reduce((total, days) => total + days, 0);

describe('DISCOM', () => {
  let admin: Session;
  let managerId: string;
  let msedcl: Sale;
  let tata: Sale;
  const started = addDays(today(), -45);

  beforeAll(async () => {
    admin = await Session.admin();
    const manager = await ensurePerson(admin, {
      // A new manager each run, so repeated runs on one database still see only these two.
      phone: uniquePhone(),
      name: 'Delay Desk Manager (test)',
      roles: ['admin'],
    });
    managerId = manager.id;
    msedcl = await sellProject(admin, {
      name: 'MSEDCL Site Customer (test)',
      managerUserId: managerId,
      project: { startDate: started },
    });
    tata = await sellProject(admin, {
      name: 'Tata Power Site Customer (test)',
      discom: 'TATA',
      managerUserId: managerId,
    });
  });

  it('MSEDCL adds the MSEDCL net-metering steps and nothing of another DISCOM', () => {
    const list = keys(msedcl.project);
    for (const key of MSEDCL_ONLY) expect(list).toContain(key);
    for (const key of TATA) expect(list).not.toContain(key);
    expect(msedcl.project.discom).toMatch(/MSEDCL|Maharashtra/);
  });

  it('Tata Power adds its own steps instead, ending in "operational"', () => {
    const list = keys(tata.project);
    for (const key of TATA) expect(list).toContain(key);
    for (const key of MSEDCL_ONLY) expect(list).not.toContain(key);
    expect(taskByKey(tata.project, 'tata_sanction').waitingParty).toBe('discom');
  });

  it('reports DISCOM waiting apart from internal delays', async () => {
    // Tata Power: the sanction is started and now waits on the DISCOM.
    const sanction = await advanceTo(admin, tata.project.id, 'tata_sanction');
    const officer = await sessionOf(admin, sanction.assignee?.id ?? '');
    await officer.post(`/tasks/${sanction.id}/start`);
    await officer.post(`/tasks/${sanction.id}/waiting`, {
      party: 'discom',
      note: 'File with Tata Power for sanction (test)',
    });

    const report = await admin.get<DelaysReport>(
      `/business-reports/delays?period=this_month&managerUserId=${managerId}`,
    );
    const party = (name: string) => report.byParty.find((row) => row.party === name);
    expect(report.byParty.map((row) => row.party).sort()).toEqual(
      ['bank', 'customer', 'discom', 'internal'].sort(),
    );

    // Late days split by cause: the DISCOM's steps are not counted as internal days.
    const plan = (await project(admin, msedcl.project.id)).tasks;
    const discomDays = openLateDays(plan, 'discom');
    const internalDays = openLateDays(plan, 'internal');
    expect(discomDays.length).toBeGreaterThan(0);
    expect(internalDays.length).toBeGreaterThan(0);
    expect(party('discom')?.openLate).toBe(discomDays.length);
    expect(party('discom')?.openDays).toBe(sum(discomDays));
    expect(party('internal')?.openLate).toBe(internalDays.length);
    expect(party('internal')?.openDays).toBe(sum(internalDays));

    // Utility time per DISCOM.
    const msedclRow = report.discoms.find((row) => row.code === 'MSEDCL');
    const tataRow = report.discoms.find((row) => row.code === 'TATA');
    expect(msedclRow?.openLate).toBe(discomDays.length);
    expect(tataRow?.openNow).toBeGreaterThan(0);

    // What waits on the DISCOM today, named as such.
    const waiting = report.waiting.find((row) => row.taskId === sanction.id);
    expect(waiting?.party).toBe('discom');
    expect(waiting?.waiting).toBe(true);
    expect(report.totals.waitingNow).toBeGreaterThan(0);
  });
});
