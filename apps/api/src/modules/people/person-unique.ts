import { users } from '@oneohm/database';
import { and, eq, ne } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import type { PersonPatch } from './person-fields';

/**
 * Email, mobile number and employee ID belong to one person each. A number held by a past
 * member answers `phone_of_past_member`, with who and when, so the screen can offer to
 * add them back or to give the number to the new person.
 */
export async function assertUnique(
  db: Database,
  input: Pick<PersonPatch, 'email' | 'phone' | 'employeeCode'>,
  exceptUserId?: string,
): Promise<void> {
  const checks = [
    [
      'email',
      input.email ? eq(users.email, input.email) : null,
      'This email is already used by someone.',
    ],
    ['phone', input.phone ? eq(users.phoneE164, input.phone) : null, ''],
    [
      'employeeCode',
      input.employeeCode ? eq(users.employeeCode, input.employeeCode) : null,
      'This employee ID is taken.',
    ],
  ] as const;
  for (const [field, condition, message] of checks) {
    if (!condition) continue;
    const [found] = await db
      .select({ id: users.id, fullName: users.fullName, status: users.status })
      .from(users)
      .where(exceptUserId ? and(condition, ne(users.id, exceptUserId)) : condition)
      .limit(1);
    if (!found) continue;
    if (field !== 'phone') throw conflict(message, `duplicate_${field}`);
    if (found.status === 'active')
      throw conflict(`This mobile number belongs to ${found.fullName}.`, 'duplicate_phone');
    throw conflict(
      `This number belongs to ${found.fullName}, who left the team.`,
      'phone_of_past_member',
      {
        userId: found.id,
        fullName: found.fullName,
        leftOn: null,
      },
    );
  }
}
