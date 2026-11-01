import { type DatabaseExecutor, serviceCategories } from '@oneohm/database';
import { and, asc, eq } from 'drizzle-orm';

/** Categories a customer may pick: in use and not made by OneOhm itself. */
export async function customerCategories(db: DatabaseExecutor) {
  return db
    .select({ key: serviceCategories.key, label: serviceCategories.customerLabel })
    .from(serviceCategories)
    .where(and(eq(serviceCategories.active, true), eq(serviceCategories.system, false)))
    .orderBy(asc(serviceCategories.position), asc(serviceCategories.createdAt));
}

/**
 * The category to file a customer's request under. One that is no longer in use (an old
 * app, or a WhatsApp guess) becomes "other"; the desk can change it.
 */
export async function pickableCategory(db: DatabaseExecutor, key: string): Promise<string> {
  const allowed = await customerCategories(db);
  return allowed.some((category) => category.key === key) ? key : 'other';
}
