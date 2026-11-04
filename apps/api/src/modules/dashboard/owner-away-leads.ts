import type { ActionItem } from '@oneohm/api-contracts';
import { awayUserIds, type Database, leads } from '@oneohm/database';
import { and, count, inArray, notInArray } from 'drizzle-orm';
import { plural } from './command-center-plural';

/**
 * Open leads whose owner is away today (live review B8): their backup gets the alerts,
 * and the owner sees how many, so a long leave can be reassigned.
 */
export async function ownerAwayActions(db: Database, today: string): Promise<ActionItem[]> {
  const away = [...(await awayUserIds(db, today))];
  if (away.length === 0) return [];
  const [row] = await db
    .select({ total: count() })
    .from(leads)
    .where(and(inArray(leads.ownerUserId, away), notInArray(leads.stage, ['won', 'lost'])));
  const total = row?.total ?? 0;
  if (total === 0) return [];
  return [
    {
      id: 'owner-away-leads',
      tone: 'atRisk',
      title: plural(
        total,
        '1 open lead whose owner is on leave',
        '# open leads whose owner is on leave',
      ),
      detail: 'Their backup gets the alerts today. Reassign them if the leave is long.',
      action: 'Open leads',
      party: 'internal',
      href: '/leads?filter=open',
    },
  ];
}
