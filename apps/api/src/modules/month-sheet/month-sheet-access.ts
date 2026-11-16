import { type DatabaseExecutor, directReportIds } from '@oneohm/database';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden } from '../../common/http/errors';

/** Who may see what on the month sheet, decided once per request. */
export interface SheetAccess {
  /** `all` for HR and finance; `reports` for a manager's direct reports. */
  readonly scope: 'all' | 'reports';
  /** The people a manager may see; undefined means everyone. */
  readonly ids: readonly string[] | undefined;
  /** Monthly pay and gross are shown (HR and finance). */
  readonly showsPay: boolean;
  /** May lock, unlock and refresh rows. */
  readonly canManage: boolean;
}

/** Pay is for HR (`people.manage`) and finance; never for a manager as such. */
export const seesPay = (actor: Actor): boolean =>
  can(actor, 'people.manage') ||
  can(actor, 'finance.approve_payments') ||
  can(actor, 'finance.record_payments');

/**
 * HR and finance see everyone with pay; a manager sees their direct reports, read-only and
 * without pay; anyone else is refused (403).
 */
export async function sheetAccess(db: DatabaseExecutor, actor: Actor): Promise<SheetAccess> {
  const canManage = can(actor, 'people.manage');
  if (seesPay(actor)) return { scope: 'all', ids: undefined, showsPay: true, canManage };
  const ids = await directReportIds(db, actor.userId);
  if (ids.length === 0) throw forbidden();
  return { scope: 'reports', ids, showsPay: false, canManage: false };
}

/** One person's month: HR and finance any; a manager their direct report only (403 else). */
export async function assertMaySeePerson(
  db: DatabaseExecutor,
  actor: Actor,
  userId: string,
): Promise<SheetAccess> {
  const access = await sheetAccess(db, actor);
  if (access.ids && !access.ids.includes(userId)) throw forbidden();
  return access;
}
