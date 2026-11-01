import { Inject, Injectable } from '@nestjs/common';
import type { Announcement, AnnouncementInput } from '@oneohm/api-contracts';
import { announcements, notify, roles, userRoles, users } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

type Row = typeof announcements.$inferSelect;

const isActive = (row: Row, today: string) =>
  row.endedAt === null && (row.endsOn === null || row.endsOn >= today);

/**
 * Short notices from the owners or HR (PRD 4.1): on the field app's Today screen while
 * they last, and sent once as an in-app and phone alert. Never by email.
 */
@Injectable()
export class AnnouncementsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Showing now for this person: for everyone on the staff, or for one of their roles. */
  async mine(actor: Actor): Promise<Announcement[]> {
    const rows = await this.read(isNull(announcements.endedAt));
    return rows.filter(
      (item) =>
        item.active &&
        (item.audienceRoleKeys.length === 0
          ? actor.kind === 'staff'
          : item.audienceRoleKeys.some((key) => actor.roleKeys.includes(key))),
    );
  }

  list(): Promise<Announcement[]> {
    return this.read();
  }

  async create(actor: Actor, input: AnnouncementInput): Promise<Announcement> {
    const today = todayIn();
    if (input.endsOn && input.endsOn < today)
      throw invalid('The last day cannot be in the past.', { endsOn: 'Today or later.' });
    const keys = [...new Set(input.audienceRoleKeys)];
    if (keys.length > 0) {
      const known = await this.db
        .select({ key: roles.key })
        .from(roles)
        .where(inArray(roles.key, keys));
      if (known.length !== keys.length)
        throw invalid('One of the roles does not exist.', { audienceRoleKeys: 'Unknown role.' });
    }
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(announcements)
        .values({
          title: input.title.trim(),
          body: input.body.trim(),
          audienceRoleKeys: keys,
          endsOn: input.endsOn ?? null,
          createdByUserId: actor.userId,
        })
        .returning({ id: announcements.id });
      if (!row) throw new Error('Announcement insert returned nothing.');
      const recipients = await tx
        .selectDistinct({ id: users.id })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(users.status, 'active'),
            keys.length > 0 ? inArray(roles.key, keys) : eq(roles.kind, 'staff'),
          ),
        );
      for (const person of recipients) {
        if (person.id === actor.userId) continue;
        await notify(
          tx,
          { userId: person.id },
          {
            kind: 'announcement',
            title: input.title.trim(),
            body: input.body.trim().slice(0, 200),
            dedupeKey: `announcement:${row.id}:${person.id}`,
          },
        );
      }
      await recordAudit(tx, actor.userId, 'announcement.posted', 'announcement', row.id, {
        audienceRoleKeys: keys,
        recipients: recipients.length,
      });
      return row.id;
    });
    return this.one(id);
  }

  async end(actor: Actor, id: string): Promise<Announcement> {
    const [row] = await this.db
      .update(announcements)
      .set({ endedAt: new Date() })
      .where(and(eq(announcements.id, id), isNull(announcements.endedAt)))
      .returning({ id: announcements.id });
    if (!row) throw conflict('This announcement has already been taken down.', 'ended');
    await recordAudit(this.db, actor.userId, 'announcement.ended', 'announcement', id);
    return this.one(id);
  }

  private async one(id: string): Promise<Announcement> {
    const [item] = await this.read(eq(announcements.id, id));
    if (!item) throw notFound('That announcement');
    return item;
  }

  private async read(where?: SQL): Promise<Announcement[]> {
    const today = todayIn();
    const rows = await this.db
      .select({ row: announcements, author: users.fullName })
      .from(announcements)
      .leftJoin(users, eq(users.id, announcements.createdByUserId))
      .where(where)
      .orderBy(desc(announcements.createdAt))
      .limit(100);
    return rows.map(({ row, author }) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      audienceRoleKeys: row.audienceRoleKeys,
      endsOn: row.endsOn,
      createdBy:
        row.createdByUserId && author ? { id: row.createdByUserId, fullName: author } : null,
      createdAt: row.createdAt.toISOString(),
      active: isActive(row, today),
    }));
  }
}
