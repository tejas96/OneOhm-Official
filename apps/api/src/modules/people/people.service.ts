import { Inject, Injectable } from '@nestjs/common';
import type { Person } from '@oneohm/api-contracts';
import { roleCapabilities, roles, sessions, userRoles, users } from '@oneohm/database';
import type { Capability } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { readPeople } from './people-read';
import { auditablePatch, type PersonPatch, personFields } from './person-fields';
import { kindsOfRoles, queueInvite, requireNewPassword } from './person-invite';
import { setSkills } from './person-skills';
import { assertUnique } from './person-unique';
import { saveWork, type WorkPatch } from './person-work';
import { saveReportingLine } from './reporting-line';
import { archivedRolesNewlyGiven, rolesOutOfReach } from './role-grant';
import { assertKeepsASuperAdmin } from './super-admin-guard';

export interface NewPerson {
  readonly fullName: string;
  readonly email?: string | null | undefined;
  readonly phone: string;
  readonly employeeCode?: string | null | undefined;
  readonly designation?: string | null | undefined;
  readonly roleIds: readonly string[];
}

@Injectable()
export class PeopleService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  list(): Promise<Person[]> {
    return readPeople(this.db, this.env);
  }

  async create(actor: Actor, input: NewPerson): Promise<Person> {
    await assertUnique(this.db, input);
    await this.assertRolesExist(input.roleIds);
    await this.assertCanGrant(actor, input.roleIds);
    const id = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          fullName: input.fullName,
          email: input.email ?? null,
          phoneE164: input.phone,
          employeeCode: input.employeeCode ?? null,
          designation: input.designation ?? null,
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
      const roleKinds = await kindsOfRoles(tx, input.roleIds);
      await queueInvite(tx, this.env, {
        id: created.id,
        fullName: input.fullName,
        email: input.email ?? null,
        phoneE164: input.phone,
        roleKinds,
      });
      return created.id;
    });
    return this.get(id);
  }

  async update(
    actor: Actor,
    id: string,
    patch: PersonPatch & WorkPatch & { reportsToUserId?: string | null | undefined },
  ): Promise<Person> {
    const [existing] = await this.db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phoneE164,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) throw notFound('That person');
    // Coming back clears the password and sends a fresh invite: that is rejoin, not a switch.
    if (patch.status === 'active' && existing.status === 'inactive')
      throw conflict('Use Add back to team.', 'use_rejoin');
    // Leaving hands work over and wraps up: that is Remove from team, not a switch.
    if (patch.status === 'inactive' && existing.status === 'active')
      throw conflict('Use Remove from team so their work is handed over.', 'use_remove');
    const email = patch.email === undefined ? existing.email : patch.email;
    const phone = patch.phone === undefined ? existing.phone : patch.phone;
    if (!email && !phone) {
      throw invalid('Keep an email or a mobile number so they can sign in.', {
        email: 'Email or mobile number is required.',
      });
    }
    if (patch.roleIds) {
      const current = await this.db
        .select({ roleId: userRoles.roleId })
        .from(userRoles)
        .where(eq(userRoles.userId, id));
      const before = new Set(current.map((row) => row.roleId));
      await this.assertRolesExist(patch.roleIds, before);
      const after = new Set(patch.roleIds);
      const changed = [...before, ...after].filter(
        (roleId) => before.has(roleId) !== after.has(roleId),
      );
      await this.assertCanGrant(actor, changed);
    }
    await assertUnique(this.db, patch, id);
    const fields = personFields(patch);
    await this.db.transaction(async (tx) => {
      if (patch.roleIds) await assertKeepsASuperAdmin(tx, id, patch.roleIds, patch.status);
      if (patch.roleIds) {
        await tx.delete(userRoles).where(eq(userRoles.userId, id));
        await tx.insert(userRoles).values(patch.roleIds.map((roleId) => ({ userId: id, roleId })));
      }
      if (patch.skills) await setSkills(tx, id, patch.skills);
      await saveWork(tx, id, patch);
      await saveReportingLine(tx, id, patch.reportsToUserId, actor.userId);
      if (Object.keys(fields).length > 0)
        await tx
          .update(users)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(users.id, id));
      // A new number signs out the phone, because the old number may belong to someone else.
      if (patch.phone !== undefined && patch.phone !== existing.phone)
        await tx
          .delete(sessions)
          .where(and(eq(sessions.userId, id), eq(sessions.client, 'mobile')));
      if (patch.requireNewPassword) await requireNewPassword(tx, this.env, id);
      await recordAudit(tx, actor.userId, 'person.updated', 'user', id, auditablePatch(patch));
    });
    return this.get(id);
  }

  private async get(id: string): Promise<Person> {
    const person = (await this.list()).find((entry) => entry.id === id);
    if (!person) throw notFound('That person');
    return person;
  }

  /** Without permission to manage roles, only roles within your own permissions can change. */
  private async assertCanGrant(actor: Actor, roleIds: readonly string[]): Promise<void> {
    if (roleIds.length === 0 || actor.capabilities.has('roles.manage')) return;
    const rows = await this.db
      .select({ id: roles.id, name: roles.name, capability: roleCapabilities.capability })
      .from(roles)
      .leftJoin(roleCapabilities, eq(roleCapabilities.roleId, roles.id))
      .where(inArray(roles.id, [...roleIds]));
    const byRole = new Map<string, { id: string; name: string; capabilities: Capability[] }>();
    for (const row of rows) {
      const role = byRole.get(row.id) ?? { id: row.id, name: row.name, capabilities: [] };
      if (row.capability) role.capabilities.push(row.capability as Capability);
      byRole.set(row.id, role);
    }
    const blocked = rolesOutOfReach(actor.capabilities, [...byRole.values()]);
    if (blocked.length > 0)
      throw forbidden(
        `Only someone who manages roles can give or remove ${blocked.join(', ')}: it has permissions you do not have.`,
      );
  }

  private async assertRolesExist(
    roleIds: readonly string[],
    alreadyHeld: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    const found = await this.db
      .select({ id: roles.id, name: roles.name, archivedAt: roles.archivedAt })
      .from(roles)
      .where(inArray(roles.id, [...roleIds]));
    if (found.length !== new Set(roleIds).size)
      throw invalid('One of the roles does not exist.', { roleIds: 'Unknown role.' });
    const archived = archivedRolesNewlyGiven(
      found.map((role) => ({ ...role, archived: role.archivedAt !== null })),
      alreadyHeld,
    );
    if (archived.length > 0)
      throw invalid(`${archived.join(', ')} is archived, so it cannot be given to anyone.`, {
        roleIds: 'Archived role.',
      });
  }
}
