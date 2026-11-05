import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTasks } from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { tap } from '../support/onboarding';
import { createQuotation, newCustomer } from '../support/sales';
import { openChat } from '../support/send';
import { runCallTasks } from '../support/visit-worker';

// The calls we promised (redesign §12, §13): late -> the person is told, 4 hours later the desk; Called ends it.

describe('Call tasks: escalation when the promised call is missed', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** A call task made by tapping Call me on a quote. */
  async function promised(name: string) {
    const customer = await newCustomer(admin, { name });
    const quotation = await createQuotation(admin, customer);
    await openChat(customer.phone, customer.customerId);
    await admin.post(`/quotations/${quotation.id}/send`);
    await tap(customer.phone, `quote_q:${quotation.id}:call`);
    const [task] = await callTasks(customer.customerId);
    return { customer, task };
  }
  const alerts = (id: string) =>
    rows<{ dedupe_key: string }>(
      "SELECT dedupe_key FROM notifications WHERE kind = 'call_late' AND dedupe_key LIKE $1",
      [`call_late:${id}:%`],
    );
  const hours = (task: { payload: Record<string, string> } | undefined, n: number) =>
    new Date(new Date(task?.payload.callBy ?? '').getTime() + n * 3_600_000);

  it('nothing before the promised time; the person after it; the desk 4 hours later; each once', async () => {
    const { task } = await promised('Call Late (test)');
    await runCallTasks(hours(task, -1));
    expect(await alerts(task?.id ?? '')).toHaveLength(0);

    await runCallTasks(hours(task, 1));
    const owner = await alerts(task?.id ?? '');
    expect(owner.length).toBeGreaterThan(0);
    expect(owner.every((row) => row.dedupe_key.startsWith(`call_late:${task?.id}:owner`))).toBe(
      true,
    );
    await runCallTasks(hours(task, 2));
    expect((await alerts(task?.id ?? '')).length).toBe(owner.length);

    await runCallTasks(hours(task, 5));
    const all = await alerts(task?.id ?? '');
    expect(all.some((row) => row.dedupe_key.startsWith(`call_late:${task?.id}:manager`))).toBe(
      true,
    );
    const total = all.length;
    await runCallTasks(hours(task, 6));
    expect((await alerts(task?.id ?? '')).length).toBe(total);
  });

  it('Called ends it: nothing is raised for a call that was made', async () => {
    const { task } = await promised('Call Made (test)');
    await admin.post(`/customer-actions/${task?.id}/called`);
    await runCallTasks(hours(task, 6));
    expect(await alerts(task?.id ?? '')).toHaveLength(0);
  });
});
