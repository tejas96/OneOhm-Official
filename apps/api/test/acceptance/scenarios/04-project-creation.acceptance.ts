import type { ProjectDetail } from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { type Sale, type SaleOptions, sellProject } from '../support/sales';

// PRD 13 "Project creation": conditional tasks and assignments (employees and
// contractors) without manual assignment of every task (PRD 3.7, 3.8). Nothing here
// assigns a task by hand: the engine does it when the project is created.
const LOAN = ['loan_documents', 'loan_submission', 'loan_approval', 'loan_disbursement_claim'];
const BATTERY = ['battery_procurement', 'battery_installation'];
const GROUND = ['ground_foundation', 'site_survey_ground'];
const COMMERCIAL = [
  'commercial_documents',
  'structural_stability',
  'electrical_inspection',
  'site_survey_commercial',
];
const SOCIETY = ['society_documents', 'site_survey_society'];
const MSEDCL = [
  'discom_application',
  'discom_sanction',
  'discom_inspection',
  'net_meter_installation',
];
const SUBSIDY = ['subsidy_application', 'subsidy_inspection', 'subsidy_release', 'dcr_undertaking'];

const keys = (project: ProjectDetail) => project.tasks.map((task) => task.templateKey);

interface Person {
  id: string;
  roles: { key: string }[];
}
interface ContractorDetail {
  id: string;
  members: { userId: string }[];
}

describe('Project creation', () => {
  let admin: Session;
  let roles: Map<string, string[]>;
  const sell = (options: SaleOptions) => sellProject(admin, options);

  beforeAll(async () => {
    admin = await Session.admin();
    const people = await admin.get<Person[]>('/people');
    roles = new Map(people.map((person) => [person.id, person.roles.map((role) => role.key)]));
  });

  /** Every task has a person (or a proposed one for a manager to confirm), by role. */
  async function expectAssigned(sale: Sale): Promise<void> {
    const { project, created } = sale;
    expect(created.unassigned).toBe(0);
    expect(created.tasks).toBe(project.tasks.length);
    const proposals = project.tasks.filter((task) => !task.assignee && task.proposedAssignee);
    expect(created.toConfirm).toBe(proposals.length);
    const contractorId = project.setup.contractor?.id;
    expect(contractorId).toBeTruthy();
    const crew = await admin.get<ContractorDetail>(`/contractors/${contractorId}`);
    const crewIds = new Set(crew.members.map((member) => member.userId));
    for (const task of project.tasks) {
      const person = task.assignee ?? task.proposedAssignee;
      expect(person, `${task.templateKey} has nobody`).toBeTruthy();
      const id = person?.id ?? '';
      if (task.roleKey === 'ic_partner') {
        expect(crewIds.has(id), `${task.templateKey} not with the crew`).toBe(true);
      } else {
        expect(roles.get(id) ?? [], `${task.templateKey} → wrong role`).toContain(task.roleKey);
      }
    }
  }

  it('a plain rooftop home gets the base tasks only, all assigned', async () => {
    const sale = await sell({ name: 'Plain Rooftop Customer (test)' });
    const list = keys(sale.project);
    expect(list).toContain('site_survey');
    for (const key of [...MSEDCL, ...SUBSIDY]) expect(list).toContain(key);
    for (const key of [...LOAN, ...BATTERY, ...GROUND, ...COMMERCIAL, ...SOCIETY]) {
      expect(list).not.toContain(key);
    }
    expect(sale.project.loan).toBe(false);
    await expectAssigned(sale);
  });

  it('loan, battery and ground mount each add their own tasks, all assigned', async () => {
    const sale = await sell({
      name: 'Loan Battery Ground Customer (test)',
      loan: true,
      battery: true,
      groundMount: true,
    });
    const list = keys(sale.project);
    for (const key of [...LOAN, ...BATTERY, ...GROUND, ...MSEDCL]) expect(list).toContain(key);
    // A ground-mounted site gets the ground survey instead of the rooftop one.
    expect(list).not.toContain('site_survey');
    expect(sale.project.loan && sale.project.battery && sale.project.groundMount).toBe(true);
    // Critical ground work is proposed to the crew and waits for a manager's OK.
    const foundation = sale.project.tasks.find((task) => task.templateKey === 'ground_foundation');
    expect(foundation?.proposedAssignee ?? foundation?.assignee).toBeTruthy();
    await expectAssigned(sale);
  });

  it('a commercial site gets its inspections and no subsidy work', async () => {
    const sale = await sell({
      name: 'Commercial Works (test)',
      category: 'commercial',
      targetWp: 10_000,
      inverter: 'inverter10k',
    });
    const list = keys(sale.project);
    for (const key of COMMERCIAL) expect(list).toContain(key);
    for (const key of [...SUBSIDY, ...SOCIETY, 'site_survey']) expect(list).not.toContain(key);
    expect(sale.project.subsidy).toBe(false);
    await expectAssigned(sale);
  });

  it('a housing society gets its society papers and survey', async () => {
    const sale = await sell({
      name: 'Sahyadri Heights CHS (test)',
      category: 'society',
      households: 8,
      targetWp: 10_000,
      inverter: 'inverter10k',
    });
    const list = keys(sale.project);
    for (const key of SOCIETY) expect(list).toContain(key);
    for (const key of [...COMMERCIAL, 'site_survey']) expect(list).not.toContain(key);
    await expectAssigned(sale);
  });

  it('crew work goes to the chosen crew company when one is named', async () => {
    const contractors = await admin.get<{ id: string; name: string }[]>('/contractors');
    const other = contractors.find((contractor) => contractor.name === 'Other Installers (test)');
    const sale = await sell({
      name: 'Named Crew Customer (test)',
      contractorId: other?.id ?? null,
    });
    expect(sale.project.setup.contractor?.id).toBe(other?.id);
    await expectAssigned(sale);
  });
});
