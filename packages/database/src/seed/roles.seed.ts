import { DEFAULT_ROLES } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import { roleCapabilities, roles } from '../schema';

/** OneOhm's 15 roles and their default permissions. Existing roles are left as edited. */
export async function seedRoles(db: Database): Promise<void> {
  for (const role of DEFAULT_ROLES) {
    const existing = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, role.key))
      .limit(1);
    if (existing[0]) continue;
    const [created] = await db
      .insert(roles)
      .values({
        key: role.key,
        name: role.name,
        kind: role.kind,
        description: role.description,
        system: role.system ?? false,
      })
      .returning({ id: roles.id });
    if (!created) throw new Error(`Could not create role ${role.key}`);
    await db
      .insert(roleCapabilities)
      .values(role.capabilities.map((capability) => ({ roleId: created.id, capability })));
  }
}
