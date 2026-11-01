import { Inject, Injectable } from '@nestjs/common';
import type { Inbox, NotificationItem, PushDeviceInput } from '@oneohm/api-contracts';
import { markRead, type NoticeRecipient, notifications, pushDevices } from '@oneohm/database';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';

const PAGE = 50;

/** A person's alerts and the phones that receive them, for staff and customers alike. */
@Injectable()
export class NotificationsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async inbox(to: NoticeRecipient): Promise<Inbox> {
    const owner = ownerOf(to);
    const rows = await this.db
      .select()
      .from(notifications)
      .where(owner)
      .orderBy(desc(notifications.createdAt))
      .limit(PAGE);
    const [count] = await this.db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(owner, isNull(notifications.readAt)));
    return { unread: count?.unread ?? 0, items: rows.map(present) };
  }

  async markRead(to: NoticeRecipient, ids?: readonly string[]): Promise<void> {
    await markRead(this.db, to, ids);
  }

  /** Registers (or moves) a phone's token to this person; the same token is never shared. */
  async addDevice(to: NoticeRecipient, input: PushDeviceInput, app: 'field' | 'customer') {
    const owner = {
      userId: 'userId' in to ? to.userId : null,
      customerId: 'customerId' in to ? to.customerId : null,
    };
    await this.db
      .insert(pushDevices)
      .values({ ...owner, token: input.token, platform: input.platform, app })
      .onConflictDoUpdate({
        target: pushDevices.token,
        set: {
          ...owner,
          platform: input.platform,
          app,
          lastSeenAt: new Date(),
          disabledAt: null,
          disabledReason: null,
        },
      });
  }

  /** On sign-out the phone stops receiving this person's alerts. */
  async forgetDevice(to: NoticeRecipient, token: string): Promise<void> {
    await this.db
      .delete(pushDevices)
      .where(
        and(
          eq(pushDevices.token, token),
          'userId' in to
            ? eq(pushDevices.userId, to.userId)
            : eq(pushDevices.customerId, to.customerId),
        ),
      );
  }
}

function ownerOf(to: NoticeRecipient) {
  return 'userId' in to
    ? eq(notifications.userId, to.userId)
    : eq(notifications.customerId, to.customerId);
}

function present(row: typeof notifications.$inferSelect): NotificationItem {
  const subject =
    row.subjectType && row.subjectId
      ? {
          type: row.subjectType as NonNullable<NotificationItem['subject']>['type'],
          id: row.subjectId,
          projectId: row.projectId,
        }
      : null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    subject,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
