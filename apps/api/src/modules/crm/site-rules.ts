import { customers, type DatabaseExecutor, properties } from '@oneohm/database';
import { CONSUMER_NUMBER_KEY_SQL, normalizeConsumerNumber } from '@oneohm/domain';
import { and, eq, ne, sql } from 'drizzle-orm';
import { AppError, invalid } from '../../common/http/errors';

/** The database index that keeps consumer numbers unique (migration 0052). */
export const CONSUMER_NUMBER_INDEX = 'properties_consumer_number_unique';

const DUPLICATE = 'This consumer number is already on another site.';

interface ClashCheck {
  /** The site being edited; it may keep its own number. */
  readonly exceptPropertyId?: string | undefined;
  /** The form field to show the message on, e.g. `consumerNumber` or `property.consumerNumber`. */
  readonly field: string;
  /** Name the customer and site that hold it (staff who may see customers). */
  readonly reveal: boolean;
}

/**
 * Refuses a consumer number another site already has (PRD 3.2): each connection has its
 * own number, so a match is the same connection typed twice, or a typing mistake.
 */
export async function assertConsumerNumberFree(
  db: DatabaseExecutor,
  consumerNumber: string | null | undefined,
  check: ClashCheck,
): Promise<void> {
  if (!consumerNumber) return;
  const key = normalizeConsumerNumber(consumerNumber);
  const [holder] = await db
    .select({ label: properties.label, customer: customers.name })
    .from(properties)
    .innerJoin(customers, eq(customers.id, properties.customerId))
    .where(
      and(
        sql`${sql.raw(CONSUMER_NUMBER_KEY_SQL)} = ${key}`,
        check.exceptPropertyId ? ne(properties.id, check.exceptPropertyId) : undefined,
      ),
    )
    .limit(1);
  if (!holder) return;
  const message = check.reveal
    ? `This consumer number is already on ${holder.customer} · ${holder.label}.`
    : DUPLICATE;
  throw invalid(message, { [check.field]: 'Already on another site. Check the bill.' });
}

/** Two saves at once got past the check; the database index refused the second. */
export function consumerNumberClash(error: unknown, field: string): AppError | null {
  const seen = (value: unknown) =>
    typeof value === 'object' && value !== null
      ? (value as { code?: string; constraint_name?: string; constraint?: string })
      : undefined;
  for (const candidate of [seen(error), seen((error as { cause?: unknown })?.cause)]) {
    const constraint = candidate?.constraint_name ?? candidate?.constraint;
    if (candidate?.code === '23505' && constraint === CONSUMER_NUMBER_INDEX) {
      return invalid(DUPLICATE, { [field]: 'Already on another site. Check the bill.' });
    }
  }
  return null;
}

/** Runs a save and turns a consumer-number clash from the database into a field message. */
export async function savingSite<T>(field: string, save: () => Promise<T>): Promise<T> {
  try {
    return await save();
  } catch (error) {
    throw consumerNumberClash(error, field) ?? error;
  }
}

const sameLabel = (label: string) =>
  sql`lower(btrim(${properties.label})) = ${label.trim().toLowerCase()}`;

/** Each site of a customer has its own name, so people and projects can tell them apart. */
export async function assertLabelFree(
  db: DatabaseExecutor,
  customerId: string,
  label: string,
  check: { readonly exceptPropertyId?: string | undefined; readonly field: string },
): Promise<void> {
  const [taken] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.customerId, customerId),
        sameLabel(label),
        check.exceptPropertyId ? ne(properties.id, check.exceptPropertyId) : undefined,
      ),
    )
    .limit(1);
  if (taken) {
    throw invalid(`This customer already has a site called ${label.trim()}.`, {
      [check.field]: 'Use another name, e.g. Shop or Farm.',
    });
  }
}

/**
 * The name for a site added from a lead. The field app names every site after its type
 * ("Home"), so a second one becomes "Home 2" instead of failing.
 */
export async function freeLabel(
  db: DatabaseExecutor,
  customerId: string,
  label: string,
): Promise<string> {
  const rows = await db
    .select({ label: properties.label })
    .from(properties)
    .where(eq(properties.customerId, customerId));
  const taken = new Set(rows.map((row) => row.label.trim().toLowerCase()));
  const base = label.trim();
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}
