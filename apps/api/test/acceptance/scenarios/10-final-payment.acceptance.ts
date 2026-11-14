import type { ProjectTask, Receivable } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { expectBalanced, milestoneOf, postings, recordPayment } from '../support/money';
import { type Sale, sellProject } from '../support/sales';
import { openChat } from '../support/send';
import {
  advanceTo,
  completeThrough,
  factsFor,
  project,
  sessionOf,
  taskByKey,
  workTask,
} from '../support/tasks';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

afterAll(closeDb);

// PRD 13 "Final payment": commissioning creates the final receivable once; net-meter
// completion closes the project operationally. Settlement stays a separate event.
describe('Final payment', () => {
  let admin: Session;
  let accounts: Session;
  let sale: Sale;
  let finalId = '';

  beforeAll(async () => {
    admin = await Session.admin();
    accounts = await Session.password(staffEmail('accounts'), TEAM_PASSWORD);
    sale = await sellProject(admin, { name: 'Final Payment Customer (test)' });
    finalId = milestoneOf(sale.project, 'commissioning_completed').id;
  });

  const finalMilestone = async () =>
    milestoneOf(await project(admin, sale.project.id), 'commissioning_completed');
  const finalLinks = () =>
    rows<{ id: string }>('select id from payment_links where milestone_id = $1', [finalId]);
  const linkMessages = () =>
    rows<{ id: string }>(
      // The template says "Last instalment (10%)" now (live QA C9): match the milestone by id.
      "select id from outbox where recipient = $1 and template = 'payment_link' and payload->>'milestoneId' = $2",
      [sale.customer.phone, finalId],
    );
  /** The final link goes out by itself within a minute (the API checks every 60 s). */
  async function waitForFinalLink(): Promise<void> {
    for (let second = 0; second < 80 && (await finalLinks()).length === 0; second += 2) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  it('keeps the final payment not yet due before commissioning', async () => {
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    await recordPayment(accounts, sale.project.id, advance, 'bank_transfer');
    await advanceTo(admin, sale.project.id, 'testing_commissioning');
    const detail = await project(admin, sale.project.id);
    await recordPayment(accounts, detail.id, milestoneOf(detail, 'material_dispatch'), 'upi');
    expect((await finalMilestone()).status).toBe('upcoming');
    expect(await postings('milestone_due', finalId)).toBe(0);
  });

  it('makes the final receivable due exactly once, even when commissioning is redone', {
    timeout: 150_000,
  }, async () => {
    const task = taskByKey(await project(admin, sale.project.id), 'testing_commissioning');
    expect(task.approval).toBe(true);
    const sent = await workTask(admin, task, { approve: false });
    expect(sent.status).toBe('in_review');
    // The reviewer sends it back; the engineer commissions again and resubmits.
    await admin.post(`/tasks/${task.id}/return`, {
      reason: 'Recheck the inverter readings (test)',
    });
    const engineer = await sessionOf(admin, sent.assignee?.id ?? '');
    const again = await engineer.post<ProjectTask>(`/tasks/${task.id}/complete`, {
      facts: factsFor(sent),
      note: 'Commissioned again (test)',
    });
    expect(again.status).toBe('in_review');
    expect((await finalMilestone()).status).toBe('upcoming');
    const approved = await admin.post<ProjectTask>(`/tasks/${task.id}/approve`);
    expect(approved.status).toBe('completed');

    // A second completion or approval of the finished task changes nothing.
    const repeat = await engineer.raw('POST', `/tasks/${task.id}/complete`, {
      facts: factsFor(sent),
    });
    expect(repeat.status).toBeGreaterThanOrEqual(400);
    const reapprove = await admin.raw('POST', `/tasks/${task.id}/approve`);
    expect(reapprove.status).toBeGreaterThanOrEqual(400);

    const detail = await project(admin, sale.project.id);
    expect(detail.milestones).toHaveLength(sale.project.milestones.length);
    expect(milestoneOf(detail, 'commissioning_completed').status).toBe('due');
    expect(await postings('milestone_due', finalId)).toBe(1);
    // The final payment link goes to the customer by itself, once (PRD Flow D step 3).
    await waitForFinalLink();
    expect(await finalLinks()).toHaveLength(1);
    expect(await linkMessages()).toHaveLength(1);
    const receivables = await accounts.get<Receivable[]>('/finance/receivables');
    expect(receivables.filter((row) => row.milestoneId === finalId)).toHaveLength(1);
  });

  it('marks the project operational when the net meter is installed, not yet settled', async () => {
    await completeThrough(admin, sale.project.id, 'net_meter_installation');
    const detail = await project(admin, sale.project.id);
    expect(detail.status).toBe('operational');
    expect(detail.financiallyClosedAt).toBeNull();
    expect(await postings('milestone_due', finalId)).toBe(1);
  });

  it('keeps a completed project open in the books while the final payment is owed', async () => {
    let detail = await project(admin, sale.project.id);
    for (const task of detail.tasks) {
      if (task.status !== 'completed')
        await completeThrough(admin, sale.project.id, task.templateKey);
    }
    detail = await project(admin, sale.project.id);
    expect(detail.tasks.every((task) => task.status === 'completed')).toBe(true);
    expect(detail.status).toBe('completed');
    expect(detail.financiallyClosedAt).toBeNull();
    expect((await finalMilestone()).status).toBe('due');
  });

  it('closes the project financially when the final payment arrives', async () => {
    const paid = await recordPayment(accounts, sale.project.id, await finalMilestone(), 'cash');
    expect(paid.milestones.every((milestone) => milestone.status === 'paid')).toBe(true);
    expect(paid.financiallyClosedAt).not.toBeNull();
    expect(await postings('milestone_due', finalId)).toBe(1);
    await expectBalanced(accounts);
  });
});

// Inside the 24-hour window the chat carries the [Pay] button of the final instalment: the due notice
// stays quiet for a final milestone, so the final-link job asks itself, and no template follows it.
describe('Final payment inside the chat window', () => {
  it('asks to pay once in the chat, with no link template alongside', {
    timeout: 150_000,
  }, async () => {
    const admin = await Session.admin();
    const accounts = await Session.password(staffEmail('accounts'), TEAM_PASSWORD);
    const sale = await sellProject(admin, { name: 'Final Payment Chat (test)' });
    const finalId = milestoneOf(sale.project, 'commissioning_completed').id;
    await recordPayment(
      accounts,
      sale.project.id,
      milestoneOf(sale.project, 'quotation_accepted'),
      'bank_transfer',
    );
    await advanceTo(admin, sale.project.id, 'testing_commissioning');
    const detail = await project(admin, sale.project.id);
    await recordPayment(accounts, detail.id, milestoneOf(detail, 'material_dispatch'), 'upi');
    await openChat(sale.customer.phone, sale.customer.customerId);
    await workTask(
      admin,
      taskByKey(await project(admin, sale.project.id), 'testing_commissioning'),
    );

    const asks = () =>
      outboxFor(sale.customer.phone).then((all) =>
        all.filter(
          (row) =>
            row.template.startsWith('session:') &&
            JSON.stringify(row.payload).includes(`"pay:${finalId}"`),
        ),
      );
    const links = () =>
      rows<{ id: string }>('select id from payment_links where milestone_id = $1', [finalId]);
    // The final-link job runs every minute: wait until it has made the link.
    for (let second = 0; second < 90 && (await links()).length === 0; second += 2)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(await links()).toHaveLength(1);
    // One Pay ask: the switch-on message already carries it, so the final-link job adds none. (Had
    // that message failed, it would not count and the job would send the link template instead.)
    const [ask, ...more] = await asks();
    expect(ask).toBeDefined();
    expect(more).toHaveLength(0);
    // The chat is the way to reach them while it is open: no payment_link template alongside it.
    const templates = (await outboxFor(sale.customer.phone)).filter(
      (row) => row.template === 'payment_link' && row.payload.milestoneId === finalId,
    );
    expect(templates).toHaveLength(0);
  });
});
