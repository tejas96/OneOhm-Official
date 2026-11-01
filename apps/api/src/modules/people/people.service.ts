import { Inject, Injectable } from '@nestjs/common';
import type { Person } from '@oneohm/api-contracts';
import { hashPassword, roles, sessions, userRoles, users } from '@oneohm/database';
import { SUPER_ADMIN_ROLE_KEY } from '@oneohm/domain';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { readPeople } from './people-read';
import { auditablePatch, type PersonPatch, personFields } from './person-fields';
import { setSkills } from './person-skills';
import { saveWork, type WorkPatch } from './person-work';

export interface NewPerson {
  readonly fullName: string;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly employeeCode?: string | null | undefined;
  readonly designation?: string | null | undefined;
  readonly password?: string | null | undefined;
  readonly roleIds: readonly string[];
}

@Injectable()
export class PeopleService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(): Promise<Person[]> {
    return readPeople(this.db);
  }

  async create(actor: Actor, input: NewPerson): Promise<Person> {
    if (!input.email && !input.phone) {
      throw invalid('Add an email (web sign-in) or a mobile number (app sign-in).', {
        email: 'Email or mobile number is required.',
      });
    }
    if (input.email && !input.password) {
      throw invalid('Set a first password for web sign-in.', {
        password: 'Required with an email.',
      });
    }
    await this.assertUnique(input);
    await this.assertRolesExist(input.roleIds);
    const id = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          fullName: input.fullName,
          email: input.email ?? null,
          phoneE164: input.phone ?? null,
          employeeCode: input.employeeCode ?? null,
          designation: input.designation ?? null,
          passwordHash: input.password ? await hashPassword(input.password) : null,
          avatarSwatch: Math.floor(Math.random() * 6),
        })
        .returning({ id: users.id });
      if (!created) throw new Error('User insert returned nothing.');
      await tx
        .insert(userRoles)
        .values(input.roleIds.map((roleId) => ({ userId: created.id, roleId })));
      await recordAudit(tx, actor.userId, 'person.created', 'user', created.id, {
        roleIds: input.roleIds,
      });
      return created.id;
    });
    return this.get(id);
  }

  async update(actor: Actor, id: string, patch: PersonPatch & WorkPatch): Promise<Person> {
    const [existing] = await this.db
      .select({ id: users.id, email: users.email, phone: users.phoneE164 })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) throw notFound('That person');
    const email = patch.email === undefined ? existing.email : patch.email;
    const phone = patch.phone === undefined ? existing.phone : patch.phone;
    if (!email && !phone) {
      throw invalid('Keep an email or a mobile number so they can sign in.', {
        email: 'Email or mobile number is required.',
      });
    }
    if (patch.roleIds) await this.assertRolesExist(patch.roleIds);
    await this.assertUnique(patch, id);
    const fields = await personFields(patch);
    await this.db.transaction(async (tx) => {
      if (patch.roleIds || patch.status === 'inactive')
        await this.assertKeepsASuperAdmin(tx, id, patch.roleIds, patch.status);
      if (patch.roleIds) {
        await tx.delete(userRoles).where(eq(userRoles.userId, id));
        await tx.insert(userRoles).values(patch.roleIds.map((roleId) => ({ userId: id, roleId })));
      }
      if (patch.skills) await setSkills(tx, id, patch.skills);
      await saveWork(tx, id, patch);
      if (Object.keys(fields).length > 0)
        await tx
          .update(users)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(users.id, id));
      // Deactivating someone or resetting their password signs them out everywhere.
      if (patch.status === 'inactive' || patch.password)
        await tx.delete(sessions).where(eq(sessions.userId, id));
      await recordAudit(tx, actor.userId, 'person.updated', 'user', id, auditablePatch(patch));
    });
    return this.get(id);
  }

  private async get(id: string): Promise<Person> {
    const person = (await this.list()).find((entry) => entry.id === id);
    if (!person) throw notFound('That person');
    return person;
  }

  private async assertUnique(
    input: Pick<PersonPatch, 'email' | 'phone' | 'employeeCode'>,
    exceptUserId?: string,
  ): Promise<void> {
    const checks = [
      [
        'email',
        input.email ? eq(users.email, input.email) : null,
        'This email is already used by someone.',
      ],
      [
        'phone',
        input.phone ? eq(users.phoneE164, input.phone) : null,
        'This mobile number is already used by someone.',
      ],
      [
        'employeeCode',
        input.employeeCode ? eq(users.employeeCode, input.employeeCode) : null,
        'This employee ID is taken.',
      ],
    ] as const;
    for (const [field, condition, message] of checks) {
      if (!condition) continue;
      const [found] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(exceptUserId ? and(condition, ne(users.id, exceptUserId)) : condition)
        .limit(1);
      if (found) throw conflict(message, `duplicate_${field}`);
    }
  }

  private async assertRolesExist(roleIds: readonly string[]): Promise<void> {
    const found = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(inArray(roles.id, [...roleIds]));
    if (found.length !== new Set(roleIds).size)
      throw invalid('One of the roles does not exist.', { roleIds: 'Unknown role.' });
  }

  /** There must always be at least one active Super Admin. */
  private async assertKeepsASuperAdmin(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    userId: string,
    nextRoleIds: readonly string[] | undefined,
    nextStatus: 'active' | 'inactive' | undefined,
  ): Promise<void> {
    const [superAdmin] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, SUPER_ADMIN_ROLE_KEY))
      .limit(1);
    if (!superAdmin) return;
    const keeps =
      nextStatus !== 'inactive' && (nextRoleIds ? nextRoleIds.includes(superAdmin.id) : true);
    if (keeps) return;
    const holders = await tx
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(
        and(eq(userRoles.roleId, superAdmin.id), eq(users.status, 'active'), ne(users.id, userId)),
      );
    if (holders.length === 0)
      throw conflict('Someone else must be a Super Admin first.', 'last_super_admin');
  }
}
