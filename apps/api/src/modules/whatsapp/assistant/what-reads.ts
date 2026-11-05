import type { DatabaseExecutor } from '@oneohm/database';
import { isPersonDocumentCategory } from '@oneohm/domain';
import type { CustomerHome } from '../../customer-portal/customer-homes';
import { paperKindWords } from '../../documents/paper-kind-words';
import type { DocumentChecklistService } from '../../reports/document-checklist.service';
import { languageNow } from './language';
import type { OpenPaper } from './paper-match';
import { openPapersOf } from './paper-reads';
import type { AskedRow, MissingRow } from './what-question';

/** The home a paper is for, by its title: an ID paper has none; a lone home is every paper's. */
export function homeOfPaper(
  homes: readonly CustomerHome[],
  paper: { readonly category: string; readonly propertyId: string | null },
): CustomerHome | null {
  if (isPersonDocumentCategory(paper.category)) return null;
  const only = homes.length === 1 ? homes[0] : undefined;
  return homes.find((home) => home.propertyId === paper.propertyId) ?? only ?? null;
}

/** The papers we asked this customer for, as "What is this?" lists them (oldest first). */
export async function askedRows(
  db: DatabaseExecutor,
  customerId: string,
  homes: readonly CustomerHome[],
): Promise<{ rows: AskedRow[]; papers: OpenPaper[] }> {
  const papers = await openPapersOf(db, customerId);
  const rows = papers.map((paper) => ({
    id: paper.id,
    title: paper.title,
    home: homeOfPaper(homes, paper)?.title ?? null,
    person: isPersonDocumentCategory(paper.category),
  }));
  return { rows, papers };
}

/**
 * The customer's missing checklist papers, per home from the document rules (an ID paper
 * once, whatever the homes). Two papers of one kind on a home are told apart by their
 * checklist names; otherwise a paper is named by its kind in the customer's language.
 */
export async function missingRows(
  checklists: Pick<DocumentChecklistService, 'missingFromCustomer'>,
  homes: readonly CustomerHome[],
): Promise<MissingRow[]> {
  const language = languageNow();
  const found: (MissingRow & { category: string; label: string })[] = [];
  for (const home of homes) {
    if (!home.projectId) continue;
    for (const item of await checklists.missingFromCustomer(home.projectId)) {
      const category = item.askCategory;
      if (!category) continue;
      const person = isPersonDocumentCategory(category);
      if (person && found.some((one) => one.category === category)) continue;
      found.push({
        key: item.key,
        propertyId: person ? null : home.propertyId,
        title: paperKindWords(language, category),
        home: person ? null : home.title,
        category,
        label: item.label,
      });
    }
  }
  return found.map((one) => {
    const twin = found.some(
      (other) =>
        other !== one && other.category === one.category && other.propertyId === one.propertyId,
    );
    return {
      key: one.key,
      propertyId: one.propertyId,
      home: one.home,
      title: twin ? one.label : one.title,
    };
  });
}
