import { type DatabaseExecutor, taxSettings } from '@oneohm/database';

/** A contractor's own TDS rate, or the company default from tax settings (PRD 3.11). */
export async function contractorTdsBp(db: DatabaseExecutor, own: number | null): Promise<number> {
  if (own !== null) return own;
  const [row] = await db.select({ bp: taxSettings.contractorTdsBp }).from(taxSettings).limit(1);
  return row?.bp ?? 100;
}
