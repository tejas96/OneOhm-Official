import type {
  ContractorDetail,
  CrewPayments,
  Payable,
  WorkOrderDetail,
} from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { type Sale, sellProject, today } from '../support/sales';
import { advanceTo, project, workTask } from '../support/tasks';
import { CREWS, contractorByName } from '../support/team';

// PRD 13 "Contractors": work order, evidence, payable, deductions and payment flow end to
// end; contractors see only their own data.
const rupee = (paise: number) => Math.round(paise / 100) * 100;
const ADVANCE = 2_000_00;
const REWORK = 500_00;

describe('Contractors', () => {
  let admin: Session;
  let lead: Session;
  let member: Session;
  let outsider: Session;
  let contractor: { id: string; name: string };
  let sale: Sale;
  let order: WorkOrderDetail;

  beforeAll(async () => {
    admin = await Session.admin();
    contractor = await contractorByName(admin, CREWS.main.name);
    sale = await sellProject(admin, {
      name: 'Contractor Flow Customer (test)',
      contractorId: contractor.id,
    });
    lead = await Session.code(CREWS.main.lead.phone);
    member = await Session.code(CREWS.main.member.phone);
    outsider = await Session.code(CREWS.other.lead.phone);
  });

  it('issues a work order with the crew tasks and the agreed rates to the crew lead', async () => {
    order = await admin.post<WorkOrderDetail>(`/contractors/${contractor.id}/work-orders`, {
      projectId: sale.project.id,
      dueDate: null,
      scope: 'Mounting, panels, inverter and earthing (test)',
    });
    expect(order.contractor.id).toBe(contractor.id);
    expect(order.status).toBe('open');
    expect(order.tasks.length).toBeGreaterThan(0);
    expect(order.tasks.every((task) => task.assignee?.fullName === CREWS.main.lead.name)).toBe(
      true,
    );
    // ₹3,000 per kWp from the crew's rate card.
    expect(order.lines.some((line) => line.basis === 'per_kwp' && line.amountPaise > 0)).toBe(true);
    order = await admin.post<WorkOrderDetail>(`/work-orders/${order.id}/lines`, {
      description: 'Extra cable laying (test)',
      quantityMilli: 1000,
      unitRatePaise: 500_00,
    });
    order = await admin.post<WorkOrderDetail>(`/work-orders/${order.id}/advances`, {
      amountPaise: ADVANCE,
      note: 'Advance for travel (test)',
    });
    expect(order.settlement.advancesPaise).toBe(ADVANCE);
  });

  it('shows the crew its work order without any project price', async () => {
    const own = await lead.get<{ id: string }[]>('/work-orders');
    expect(own.map((row) => row.id)).toContain(order.id);
    const seen = await member.get<WorkOrderDetail>(`/work-orders/${order.id}`);
    expect(seen.number).toBe(order.number);
    const text = JSON.stringify(seen);
    for (const secret of ['totalPaise', 'subsidyPaise', 'marginPaise', 'effectivePaise']) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain(String(sale.quotation.totals.totalPaise));
    const pdf = await lead.download(`/work-orders/${order.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');
    const quote = await lead.raw('GET', `/quotations/${sale.quotation.id}`);
    expect([403, 404]).toContain(quote.status);
  });

  it('lets the crew complete its tasks with photo evidence from the phone', async () => {
    for (const ordered of order.tasks) {
      const key = (await project(admin, sale.project.id)).tasks.find(
        (task) => task.id === ordered.id,
      )?.templateKey;
      if (!key) throw new Error(`Work order task ${ordered.title} is not on the project.`);
      const task = await advanceTo(admin, sale.project.id, key);
      if (task.status === 'completed') continue;
      const done = await workTask(admin, task, { as: lead });
      expect(done.status).toBe('completed');
      expect(done.attachments.length).toBeGreaterThan(0);
      if (ordered === order.tasks[0]) {
        // Rework found on the first job: deducted from what the crew is paid.
        await admin.post(`/work-orders/${order.id}/rework`, {
          taskId: ordered.id,
          note: 'Re-tightened two clamps (test)',
          deductionPaise: REWORK,
        });
      }
    }
    order = await admin.get<WorkOrderDetail>(`/work-orders/${order.id}`);
    expect(order.status).toBe('completed');
    expect(order.tasksDone).toBe(order.taskCount);
  });

  it('raises the payable with retention, TDS and the advance deducted', async () => {
    const s = order.settlement;
    const gross = order.lines.reduce((sum, line) => sum + line.amountPaise, 0);
    expect(s.grossPaise).toBe(gross);
    expect(s.reworkDeductionsPaise).toBe(REWORK);
    const base = gross - REWORK;
    expect(s.retentionPaise).toBe(rupee((base * 500) / 10_000));
    expect(s.tdsPaise).toBe(rupee((base * 100) / 10_000));
    expect(s.advancesPaise).toBe(ADVANCE);
    expect(s.netPayablePaise).toBe(base - s.retentionPaise - s.tdsPaise - ADVANCE);
    expect(order.payable?.amountPaise).toBe(s.netPayablePaise);
    expect(order.payable?.status).toBe('pending');
    expect(order.retentionPayable?.amountPaise).toBe(s.retentionPaise);

    const crew = await lead.get<CrewPayments>('/crew/payments');
    expect(crew.contractor.id).toBe(contractor.id);
    const kinds = crew.payables.filter((row) => row.workOrderNumber === order.number);
    expect(kinds.map((row) => row.kind).sort()).toEqual(['advance', 'retention', 'work_order']);
    expect(crew.awaitingApprovalPaise).toBeGreaterThanOrEqual(s.netPayablePaise);
  });

  it('is approved and paid, and the crew sees it paid', async () => {
    const payableId = order.payable?.id ?? '';
    const listed = await admin.get<Payable[]>('/finance/payables?status=all');
    const bill = listed.find((row) => row.id === payableId);
    expect(bill?.party).toBe('contractor');
    expect(bill?.partyName).toBe(contractor.name);
    expect(bill?.projectCode).toBe(sale.project.code);
    const approved = await admin.post<Payable>(`/finance/payables/${payableId}/approve`);
    expect(approved.status).toBe('approved');
    const paid = await admin.post<Payable>(`/finance/payables/${payableId}/pay`, {
      method: 'bank_transfer',
      paidOn: today(),
      reference: `UTR-WO-${Date.now()} (test)`,
    });
    expect(paid.status).toBe('paid');

    const crew = await member.get<CrewPayments>('/crew/payments');
    const row = crew.payables.find((entry) => entry.id === payableId);
    expect(row?.status).toBe('paid');
    expect(row?.paidOn).toBe(today());
    expect(row?.amountPaise).toBe(order.settlement.netPayablePaise);
    expect(crew.paidPaise).toBeGreaterThanOrEqual(order.settlement.netPayablePaise);
  });

  it('keeps another contractor out of this crew’s work, tasks, money and project', async () => {
    const taskId = order.tasks[0]?.id ?? '';
    const refused = [
      `/work-orders/${order.id}`,
      `/work-orders/${order.id}/pdf`,
      `/tasks/${taskId}`,
      `/tasks/${taskId}/activity`,
      `/projects/${sale.project.id}`,
      `/quotations/${sale.quotation.id}`,
      `/contractors/${contractor.id}`,
      '/finance/payables',
    ];
    for (const path of refused) {
      const reply = await outsider.raw('GET', path);
      expect({ path, refused: [403, 404].includes(reply.status) }).toEqual({ path, refused: true });
    }
    const theirs = await outsider.get<{ id: string }[]>('/work-orders');
    expect(theirs.map((row) => row.id)).not.toContain(order.id);
    const money = await outsider.get<CrewPayments>('/crew/payments');
    expect(money.contractor.id).not.toBe(contractor.id);
    expect(money.payables.some((row) => row.workOrderNumber === order.number)).toBe(false);
  });

  it('keeps the crew itself out of the project’s prices and other projects', async () => {
    const detail = await lead.raw('GET', `/projects/${sale.project.id}`);
    if (detail.status === 200) {
      expect(detail.text).not.toContain(String(sale.quotation.totals.totalPaise));
    } else {
      expect([403, 404]).toContain(detail.status);
    }
    const bills = await lead.raw('GET', '/finance/payables');
    expect([403, 404]).toContain(bills.status);
  });

  it('applies 20% TDS to a contractor with no valid PAN (section 397(2))', async () => {
    const withPan = await admin.get<ContractorDetail>(`/contractors/${contractor.id}`);
    expect(withPan.effectiveTdsBp).toBe(withPan.tdsBp);

    const noPan = await admin.post<ContractorDetail>('/contractors', {
      name: `No PAN Crew ${Date.now()} (test)`,
      kind: 'individual',
      skills: ['ic_partner'],
      tdsBp: 100,
    });
    expect(noPan.pan).toBeNull();
    expect(noPan.tdsBp).toBe(100);
    expect(noPan.effectiveTdsBp).toBe(2000);

    const fixed = await admin.patch<ContractorDetail>(`/contractors/${noPan.id}`, {
      pan: 'abcde1234f',
    });
    expect(fixed.pan).toBe('ABCDE1234F');
    expect(fixed.effectiveTdsBp).toBe(100);
  });

  it('refuses a contractor account number of 8 digits (payouts need 9 to 18)', async () => {
    const reply = await admin.raw('POST', '/contractors', {
      name: `Short Account Crew ${Date.now()} (test)`,
      kind: 'individual',
      skills: ['ic_partner'],
      bankAccountName: 'Short Account Crew',
      bankAccountNumber: '12345678',
      bankAccountNumberConfirm: '12345678',
      bankIfsc: 'HDFC0000001',
    });
    expect(reply.status).toBe(400);
  });

  it('refuses an account number typed twice differently', async () => {
    const reply = await admin.raw('PATCH', `/contractors/${contractor.id}`, {
      bankAccountName: CREWS.main.name,
      bankAccountNumber: '123456789012',
      bankAccountNumberConfirm: '123456789013',
    });
    expect(reply.status).toBe(400);
  });
});
