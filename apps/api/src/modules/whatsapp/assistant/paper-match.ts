import { isPersonDocumentCategory } from '@oneohm/domain';

/** An open request of the customer, and the home its project is on. */
export interface OpenPaper {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly propertyId: string | null;
  /** The checklist item it answers; absent on older requests. */
  readonly requirementKey?: string | null;
}

/** The place papers are matched by: a property id, or `'person'` for the ID and income papers. */
export interface PaperHome {
  readonly propertyId: string | 'person';
}

/**
 * The open requests a file for this home answers, oldest first. A home's are its site
 * papers; the person row's are the ID and income papers. A customer with one home whose
 * home waits on nothing else answers their person papers with it (decision 2).
 */
export function papersForHome(
  open: readonly OpenPaper[],
  choice: PaperHome,
  homeCount: number,
): OpenPaper[] {
  const person = open.filter((paper) => isPersonDocumentCategory(paper.category));
  if (choice.propertyId === 'person') return person;
  const site = open.filter(
    (paper) =>
      !isPersonDocumentCategory(paper.category) &&
      (paper.propertyId === choice.propertyId || (homeCount === 1 && paper.propertyId === null)),
  );
  return site.length === 0 && homeCount === 1 ? person : site;
}
