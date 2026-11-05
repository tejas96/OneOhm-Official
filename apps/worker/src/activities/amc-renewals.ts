import {
  amcContracts,
  customerActions,
  customers,
  type Database,
  homeNameOf,
  projects,
  queueCustomerMessage,
} from '@oneohm/database';
import { addDays } from '@oneohm/shared';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { visitDay } from './after-sales';

/** The renewal offer goes this many days before the AMC ends. */
export const RENEWAL_LEAD_DAYS = 30;

/**
 * Each morning, an AMC ending within 30 days is offered a renewal (redesign §4): one offer per contract
 * (a "confirm" ask, unique), sent as the marketing template `amc_renewal_offer` with [Renew AMC] and [Talk
 * to us]. A customer who said STOP is not offered it and nothing is queued; a contract that already has a
 * later one on the project is not offered. Returns how many offers were made.
 */
export async function offerAmcRenewals(db: Database, today: string): Promise<number> {
  const ending = await db
    .select({
      contract: amcContracts,
      customer: customers.name,
      phone: customers.phoneE164,
      optIn: customers.whatsappOptIn,
      code: projects.code,
    })
    .from(amcContracts)
    .innerJoin(customers, eq(customers.id, amcContracts.customerId))
    .innerJoin(projects, eq(projects.id, amcContracts.projectId))
    .where(
      and(
        isNull(amcContracts.cancelledAt),
        gte(amcContracts.endsOn, today),
        lte(amcContracts.endsOn, addDays(today, RENEWAL_LEAD_DAYS)),
        sql`not exists (select 1 from amc_contracts later where later.project_id = ${amcContracts.projectId} and later.cancelled_at is null and later.ends_on > ${amcContracts.endsOn})`,
      ),
    );
  let offered = 0;
  for (const row of ending) {
    // Marketing: nothing for a customer who said STOP (they can still ask us for it).
    if (!row.optIn) continue;
    const { contract } = row;
    const done = await db.transaction(async (tx) => {
      const home = await homeNameOf(tx, contract.projectId);
      const [made] = await tx
        .insert(customerActions)
        .values({
          type: 'confirm',
          customerId: contract.customerId,
          projectId: contract.projectId,
          title: `AMC renewal — ${home}`,
          payload: {
            kind: 'amc_renewal',
            contractId: contract.id,
            target: `amc_renewal:${contract.id}`,
            once: `amc_renewal:${contract.id}`,
          },
        })
        .onConflictDoNothing()
        .returning({ id: customerActions.id });
      if (!made) return false;
      await queueCustomerMessage(
        tx,
        row.phone,
        'amc_renewal_offer',
        {
          customer: row.customer.split(/\s+/)[0] ?? row.customer,
          home,
          date: visitDay(contract.endsOn),
          renewPayload: `amc:renew:${made.id}`,
          talkPayload: `amc:talk:${made.id}`,
        },
        `amc_renewal:${contract.id}`,
      );
      return true;
    });
    if (done) offered += 1;
  }
  return offered;
}
