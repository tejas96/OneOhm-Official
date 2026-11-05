import { rows } from './db';
import { addDays, type Sale, today } from './sales';

// Helpers for the AMC scenarios (70-amc-*, phase 6).

/** An AMC plan made for the scenarios. */
export async function planId(): Promise<string> {
  const [plan] = await rows<{ id: string }>(
    `INSERT INTO amc_plans (name, price_paise, visits_per_year, duration_months, visit_name)
     VALUES ('AMC (test)', 100000, 2, 12, 'cleaning') RETURNING id`,
  );
  if (!plan) throw new Error('No plan.');
  return plan.id;
}

/** An AMC on the sale's project that ends in `endsInDays` days. */
export async function amcEnding(sale: Sale, endsInDays: number, plan: string): Promise<string> {
  const [contract] = await rows<{ id: string }>(
    `INSERT INTO amc_contracts (project_id, customer_id, plan_id, plan_name, visit_name, visits_per_year, starts_on, ends_on, price_paise)
     VALUES ($1, $2, $3, 'AMC (test)', 'cleaning', 2, $4, $5, 100000) RETURNING id`,
    [
      sale.project.id,
      sale.customer.customerId,
      plan,
      addDays(today(), endsInDays - 365),
      addDays(today(), endsInDays),
    ],
  );
  if (!contract) throw new Error('No contract.');
  return contract.id;
}

export const renewalAsks = (customerId: string) =>
  rows<{ id: string; status: string; payload: Record<string, string> }>(
    `SELECT id, status::text AS status, payload FROM customer_actions
      WHERE customer_id = $1 AND type = 'confirm' AND payload->>'kind' = 'amc_renewal' ORDER BY created_at`,
    [customerId],
  );
