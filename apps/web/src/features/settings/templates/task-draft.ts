import type { TaskTemplateInput, TaskTemplateRecord } from '@oneohm/api-contracts';
import { checklistLineKey, defaultChecklist } from '@oneohm/domain';

/** The form's copy of a template; the checklist is kept as text, one line per check. */
export type TaskDraft = Omit<TaskTemplateInput, 'conditions'> & {
  conditions: NonNullable<TaskTemplateInput['conditions']>;
  /** One checklist line per row of text. */
  checklistText: string;
};

export type SetDraft = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => void;

export const BLANK_TASK: TaskDraft = {
  key: '',
  title: '',
  description: null,
  stage: 'survey',
  roleKey: '',
  skillKey: null,
  offsetDays: 0,
  durationDays: 1,
  dependsOn: [],
  conditions: {},
  waitingParty: 'internal',
  customerVisible: false,
  notifyCustomer: false,
  notifyEvent: 'completed',
  messageKey: 'project_milestone',
  customerTitle: null,
  recipients: 'customer',
  attachment: null,
  notifyManager: false,
  confirmAssignee: false,
  escalateAfterDays: null,
  approval: false,
  reviewer: 'approvers',
  evidence: [],
  captures: [],
  checklist: null,
  checklistText: '',
  onComplete: null,
  reports: [],
  active: true,
};

export function toDraft(template: TaskTemplateRecord): TaskDraft {
  const { id: _id, position: _position, ...rest } = template;
  return {
    ...rest,
    conditions: template.conditions ?? {},
    checklistText: (template.checklist ?? defaultChecklist(template.key))
      .map((line) => line.label)
      .join('\n'),
  };
}

/**
 * Text lines to checklist lines. The built-in list (or none written) saves as null, so
 * OneOhm's own list keeps applying; a repeated line keeps one copy.
 */
function checklistFrom(text: string, templateKey: string): TaskTemplateInput['checklist'] {
  const labels = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const builtIn = defaultChecklist(templateKey).map((line) => line.label);
  if (labels.length === 0 || labels.join('\n') === builtIn.join('\n')) return null;
  const seen = new Set<string>();
  return labels.flatMap((label) => {
    const key = checklistLineKey(label);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ key, label }];
  });
}

/** Each item once, in the order first picked. */
const unique = (items: readonly string[] | undefined) => [...new Set(items ?? [])];

/** What the API takes: empty conditions become none, picked lists keep one of each. */
export function toInput(draft: TaskDraft): TaskTemplateInput {
  const { checklistText, ...rest } = draft;
  const discomCodes = unique(draft.conditions.discomCodes);
  const conditions = Object.fromEntries(
    Object.entries({ ...draft.conditions, discomCodes }).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined,
    ),
  );
  return {
    ...rest,
    conditions: Object.keys(conditions).length > 0 ? conditions : null,
    captures: unique(draft.captures),
    checklist: draft.evidence.includes('checklist')
      ? checklistFrom(checklistText, draft.key)
      : (draft.checklist ?? null),
    customerTitle: draft.customerTitle?.trim() ? draft.customerTitle.trim() : null,
    description: draft.description?.trim() ? draft.description.trim() : null,
  };
}
