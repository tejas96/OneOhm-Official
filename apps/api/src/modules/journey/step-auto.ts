import { randomUUID } from 'node:crypto';
import { type DatabaseExecutor } from '@oneohm/database';
import { STEP_TASK_KEYS } from '@oneohm/domain';
import { AppError } from '../../common/http/errors';
import { openAction } from '../send-to-customer/send-actions';
import { deliver } from '../send-to-customer/send-deliver';
import { inLanguage } from '../whatsapp/assistant/language';
import { askedBefore, contextOfTask } from './journey-context';
import type { JourneyTask } from './journey-store';
import { creditCompose } from './step-compose';

/**
 * The subsidy release step is done: the customer is asked, once, whether the money reached their
 * bank (redesign §4 Subsidy). Only a step whose template lets the customer hear about it asks by
 * itself (PRD 6.2); a project with no subsidy amount asks nothing.
 */
async function askCredit(tx: DatabaseExecutor, task: JourneyTask): Promise<void> {
  if (!task.notifyCustomer || (await askedBefore(tx, `subsidy_credit:${task.id}`))) return;
  const ctx = await contextOfTask(tx, task);
  if (!ctx) return;
  const id = randomUUID();
  try {
    const { built, record } = await inLanguage(ctx.language, () =>
      creditCompose(tx, ctx, task, id),
    );
    if (record.kind !== 'action') return;
    await openAction(tx, ctx, null, record);
    await deliver(tx, ctx, built, `journey:subsidy_credit:${task.id}`, null);
  } catch (error) {
    // No subsidy amount to ask about: nothing to say. Anything else is a real failure.
    if (!(error instanceof AppError)) throw error;
  }
}

/** A step was just completed: the subsidy release asks "Did it reach your bank?". */
export async function stepOnComplete(tx: DatabaseExecutor, task: JourneyTask): Promise<void> {
  // The row given is the one from before it was finished: it is done now.
  if (task.templateKey === STEP_TASK_KEYS.subsidy_credit)
    await askCredit(tx, { ...task, status: 'completed' });
}
