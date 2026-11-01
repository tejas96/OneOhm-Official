import type { TaskTemplateInput, TaskTemplateRecord } from '@oneohm/api-contracts';

/** The form's copy of a template; list fields typed as text are kept as text. */
export type TaskDraft = Omit<TaskTemplateInput, 'conditions'> & {
  conditions: NonNullable<TaskTemplateInput['conditions']>;
  discomText: string;
  capturesText: string;
};

export type SetDraft = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => void;

export const BLANK_TASK: TaskDraft = {
  key: '',
  title: '',
  stage: 'survey',
  roleKey: '',
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
  };
}

const list = (text: string) =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** What the API takes: empty conditions become none, text lists become arrays. */
export function toInput(draft: TaskDraft): TaskTemplateInput {
  const { discomText, capturesText, ...rest } = draft;
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
    customerTitle: draft.customerTitle?.trim() ? draft.customerTitle.trim() : null,
  };
}
