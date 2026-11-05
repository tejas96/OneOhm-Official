import { inPersonLine, inPersonTask } from '@oneohm/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { customers } from './schema/crm.schema';
import { customerActions } from './schema/customer-actions.schema';
import { customerHandovers } from './schema/customer-handovers.schema';
import { projects } from './schema/projects.schema';

/** What a message needs to become a task for the team. */
interface Message {
  readonly template: string;
  readonly payload: Record<string, string>;
  readonly dedupeKey: string;
  readonly words: { readonly title: string; readonly body: string };
}

export async function handOver(
  db: DatabaseExecutor,
  customerId: string,
  message: Message,
  chatAsk: boolean,
  actionId: string | null,
): Promise<boolean> {
  // `project` holds the town and size by now (plainNames); the code rides as `projectCode`.
  const code = message.payload.projectCode ?? message.payload.project;
  const [project] = code
    ? await db.select({ id: projects.id }).from(projects).where(eq(projects.code, code)).limit(1)
    : [];
  const inserted = await db
    .insert(customerHandovers)
    .values({
      customerId,
      projectId: project?.id ?? null,
      actionId,
      template: message.template,
      ...(await taskWords(db, customerId, message, chatAsk)),
      dedupeKey: message.dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: customerHandovers.id });
  return inserted.length > 0;
}

/**
 * The team's task in staff words ("Tell Asha in person that our team visits Baner tomorrow"), never the
 * sentence the customer would have read. A chat-only ask with no staff line of its own still gets a plain
 * "Do in person" task; any other message with none keeps the customer's words.
 */
async function taskWords(
  db: DatabaseExecutor,
  customerId: string,
  message: Message,
  chatAsk: boolean,
) {
  const [one] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  const name = one?.name ?? 'The customer';
  const staff = inPersonLine(message.template, name, message.payload);
  if (staff) return staff;
  return chatAsk ? inPersonTask(name, message.words.title) : message.words;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** The customer's waiting ask a message is about (its buttons carry the ask's id), if any. */
export async function actionIn(
  db: DatabaseExecutor,
  customerId: string,
  payload: Record<string, string>,
) {
  const ids = [
    ...new Set(Object.values(payload).flatMap((value) => String(value).match(UUID) ?? [])),
  ];
  if (ids.length === 0) return null;
  const [found] = await db
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(
      and(
        inArray(customerActions.id, ids),
        eq(customerActions.customerId, customerId),
        inArray(customerActions.status, ['open', 'received']),
      ),
    )
    .limit(1);
  return found?.id ?? null;
}

export async function markChannel(
  db: DatabaseExecutor,
  actionId: string,
  channel: 'sms' | 'in_person',
) {
  await db
    .update(customerActions)
    .set({
      payload: sql`${customerActions.payload} || jsonb_build_object('channel', ${channel}::text)`,
      updatedAt: sql`${customerActions.updatedAt}`,
    })
    .where(eq(customerActions.id, actionId));
}
