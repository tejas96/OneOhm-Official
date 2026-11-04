import { likeTerm } from '../../common/paging';

/**
 * An ILIKE pattern that finds an action by the words the activity log shows for it.
 * The screen turns `role.updated` into "Role updated", so each space in the search
 * matches any one character (the `.` or `_` between words in the code).
 */
export function actionPattern(search: string): string {
  return likeTerm(search.trim()).replace(/\s+/g, '_');
}
