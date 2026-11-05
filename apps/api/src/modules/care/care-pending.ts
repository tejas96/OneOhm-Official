import { customerActions, type DatabaseExecutor, projects, properties } from '@oneohm/database';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';

/** A care question that still waits for the customer, as Home shows it (rating, UPI ID, fixed check, AMC renewal). */
export interface CareAsk {
  readonly kind: 'care';
  readonly ask: 'rate' | 'upi' | 'fixed' | 'renew';
  readonly requestId: string;
  /** What it is about: the stage key or the problem's topic. */
  readonly about: string;
  readonly stage: boolean;
  readonly amountPaise: number;
  readonly endsOn: string;
  readonly home: string | null;
}

const KINDS = ['problem_fixed', 'amc_renewal'];

/** The open rating, UPI, fixed-check and AMC-renewal asks of the customer, oldest first. */
export async function careAsks(db: DatabaseExecutor, customerId: string): Promise<CareAsk[]> {
  const rows = await db
    .select({
      id: customerActions.id,
      type: customerActions.type,
      title: customerActions.title,
      payload: customerActions.payload,
      label: properties.label,
      city: properties.city,
    })
    .from(customerActions)
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .leftJoin(properties, eq(properties.id, projects.propertyId))
    .where(
      and(
        eq(customerActions.customerId, customerId),
        eq(customerActions.status, 'open'),
        or(
          inArray(customerActions.type, ['rating', 'payout']),
          sql`${customerActions.payload}->>'kind' in (${sql.join(
            KINDS.map((one) => sql`${one}`),
            sql`, `,
          )})`,
        ),
      ),
    )
    .orderBy(asc(customerActions.createdAt));
  return rows.map((row) => ({
    kind: 'care' as const,
    ask:
      row.type === 'rating'
        ? ('rate' as const)
        : row.type === 'payout'
          ? ('upi' as const)
          : row.payload.kind === 'problem_fixed'
            ? ('fixed' as const)
            : ('renew' as const),
    requestId: row.id,
    about:
      row.type === 'rating' && row.payload.kind === 'stage'
        ? String(row.payload.stage ?? '')
        : String(row.payload.topic ?? row.title.replace(/^Rate: /, '')),
    stage: row.type === 'rating' && row.payload.kind === 'stage',
    amountPaise: Number(row.payload.amountPaise ?? 0),
    endsOn: String(row.payload.endsOn ?? ''),
    home: row.label?.trim() || row.city || null,
  }));
}
