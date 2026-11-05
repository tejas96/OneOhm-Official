import {
  customerActions,
  customers,
  type Database,
  type DatabaseExecutor,
  homeNameOf,
  projectFacts,
} from '@oneohm/database';
import { isStepKind, type StepKind } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import { plainDate } from '../whatsapp/assistant/plain-date';
import { alertTaskOwner, type JourneyTask, taskFor } from './journey-store';

/** What an answer to one of the subsidy, bank or layout questions came to. */
export type StepResult =
  | { readonly kind: 'old' }
  /** The first button: done, received, going, looks good. */
  | { readonly kind: 'ok'; readonly step: StepKind; readonly day: string }
  /** The second button of the registration or the layout: a person answers. */
  | { readonly kind: 'person'; readonly step: StepKind; readonly paper: string }
  /** "Not yet" on the subsidy (the ask stays open); `again` when it was said before. */
  | { readonly kind: 'notYet'; readonly again: boolean }
  /** "Change day": the loan owner is told. */
  | { readonly kind: 'change' };

export type StepTap = 'ok' | 'alt' | 'now';

type Action = typeof customerActions.$inferSelect;

interface Facts {
  readonly tx: DatabaseExecutor;
  readonly action: Action;
  readonly task: JourneyTask | null;
  readonly who: string;
  readonly home: string;
  /** Records the answer (and closes the ask when `close`), logs the line on the task and audits it. */
  readonly record: (answer: string, line: string, close: boolean) => Promise<void>;
  readonly alert: (kind: string, title: string, body: string) => Promise<void>;
}

/** The checklist row "Subsidy received": a project fact with the day, kept once. */
async function markReceived(tx: DatabaseExecutor, projectId: string): Promise<void> {
  const day = todayIn();
  await tx
    .insert(projectFacts)
    .values({ projectId, key: 'subsidy_received', value: day })
    .onConflictDoUpdate({
      target: [projectFacts.projectId, projectFacts.key],
      set: { value: day, updatedAt: new Date() },
    });
}

const HANDLERS: Readonly<
  Record<StepKind, (facts: Facts, tap: StepTap) => Promise<StepResult | null>>
> = {
  subsidy_register: async ({ record, alert, who, home }, tap) => {
    if (tap === 'now') return null;
    if (tap === 'alt') {
      await record(
        'help',
        `${who} needs help to register on the PM Surya Ghar portal (WhatsApp)`,
        true,
      );
      return { kind: 'person', step: 'subsidy_register', paper: '' };
    }
    await record(
      'done',
      `${who} says they registered on the PM Surya Ghar portal for ${home} (WhatsApp)`,
      true,
    );
    await alert(
      'subsidy_registered',
      `${who} registered on the PM Surya Ghar portal`,
      `${home}: they say they are registered. You can go on with the application.`,
    );
    return { kind: 'ok', step: 'subsidy_register', day: '' };
  },
  subsidy_credit: async ({ tx, action, record, alert, who, home }, tap) => {
    const money = formatInr(Number(action.payload.amountPaise ?? 0));
    if (tap === 'alt') {
      if (action.payload.answer === 'not_yet') return { kind: 'notYet', again: true };
      await record(
        'not_yet',
        `${who} says the ${money} subsidy for ${home} has not reached their bank yet (WhatsApp)`,
        false,
      );
      // Staff see it on the project's card until the money arrives.
      await tx
        .update(customerActions)
        .set({
          note: `Customer says not received yet (since ${plainDate(todayIn())})`,
        })
        .where(eq(customerActions.id, action.id));
      return { kind: 'notYet', again: false };
    }
    await record(
      'yes',
      `${who} confirmed the ${money} subsidy for ${home} reached their bank account (WhatsApp)`,
      true,
    );
    if (action.projectId) await markReceived(tx, action.projectId);
    await tx.update(customerActions).set({ note: '' }).where(eq(customerActions.id, action.id));
    await alert(
      'subsidy_received',
      `${who} received the subsidy`,
      `${home}: ${money} reached their bank account.`,
    );
    return { kind: 'ok', step: 'subsidy_credit', day: '' };
  },
  bank_sign: async ({ action, record, alert, who }, tap) => {
    const bank = String(action.payload.bank ?? 'the bank');
    const day = String(action.payload.dayText ?? '');
    if (tap === 'now') return null;
    if (tap === 'alt') {
      await record('change', `${who} wants a different day to sign at ${bank} (WhatsApp)`, true);
      await alert(
        'bank_sign_change',
        `${who} cannot go to ${bank} on ${day}`,
        'They asked for a different day to sign the loan papers. Please call them.',
      );
      return { kind: 'change' };
    }
    await record(
      'going',
      `${who} will go to ${bank}, ${String(action.payload.branch ?? '')} on ${day} to sign (WhatsApp)`,
      true,
    );
    return { kind: 'ok', step: 'bank_sign', day };
  },
  layout: async ({ action, record, alert, who, home }, tap) => {
    if (tap === 'now') return null;
    const paper = String(action.payload.paperTitle ?? action.title);
    if (tap === 'alt') {
      await record('question', `${who} has a question about the layout ${paper} (WhatsApp)`, false);
      return { kind: 'person', step: 'layout', paper };
    }
    await record('approved', `${who} approved the layout ${paper} for ${home} (WhatsApp)`, true);
    await alert(
      'layout_approved',
      `${who} approved the layout`,
      `${home}: ${paper} looks good to them.`,
    );
    return { kind: 'ok', step: 'layout', day: '' };
  },
};

/**
 * The customer's answer to a subsidy, bank or layout question (redesign §4): logged on the step
 * with the answer, and the ask closed, except a subsidy "Not yet" (stays open) and a layout question
 * (a person answers; the ask stays open so they can still approve). Tapping twice changes nothing more.
 */
export function answerStep(
  db: Database,
  customerId: string,
  actionId: string,
  tap: StepTap,
): Promise<StepResult> {
  return db.transaction(async (tx): Promise<StepResult> => {
    const [action] = await tx
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'confirm'),
          eq(customerActions.status, 'open'),
        ),
      )
      .for('update');
    const step = action?.payload.kind;
    if (!action || !isStepKind(step)) return { kind: 'old' };
    const [customer] = await tx
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId));
    const task = action.taskId ? await taskFor(tx, action.taskId) : null;
    const who = customer?.name ?? 'The customer';
    const record = async (answer: string, line: string, close: boolean) => {
      const now = new Date();
      await tx
        .update(customerActions)
        .set({
          payload: { ...action.payload, answer, answeredAt: now.toISOString() },
          doneAt: now,
          updatedAt: now,
          ...(close ? { status: 'closed' as const, closedAt: now } : {}),
        })
        .where(eq(customerActions.id, action.id));
      await logAction(tx, action, {
        kind: 'customer_action',
        message: line,
        userId: null,
        data: { customerActionId: action.id, answer },
        taskId: action.taskId,
      });
      await recordAudit(tx, null, 'customer_action.answered', 'customer_action', action.id, {
        answer,
      });
    };
    const alert = async (kind: string, title: string, body: string) => {
      if (task) await alertTaskOwner(tx, task, { kind, title, body, key: `${kind}:${action.id}` });
    };
    const home = await homeNameOf(tx, action.projectId);
    const result = await HANDLERS[step]({ tx, action, task, who, home, record, alert }, tap);
    return result ?? { kind: 'old' };
  });
}
