import { Inject, Injectable } from '@nestjs/common';
import type { PaymentPlan, PaymentPlanInput } from '@oneohm/api-contracts';
import { type DatabaseExecutor, paymentPlans } from '@oneohm/database';
import { checkPaymentPlan, DEFAULT_MILESTONES, type MilestoneShare, stepKey } from '@oneohm/domain';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

type Row = typeof paymentPlans.$inferSelect;

const present = (row: Row): PaymentPlan => ({
  id: row.id,
  name: row.name,
  steps: row.steps as PaymentPlan['steps'],
  isDefault: row.isDefault,
  active: row.active,
});

function toSteps(input: PaymentPlanInput): MilestoneShare[] {
  const steps = input.steps.map((step, index) => ({ ...step, key: stepKey(step.label, index) }));
  const errors = checkPaymentPlan(steps);
  if (Object.keys(errors).length > 0)
    throw invalid(errors.total ?? errors.steps ?? 'Check the payments.', errors);
  return steps;
}

/** The steps a new project uses: the chosen plan, else the default, else 25 / 65 / 10. */
export async function planSteps(
  db: DatabaseExecutor,
  planId?: string | null,
): Promise<readonly MilestoneShare[]> {
  const [row] = await db
    .select({ steps: paymentPlans.steps })
    .from(paymentPlans)
    .where(
      planId
        ? and(eq(paymentPlans.id, planId), eq(paymentPlans.active, true))
        : and(eq(paymentPlans.isDefault, true), eq(paymentPlans.active, true)),
    )
    .limit(1);
  if (planId && !row)
    throw invalid('Pick payment terms from the list.', { paymentPlanId: 'Unknown plan.' });
  return (row?.steps as MilestoneShare[] | undefined) ?? DEFAULT_MILESTONES;
}

/** Payment terms owners set up (PRD 3.7, 7.2). Projects keep the amounts they started with. */
@Injectable()
export class PaymentPlansService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<PaymentPlan[]> {
    const rows = await this.db
      .select()
      .from(paymentPlans)
      .orderBy(desc(paymentPlans.isDefault), asc(paymentPlans.name));
    return rows.map(present);
  }

  async create(actor: Actor, input: PaymentPlanInput): Promise<PaymentPlan> {
    const steps = toSteps(input);
    const [row] = await this.db
      .insert(paymentPlans)
      .values({ name: input.name, steps, active: input.active })
      .returning();
    if (!row) throw new Error('Payment plan insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'payment_plan.created', 'payment_plan', row.id, {
      name: row.name,
    });
    return present(row);
  }

  async update(actor: Actor, id: string, input: PaymentPlanInput): Promise<PaymentPlan> {
    const steps = toSteps(input);
    const [current] = await this.db.select().from(paymentPlans).where(eq(paymentPlans.id, id));
    if (!current) throw notFound('That payment plan');
    if (current.isDefault && !input.active)
      throw invalid('The default plan stays in use. Make another plan the default first.', {
        active: 'Default plan.',
      });
    const [row] = await this.db
      .update(paymentPlans)
      .set({ name: input.name, steps, active: input.active, updatedAt: new Date() })
      .where(eq(paymentPlans.id, id))
      .returning();
    if (!row) throw notFound('That payment plan');
    await recordAudit(this.db, actor.userId, 'payment_plan.updated', 'payment_plan', id, {
      name: row.name,
    });
    return present(row);
  }

  /** Exactly one default: the chosen plan gains the flag and every other plan loses it. */
  async makeDefault(actor: Actor, id: string): Promise<PaymentPlan[]> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(paymentPlans)
        .set({ isDefault: true, active: true, updatedAt: new Date() })
        .where(eq(paymentPlans.id, id))
        .returning({ id: paymentPlans.id });
      if (!row) throw notFound('That payment plan');
      await tx.update(paymentPlans).set({ isDefault: false }).where(ne(paymentPlans.id, id));
      await recordAudit(tx, actor.userId, 'payment_plan.default', 'payment_plan', id);
    });
    return this.list();
  }
}
