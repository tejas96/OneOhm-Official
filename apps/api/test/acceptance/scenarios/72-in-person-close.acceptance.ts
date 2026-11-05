import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';
import { actionsOf, askLocation, closeChat, scopeOf } from '../support/send';

// An ask done in person (customer not on WhatsApp) is closed from the "Asked from the customer" card: the
// ask closes, its task on the handovers list is ticked, and the log and the audit trail say so.

describe('Asks done in person', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('closes the ask, ticks the task, logs and audits; a WhatsApp ask cannot be closed this way', async () => {
    const sale = await sellProject(admin, { name: 'Done In Person (test)' });
    await closeChat(sale.customer.phone);
    await rows("UPDATE customers SET contact_channel = 'sms' WHERE id = $1", [
      sale.customer.customerId,
    ]);
    const result = await askLocation(admin, scopeOf(sale));
    expect(result.via).toBe('in_person');
    const [ask] = await actionsOf(sale.customer.customerId, 'location');
    const closed = await admin.post<{ status: string }>(
      `/document-requests/${ask?.id}/done-in-person`,
    );
    expect(closed.status).toBe('closed');
    const [task] = await rows<{ done_at: string | null }>(
      'SELECT done_at FROM customer_handovers WHERE customer_id = $1',
      [sale.customer.customerId],
    );
    expect(task?.done_at).not.toBeNull();
    const log = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND message LIKE '%done in person'",
      [sale.project.id],
    );
    expect(log).toHaveLength(1);
    const audit = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'customer_action.done_in_person' AND entity_id = $1",
      [ask?.id],
    );
    expect(audit).toHaveLength(1);

    await rows("UPDATE customers SET contact_channel = 'whatsapp' WHERE id = $1", [
      sale.customer.customerId,
    ]);
    const other = await sellProject(admin, { name: 'Done On Chat (test)' });
    await askLocation(admin, scopeOf(other));
    const [chat] = await actionsOf(other.customer.customerId, 'location');
    await expect(admin.post(`/document-requests/${chat?.id}/done-in-person`)).rejects.toThrow();
  });
});
