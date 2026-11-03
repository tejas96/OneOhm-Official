import type { ActionItem } from '@oneohm/api-contracts';
import type { Database } from '@oneohm/database';
import { acceptedWithoutProject } from '../quotations/quotation-project';
import { plural } from './command-center-plural';

/** Accepted quotes nobody has started a project for: the advance link waits on them (B1). */
export async function startProjectActions(db: Database): Promise<ActionItem[]> {
  const waiting = await acceptedWithoutProject(db);
  if (waiting.length === 0) return [];
  return [
    {
      id: 'start-projects',
      tone: 'atRisk',
      title: plural(
        waiting.length,
        '1 accepted quote without a project',
        '# accepted quotes without a project',
      ),
      detail: `Oldest: ${waiting[0]?.number} · ${waiting[0]?.customer}`,
      action: 'Start project',
      party: 'internal',
      href: '/quotations?filter=accepted',
    },
  ];
}
