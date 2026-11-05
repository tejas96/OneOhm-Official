import { expect } from 'vitest';
import { rows } from './db';

/** The payload of the message queued for this phone under one key, or undefined. */
export async function sentByKey(phone: string, key: string) {
  const [row] = await rows<{ payload: Record<string, unknown> }>(
    'SELECT payload FROM outbox WHERE recipient = $1 AND dedupe_key = $2',
    [phone, key],
  );
  return row?.payload;
}

/**
 * Chat open (redesign §19): "project started" names the manager (`manager` is the word to find in
 * the customer's language) and "please pay" is [Pay ₹X] [I paid another way], not payment_link.
 */
export async function expectStartedInChat(
  phone: string,
  projectId: string,
  milestoneId: string,
  manager: string,
) {
  expect((await sentByKey(phone, `project_started:${projectId}`))?.body).toContain(manager);
  const due = JSON.stringify(await sentByKey(phone, `milestone_due:${milestoneId}`));
  expect(due).toContain(`paidother:${milestoneId}`);
  const links = await rows(
    "SELECT 1 FROM outbox WHERE recipient = $1 AND template = 'payment_link'",
    [phone],
  );
  expect(links).toHaveLength(0);
}
