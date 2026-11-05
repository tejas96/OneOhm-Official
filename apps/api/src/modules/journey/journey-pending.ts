import { customerActions, type DatabaseExecutor, projects, properties } from '@oneohm/database';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

/** A journey question that still waits for the customer, as Home shows it. */
export interface JourneyAsk {
  readonly kind: 'journey';
  readonly requestId: string;
  /** `roof_now`: they said "Not yet", so the button is [It's ready now]. */
  readonly ask: 'roof' | 'roof_now' | 'install' | 'sign';
  readonly paper: string | null;
  readonly home: string | null;
}

/**
 * The roof and installation questions and the papers to agree to that still wait for the customer.
 * A signed copy being asked for is a paper of its own and shows as one.
 */
export async function journeyAsks(db: DatabaseExecutor, customerId: string): Promise<JourneyAsk[]> {
  const rows = await db
    .select({
      id: customerActions.id,
      type: customerActions.type,
      payload: customerActions.payload,
      title: customerActions.title,
      label: properties.label,
      city: properties.city,
    })
    .from(customerActions)
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .leftJoin(properties, eq(properties.id, projects.propertyId))
    .where(
      and(
        eq(customerActions.customerId, customerId),
        inArray(customerActions.type, ['signature', 'confirm']),
        eq(customerActions.status, 'open'),
        sql`${customerActions.payload}->>'signedActionId' is null`,
      ),
    )
    .orderBy(asc(customerActions.createdAt));
  return rows.map((row) => ({
    kind: 'journey' as const,
    requestId: row.id,
    ask:
      row.type === 'signature'
        ? ('sign' as const)
        : row.payload.kind === 'installation'
          ? ('install' as const)
          : row.payload.answer === 'not_yet'
            ? ('roof_now' as const)
            : ('roof' as const),
    paper: row.type === 'signature' ? String(row.payload.paperTitle ?? row.title) : null,
    home: row.label?.trim() || row.city || null,
  }));
}
