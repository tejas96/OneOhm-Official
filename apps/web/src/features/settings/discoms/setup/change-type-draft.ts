import type { ChangeRequestTypeInput, ChangeRequestTypeSetting } from '@oneohm/api-contracts';
import type { ChangeRequestInputKey } from '@oneohm/domain';

export type StepDraft = ChangeRequestTypeInput['steps'][number] & {
  /** A stable id for React lists while steps move around. */
  readonly uid: string;
};

export interface ChangeTypeDraft {
  readonly title: string;
  readonly description: string;
  readonly active: boolean;
  /** Asked for, and whether each must be filled. */
  readonly fields: Partial<Record<ChangeRequestInputKey, boolean>>;
  readonly documents: ChangeRequestTypeInput['documents'];
  readonly steps: readonly StepDraft[];
  readonly stages: ChangeRequestTypeInput['blocks']['stages'];
  readonly taskKeys: readonly string[];
  readonly updates: ChangeRequestTypeInput['updates'];
}

let counter = 0;
export const newUid = () => {
  counter += 1;
  return `step-${counter}`;
};

/** A blank step for the person to fill in. */
export const blankStep = (title: string, roleKey: string): StepDraft => ({
  uid: newUid(),
  title,
  roleKey,
  durationDays: 3,
  waitingParty: 'discom',
  captures: [],
});

/** The form, from a saved type or empty for a new one. */
export function draftFrom(type: ChangeRequestTypeSetting | null): ChangeTypeDraft {
  return {
    title: type?.title ?? '',
    description: type?.description ?? '',
    active: type?.active ?? true,
    fields: Object.fromEntries((type?.fields ?? []).map((field) => [field.key, field.required])),
    documents: type?.documents ?? [],
    steps: (type?.steps ?? []).map((step) => ({ ...step, uid: newUid() })),
    stages: type?.blocks.stages ?? [],
    taskKeys: type?.blocks.taskKeys ?? [],
    updates: type?.updates ?? [],
  };
}

/** What the API takes; field order follows the named list. */
export function bodyFrom(
  draft: ChangeTypeDraft,
  order: readonly ChangeRequestInputKey[],
): ChangeRequestTypeInput {
  return {
    title: draft.title,
    description: draft.description,
    active: draft.active,
    fields: order
      .filter((key) => draft.fields[key] !== undefined)
      .map((key) => ({ key, required: draft.fields[key] === true })),
    documents: [...draft.documents],
    steps: draft.steps.map(({ uid: _uid, ...step }) => ({ ...step, captures: [...step.captures] })),
    blocks: { stages: [...draft.stages], taskKeys: [...draft.taskKeys] },
    updates: [...draft.updates],
  };
}

/** Toggles a value in a list, keeping the list's own order. */
export function toggled<T>(list: readonly T[], value: T, on: boolean, order: readonly T[]): T[] {
  const next = on ? [...list, value] : list.filter((item) => item !== value);
  return order.filter((item) => next.includes(item));
}
