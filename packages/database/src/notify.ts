import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { roleCapabilities, roles, userRoles, users } from './schema/identity.schema';
import { notifications } from './schema/notifications.schema';
import { outbox } from './schema/records.schema';

export type NoticeSubject =
  | 'task'
  | 'project'
  | 'leave'
  | 'correction'
  | 'points'
  | 'payment'
  | 'service_request'
  | 'quotation'
  | 'purchase_request'
  | 'vendor_advance'
  | 'stock'
  | 'travel_claim'
  | 'lead';

export interface Notice {
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly subject?: {
    readonly type: NoticeSubject;
    readonly id: string;
    readonly projectId?: string | null;
  };
  /** The same key never makes a second alert, so a retried request stays quiet. */
  readonly dedupeKey: string;
}

export type NoticeRecipient = { readonly userId: string } | { readonly customerId: string };

/**
 * Saves an alert for one person and queues it for their phone, in the caller's
 * transaction. The worker finds the person's phones when it sends.
 */
export async function notify(
  db: DatabaseExecutor,
  to: NoticeRecipient,
  notice: Notice,
): Promise<void> {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: 'userId' in to ? to.userId : null,
      customerId: 'customerId' in to ? to.customerId : null,
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      subjectType: notice.subject?.type ?? null,
      subjectId: notice.subject?.id ?? null,
      projectId: notice.subject?.projectId ?? null,
      dedupeKey: notice.dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  if (!row) return;
  await db
    .insert(outbox)
    .values({
      channel: 'push',
      recipient: row.id,
      template: notice.kind,
      payload: {},
      dedupeKey: `push:${row.id}`,
    })
    .onConflictDoNothing();
}

/** Active people whose roles grant the capability, for example everyone who approves leave. */
export async function holdersOf(db: DatabaseExecutor, capability: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .innerJoin(roleCapabilities, eq(roleCapabilities.roleId, roles.id))
    .where(and(eq(users.status, 'active'), eq(roleCapabilities.capability, capability)));
  return rows.map((row) => row.id);
}

/** Alerts everyone who holds the capability, except the person who caused it. */
export async function notifyHolders(
  db: DatabaseExecutor,
  capability: string,
  notice: Notice,
  exceptUserId?: string | null,
): Promise<number> {
  const people = (await holdersOf(db, capability)).filter((id) => id !== exceptUserId);
  for (const userId of people) {
    await notify(db, { userId }, { ...notice, dedupeKey: `${notice.dedupeKey}:${userId}` });
  }
  return people.length;
}

/** Marks a person's alerts as read: the listed ones, or all of them. */
export async function markRead(
  db: DatabaseExecutor,
  to: NoticeRecipient,
  ids?: readonly string[],
): Promise<void> {
  const owner =
    'userId' in to
      ? eq(notifications.userId, to.userId)
      : eq(notifications.customerId, to.customerId);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        owner,
        isNull(notifications.readAt),
        ids && ids.length > 0 ? inArray(notifications.id, [...ids]) : undefined,
      ),
    );
}
