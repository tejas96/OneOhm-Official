import { Inject, Injectable } from '@nestjs/common';
import type { Person } from '@oneohm/api-contracts';
import { type DatabaseExecutor, outbox, roles, sessions, userRoles, users } from '@oneohm/database';
import { inviteText, type RoleKind } from '@oneohm/domain';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { readPeople } from './people-read';

type InviteEnvironment = Pick<Environment, 'STAFF_INVITES' | 'FIELD_APP_URL' | 'WEB_BASE_URL'>;

const TEMPLATE = 'staff_welcome';
const RESEND_AFTER_MS = 10 * 60 * 1000;

/**
 * Resellers, crews (partners) and people with no email use the field app; everyone else
 * opens the website.
 * An email that is not given at all is treated as "has one": only a known null counts.
 */
export function inviteLink(
  roleKinds: readonly RoleKind[],
  env: InviteEnvironment,
  email?: string | null,
): string {
  const fieldOnly =
    roleKinds.length > 0 && roleKinds.every((kind) => kind === 'reseller' || kind === 'partner');
  return fieldOnly || email === null ? env.FIELD_APP_URL : env.WEB_BASE_URL;
}

export const firstNameOf = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName;

/** The text an admin can paste when the WhatsApp message did not arrive. */
export const inviteTextFor = (
  user: { fullName: string; email: string | null; roleKinds: readonly RoleKind[] },
  env: InviteEnvironment,
) => inviteText(firstNameOf(user.fullName), inviteLink(user.roleKinds, env, user.email));

/** Queues the staff_welcome WhatsApp message; does nothing while invites are off. */
export async function queueInvite(
  tx: DatabaseExecutor,
  env: InviteEnvironment,
  user: {
    id: string;
    fullName: string;
    phoneE164: string;
    email?: string | null | undefined;
    roleKinds: readonly RoleKind[];
  },
): Promise<void> {
  if (env.STAFF_INVITES !== 'on') return;
  await tx
    .insert(outbox)
    .values({
      channel: 'whatsapp',
      recipient: user.phoneE164,
      template: TEMPLATE,
      payload: {
        name: firstNameOf(user.fullName),
        link: inviteLink(user.roleKinds, env, user.email),
      },
      dedupeKey: `${TEMPLATE}:${user.id}:${Date.now()}`,
    })
    .onConflictDoNothing();
}

/** The kinds (staff, partner, reseller) of each person's roles. */
export async function roleKindsByUser(
  db: DatabaseExecutor,
  userIds: readonly string[],
): Promise<Map<string, RoleKind[]>> {
  const rows = await db
    .select({ userId: userRoles.userId, kind: roles.kind })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, [...userIds]));
  const kinds = new Map<string, RoleKind[]>();
  for (const row of rows) kinds.set(row.userId, [...(kinds.get(row.userId) ?? []), row.kind]);
  return kinds;
}

/** The kinds of some roles, before the person who will hold them exists. */
export async function kindsOfRoles(
  db: DatabaseExecutor,
  roleIds: readonly string[],
): Promise<RoleKind[]> {
  const rows = await db
    .select({ kind: roles.kind })
    .from(roles)
    .where(inArray(roles.id, [...roleIds]));
  return rows.map((row) => row.kind);
}

/** What became of each person's newest invite: sent, failed, queued, or null for none. */
export async function inviteDeliveries(
  db: DatabaseExecutor,
  userIds: readonly string[],
): Promise<Map<string, Person['inviteDelivery']>> {
  const wanted = new Set(userIds);
  const result = new Map<string, Person['inviteDelivery']>();
  if (wanted.size === 0) return result;
  const rows = await db
    .select({ key: outbox.dedupeKey, status: outbox.status, delivery: outbox.deliveryStatus })
    .from(outbox)
    // By key, not by phone: the invite is still theirs after a number change.
    .where(and(eq(outbox.template, TEMPLATE), like(outbox.dedupeKey, `${TEMPLATE}:%`)))
    .orderBy(desc(outbox.createdAt));
  for (const row of rows) {
    const userId = row.key.split(':')[1] ?? '';
    if (!wanted.has(userId) || result.has(userId)) continue; // newest first
    if (row.status === 'failed' || row.delivery === 'failed') result.set(userId, 'failed');
    else if (row.status === 'sent') result.set(userId, 'sent');
    else if (row.status === 'pending') result.set(userId, 'queued');
  }
  return result;
}

/** Clears the web password, signs the person out everywhere and sends the invite again. */
export async function requireNewPassword(
  tx: DatabaseExecutor,
  env: InviteEnvironment,
  userId: string,
): Promise<void> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound('That person');
  if (!user.phoneE164) {
    throw invalid('Add a mobile number first: the new password is set with a code sent to it.', {
      phone: 'Mobile number is required.',
    });
  }
  await tx
    .update(users)
    .set({ passwordHash: null, lastActiveAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await tx.delete(sessions).where(eq(sessions.userId, userId));
  const kinds = (await roleKindsByUser(tx, [userId])).get(userId) ?? [];
  await queueInvite(tx, env, { ...user, phoneE164: user.phoneE164, roleKinds: kinds });
}

@Injectable()
export class PersonInvites {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  /** Sends the invite again: only before the first sign-in, and once every 10 minutes. */
  async resend(actor: Actor, id: string): Promise<Person> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw notFound('That person');
    if (user.lastActiveAt) throw conflict('They have already signed in.', 'already_signed_in');
    if (user.status !== 'active' || !user.phoneE164) {
      throw conflict('Only a current member with a mobile number can be invited.', 'not_invitable');
    }
    const phoneE164 = user.phoneE164;
    const [last] = await this.db
      .select({ createdAt: outbox.createdAt })
      .from(outbox)
      .where(and(eq(outbox.template, TEMPLATE), like(outbox.dedupeKey, `${TEMPLATE}:${id}:%`)))
      .orderBy(desc(outbox.createdAt))
      .limit(1);
    if (last && Date.now() - last.createdAt.getTime() < RESEND_AFTER_MS) {
      throw conflict(
        'An invite went out a few minutes ago. Try again in 10 minutes.',
        'invite_too_soon',
      );
    }
    const kinds = (await roleKindsByUser(this.db, [id])).get(id) ?? [];
    await this.db.transaction(async (tx) => {
      await queueInvite(tx, this.env, { ...user, phoneE164, roleKinds: kinds });
      await recordAudit(tx, actor.userId, 'person.invited', 'user', id);
    });
    return this.get(id);
  }

  /** A past member gives up their number so a new joiner can have it. */
  async releasePhone(actor: Actor, id: string): Promise<Person> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw notFound('That person');
    if (user.status !== 'inactive') {
      throw conflict('Only someone who left the team can give up their number.', 'person_active');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ phoneE164: null, updatedAt: new Date() })
        .where(eq(users.id, id));
      await recordAudit(tx, actor.userId, 'person.phone_released', 'user', id, {
        phone: user.phoneE164,
      });
    });
    return this.get(id);
  }

  private async get(id: string): Promise<Person> {
    const person = (await readPeople(this.db, this.env)).find((entry) => entry.id === id);
    if (!person) throw notFound('That person');
    return person;
  }
}
