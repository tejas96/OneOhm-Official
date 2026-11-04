import type { ActionItem } from '@oneohm/api-contracts';
import type { Database } from '@oneohm/database';
import { acceptedWithoutProjectCount } from '../quotations/quotation-project';
import { plural } from './command-center-plural';

/** Accepted quotes nobody has started a project for: the advance link waits on them (B1). */
export async function startProjectActions(db: Database): Promise<ActionItem[]> {
  const { count, oldest } = await acceptedWithoutProjectCount(db);
  if (count === 0 || !oldest) return [];
  return [
    {
      id: 'start-projects',
      tone: 'atRisk',
      title: plural(
        count,
        '1 accepted quote without a project',
        '# accepted quotes without a project',
      ),
      detail: `Oldest: ${oldest.number} · ${oldest.customer}`,
      action: 'Start project',
      party: 'internal',
      href: '/quotations?filter=accepted',
    },
  ];
}
