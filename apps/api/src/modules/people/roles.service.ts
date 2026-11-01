import { Inject, Injectable } from '@nestjs/common';
import type { Role } from '@oneohm/api-contracts';
import { roleCapabilities, roles, userRoles } from '@oneohm/database';
import { type Capability, isCapability, type RoleKind } from '@oneohm/domain';
import { asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** Roles are data: add, rename, re-permission or archive without a developer (PRD 7.3). */
@Injectable()
export class RolesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<Role[]> {
    const rows = await this.db.select().from(roles).orderBy(asc(roles.name));
    const grants = await this.db.select().from(roleCapabilities);
    const members = await this.db
      .select({ roleId: userRoles.roleId, count: sql<number>`count(*)::int` })
      .from(userRoles)
      .groupBy(userRoles.roleId);
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      kind: row.kind,
      description: row.description,
      system: row.system,
      archived: row.archivedAt !== null,
      capabilities: grants
        .filter((grant) => grant.roleId === row.id)
        .map((grant) => grant.capability)
        .filter(isCapability)
        .sort(),
      memberCount: members.find((member) => member.roleId === row.id)?.count ?? 0,
    }));
  }

  async create(
    actor: Actor,
    input: { name: string; kind: RoleKind; description: string; capabilities: Capability[] },
  ): Promise<Role> {
    const key = slug(input.name);
    const [taken] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, key))
      .limit(1);
    if (taken) throw conflict('A role with this name already exists.', 'duplicate_role');
    const id = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(roles)
        .values({ key, name: input.name, kind: input.kind, description: input.description })
        .returning({ id: roles.id });
      if (!created) throw new Error('Role insert returned nothing.');
      if (input.capabilities.length > 0) {
        await tx.insert(roleCapabilities).values(
          [...new Set(input.capabilities)].map((capability) => ({
            roleId: created.id,
            capability,
          })),
        );
      }
      await recordAudit(tx, actor.userId, 'role.created', 'role', created.id, { name: input.name });
      return created.id;
    });
    return this.get(id);
  }

  async update(
    actor: Actor,
    id: string,
    patch: {
      name?: string | undefined;
      description?: string | undefined;
      capabilities?: Capability[] | undefined;
      archived?: boolean | undefined;
    },
  ): Promise<Role> {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!role) throw notFound('That role');
    if (role.system && (patch.capabilities || patch.archived)) {
      throw conflict('The Super Admin role always keeps every permission.', 'system_role');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(roles)
        .set({
          ...(patch.name ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.archived !== undefined
            ? { archivedAt: patch.archived ? new Date() : null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(roles.id, id));
      if (patch.capabilities) {
        await tx.delete(roleCapabilities).where(eq(roleCapabilities.roleId, id));
        if (patch.capabilities.length > 0) {
          await tx
            .insert(roleCapabilities)
            .values(
              [...new Set(patch.capabilities)].map((capability) => ({ roleId: id, capability })),
            );
        }
      }
      await recordAudit(tx, actor.userId, 'role.updated', 'role', id, patch);
    });
    return this.get(id);
  }

  private async get(id: string): Promise<Role> {
    const role = (await this.list()).find((entry) => entry.id === id);
    if (!role) throw notFound('That role');
    return role;
  }
}
