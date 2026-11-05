import { customerActions, type DatabaseExecutor, projects, properties } from '@oneohm/database';
import { isStepKind, type StepKind } from '@oneohm/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

export interface StepFacts {
  readonly kind: StepKind;
  readonly amountPaise: number;
  readonly bank: string;
  readonly branch: string;
  readonly day: string;
  readonly paper: string;
}

/** A journey question that still waits for the customer, as Home shows it. */
export interface JourneyAsk {
  readonly kind: 'journey';
  readonly requestId: string;
  /** `roof_now`: they said "Not yet", so the button is [It's ready now]. */
  readonly ask: 'roof' | 'roof_now' | 'install' | 'sign' | 'step' | 'step_now';
  readonly paper: string | null;
  /** A subsidy, bank or layout question: which one and what it names. */
  readonly step: StepFacts | null;
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
        // The fixed check and the AMC renewal offer have their own buttons, not a journey line on Home.
        sql`coalesce(${customerActions.payload}->>'kind', '') not in ('problem_fixed', 'amc_renewal')`,
      ),
    )
    .orderBy(asc(customerActions.createdAt));
  return rows.map((row) => {
    const kind = row.payload.kind;
    const step = isStepKind(kind) ? kind : null;
    return {
      kind: 'journey' as const,
      requestId: row.id,
      ask: askOf(row.type, row.payload, step),
      paper: row.type === 'signature' ? String(row.payload.paperTitle ?? row.title) : null,
      step: step && {
        kind: step,
        amountPaise: Number(row.payload.amountPaise ?? 0),
        bank: String(row.payload.bank ?? ''),
        branch: String(row.payload.branch ?? ''),
        day: String(row.payload.dayText ?? ''),
        paper: String(row.payload.paperTitle ?? ''),
      },
      home: row.label?.trim() || row.city || null,
    };
  });
}

/** Which question this is, for Home's line and button. */
function askOf(
  type: string,
  payload: Record<string, unknown>,
  step: StepKind | null,
): JourneyAsk['ask'] {
  if (type === 'signature') return 'sign';
  if (step) return payload.answer === 'not_yet' ? 'step_now' : 'step';
  if (payload.kind === 'installation') return 'install';
  return payload.answer === 'not_yet' ? 'roof_now' : 'roof';
}
