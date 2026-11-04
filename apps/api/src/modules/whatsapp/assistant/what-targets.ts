import type { DatabaseExecutor } from '@oneohm/database';
import { customerCategoryFor, isPersonDocumentCategory } from '@oneohm/domain';
import { loadRequirements } from '../../reports/document-requirements.service';
import type { Chosen } from './files-wait';
import type { OpenPaper } from './paper-match';

/** Where the picked papers go: their kind, and the home (none for an ID paper). */
export interface Target {
  readonly category: string;
  /** A property id, `'person'` for an ID paper, or null while the home is still to be asked. */
  readonly home: string | 'person' | null;
}

/** The kind of paper a checklist item stands for, from the owner's list of required papers. */
async function categoryOfItem(db: DatabaseExecutor, key: string): Promise<string> {
  const requirement = (await loadRequirements(db)).find((one) => one.key === key);
  return (requirement && customerCategoryFor(requirement)) ?? 'other';
}

/**
 * Where a chosen row sends the files: an asked paper keeps its own kind and home; a missing
 * checklist paper its kind on its home; "Something else" is Other, home still to ask. A
 * customer with one home never gets a question: that home is every home paper's.
 */
export async function targetOf(
  db: DatabaseExecutor,
  chosen: Chosen,
  asked: readonly OpenPaper[],
  homeCount: number,
  onlyHome: string | null,
): Promise<Target | null> {
  let category: string;
  let home: string | null;
  if (chosen.kind === 'ask') {
    const paper = asked.find((one) => one.id === chosen.actionId);
    if (!paper) return null;
    category = paper.category;
    home = paper.propertyId;
  } else if (chosen.kind === 'item') {
    category = await categoryOfItem(db, chosen.key);
    home = chosen.propertyId;
  } else {
    category = 'other';
    home = null;
  }
  if (isPersonDocumentCategory(category)) return { category, home: 'person' };
  return { category, home: home ?? (homeCount === 1 ? onlyHome : null) };
}
