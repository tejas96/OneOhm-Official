import { customerActions, type DatabaseExecutor } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import { alertTaskOwner, type JourneyTask, resumeAfterWait } from './journey-store';

/** How long after the step moved on a customer's answer to the roof question is still taken. */
export const LATE_ANSWER_DAYS = 7;

export type LateAnswer = 'yes' | 'not_yet' | 'now';

/**
 * The roof question was closed because dispatch finished before the customer answered. The answer
 * still matters to the crew: it is logged, and "Not yet" tells the step's owner to call before the
 * crew goes. Answering the same way twice changes nothing more.
 */
export async function lateRoofAnswer(
  tx: DatabaseExecutor,
  given: {
    readonly action: typeof customerActions.$inferSelect;
    readonly task: JourneyTask | null;
    readonly answer: LateAnswer;
    readonly who: string;
    readonly home: string;
    readonly via: string;
    readonly userId: string | null;
  },
): Promise<'yes' | 'notYet'> {
  const { action, task, answer, who, home, via, userId } = given;
  const ready = answer !== 'not_yet';
  const word = ready ? 'ready' : 'not_ready';
  if (action.payload.lateAnswer === word) return ready ? 'yes' : 'notYet';
  const now = new Date();
  await tx
    .update(customerActions)
    .set({ payload: { ...action.payload, lateAnswer: word, answeredAt: now.toISOString() } })
    .where(eq(customerActions.id, action.id));
  await logAction(tx, action, {
    kind: 'customer_action',
    message: ready
      ? `${who} said the roof at ${home} is ready (${via})`
      : `${who} said the roof at ${home} is not ready yet (${via})`,
    userId,
    data: { customerActionId: action.id, answer: word },
  });
  await recordAudit(tx, userId, 'customer_action.answered', 'customer_action', action.id, {
    answer: word,
    via,
  });
  // A "Not yet" had made the step wait on the customer; "ready" ends that wait if it is still there.
  if (ready && task && action.payload.customerAnswer === 'not_yet')
    await resumeAfterWait(tx, task, String(action.payload.waitSince ?? '') || null);
  if (!ready && task)
    await alertTaskOwner(tx, task, {
      kind: 'site_not_ready',
      title: `Roof not ready at ${home}`,
      body: `Material is dispatched but ${who} says the roof is not ready. Please call before the crew goes.`,
      key: `site_not_ready:${action.id}`,
    });
  return ready ? 'yes' : 'notYet';
}
