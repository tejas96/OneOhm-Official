import { customers, projects, serviceCategories, serviceRequests } from '@oneohm/database';
import type { SQL } from 'drizzle-orm';
import { searchWords } from '../../common/paging';
import { matchWords } from '../../common/search-match';

/**
 * The desk's search: customer name or phone, what went wrong, the category and the project
 * code. Needs customers, projects and service categories joined (as the desk rows are).
 */
export function serviceSearch(q: string | undefined): SQL | undefined {
  return matchWords(searchWords(q), {
    text: [
      customers.name,
      serviceRequests.description,
      serviceRequests.category,
      serviceCategories.label,
    ],
    phones: [customers.phoneE164],
    codes: [projects.code],
  });
}
