import { SUPER_ADMIN_ROLE_KEY } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { Database } from '../client';
import { roles, userRoles, users } from '../schema';
import { hashPassword } from '../security/password';

export interface AdminSeed {
  readonly email: string;
  readonly fullName: string;
  readonly password: string;
}

/** The first Super Admin. Does nothing when a user with that email already exists. */
export async function seedSuperAdmin(db: Database, admin: AdminSeed): Promise<boolean> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, admin.email))
    .limit(1);
  if (existing[0]) return false;
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, SUPER_ADMIN_ROLE_KEY))
    .limit(1);
  if (!role) throw new Error('Seed roles before the Super Admin.');
  const [user] = await db
    .insert(users)
    .values({
      fullName: admin.fullName,
      email: admin.email.toLowerCase(),
      employeeCode: 'OH-0001',
      passwordHash: await hashPassword(admin.password),
      designation: 'Super Admin',
    })
    .returning({ id: users.id });
  if (!user) throw new Error('Could not create the Super Admin.');
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  return true;
}
