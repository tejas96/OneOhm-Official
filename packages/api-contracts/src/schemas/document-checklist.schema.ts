import { CUSTOMER_REQUESTABLE_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

/** One required paper or report and whether the project has it (PRD 3.14, 3.18). */
export const checklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  why: z.string(),
  kind: z.enum(['paper', 'report']),
  /** ready_to_save: a report whose data is complete but is not saved to documents yet. */
  status: z.enum(['present', 'missing', 'ready_to_save', 'not_ready']),
  documentIds: z.array(idSchema),
  /** For reports not ready: what is missing, e.g. "Meter serial (Meter installation)". */
  missing: z.array(z.string()),
  /** For a missing paper the customer holds: the category to ask them for. */
  askCategory: z.enum(CUSTOMER_REQUESTABLE_CATEGORIES).nullable(),
  /** An open request to the customer already covers this paper. */
  requested: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const documentChecklistSchema = z.object({
  items: z.array(checklistItemSchema),
  present: z.number().int(),
  total: z.number().int(),
});
export type DocumentChecklist = z.infer<typeof documentChecklistSchema>;
