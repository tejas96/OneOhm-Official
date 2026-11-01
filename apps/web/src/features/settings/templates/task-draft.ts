import type { TaskTemplateInput, TaskTemplateRecord } from '@oneohm/api-contracts';
import { checklistLineKey, defaultChecklist } from '@oneohm/domain';

/** The form's copy of a template; list fields typed as text are kept as text. */
export type TaskDraft = Omit<TaskTemplateInput, 'conditions'> & {
  conditions: NonNullable<TaskTemplateInput['conditions']>;
  discomText: string;
  capturesText: string;
  /** One checklist line per row of text. */
  checklistText: string;
};

export type SetDraft = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => void;

export const BLANK_TASK: TaskDraft = {
  key: '',
  title: '',
  stage: 'survey',
  roleKey: '',
  skillKey: null,
  offsetDays: 0,
  durationDays: 1,
  dependsOn: [],
  conditions: {},
  discomText: '',
  waitingParty: 'internal',
  customerVisible: false,
  notifyCustomer: false,
  notifyEvent: 'completed',
  messageKey: 'project_milestone',
  customerTitle: null,
  notifyManager: false,
  approval: false,
  evidence: [],
  captures: [],
  capturesText: '',
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
    discomText: (template.conditions?.discomCodes ?? []).join(', '),
    capturesText: template.captures.join(', '),
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

const list = (text: string) =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** What the API takes: empty conditions become none, text lists become arrays. */
export function toInput(draft: TaskDraft): TaskTemplateInput {
  const { discomText, capturesText, checklistText, ...rest } = draft;
  const discomCodes = list(discomText).map((code) => code.toUpperCase());
  const conditions = Object.fromEntries(
    Object.entries({ ...draft.conditions, discomCodes }).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined,
    ),
  );
  return {
    ...rest,
    conditions: Object.keys(conditions).length > 0 ? conditions : null,
    captures: list(capturesText),
    checklist: draft.evidence.includes('checklist')
      ? checklistFrom(checklistText, draft.key)
      : (draft.checklist ?? null),
    customerTitle: draft.customerTitle?.trim() ? draft.customerTitle.trim() : null,
  };
}
