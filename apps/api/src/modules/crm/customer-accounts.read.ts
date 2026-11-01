import type { CustomerAccount } from '@oneohm/api-contracts';
import {
  contractorMembers,
  contractors,
  type DatabaseExecutor,
  roles,
  userRoles,
  users,
  vendors,
} from '@oneohm/database';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Other OneOhm accounts on the same phone: a staff member, reseller, crew member,
 * contractor or vendor (PRD 3.2). The customer page shows them; nothing is merged.
 */
export async function otherAccounts(
  db: DatabaseExecutor,
  phone: string,
): Promise<CustomerAccount[]> {
  const [people, crews, firms, suppliers] = await Promise.all([
    db
      .selectDistinct({ name: users.fullName, kind: roles.kind })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
      .where(eq(users.phoneE164, phone)),
    db
      .select({ name: users.fullName })
      .from(contractorMembers)
      .innerJoin(users, eq(users.id, contractorMembers.userId))
      .where(eq(users.phoneE164, phone)),
    db.select({ name: contractors.name }).from(contractors).where(eq(contractors.phoneE164, phone)),
    db.select({ name: vendors.name }).from(vendors).where(eq(vendors.phoneE164, phone)),
  ]);
  const accounts: CustomerAccount[] = [];
  const add = (kind: CustomerAccount['kind'], name: string) => {
    if (!accounts.some((account) => account.kind === kind)) accounts.push({ kind, name });
  };
  for (const person of people) {
    if (person.kind === 'staff') add('staff', person.name);
    if (person.kind === 'reseller') add('reseller', person.name);
    if (person.kind === 'partner') add('crew', person.name);
  }
  for (const member of crews) add('crew', member.name);
  for (const firm of firms) add('contractor', firm.name);
  for (const supplier of suppliers) add('vendor', supplier.name);
  return accounts;
}
