import { describe, expect, it } from 'vitest';
import { DEFAULT_TASK_LIBRARY } from '../tasks/task-library';
import {
  CUSTOMER_STEP_TITLES,
  isOutsideParty,
  readTaskAttachment,
  STEP_MESSAGE_DEFAULTS,
  writeTaskAttachment,
} from './customer-steps';
import { DEFAULT_MESSAGE_TEMPLATES } from './message-templates';

describe('customer steps (PRD 5.2, 6.2)', () => {
  it('names every step that messages or shows to customers in their words', () => {
    const shown = DEFAULT_TASK_LIBRARY.filter(
      (step) => step.notifyCustomer || step.customerVisible,
    );
    for (const step of shown) expect(CUSTOMER_STEP_TITLES[step.key], step.key).toBeTruthy();
  });

  it('never sends a customer message from an internal step', () => {
    for (const step of DEFAULT_TASK_LIBRARY)
      if (step.notifyCustomer) expect(step.customerVisible, step.key).toBe(true);
  });

  it('uses only messages that exist, filled from task fields', () => {
    const keys = new Set<string>(DEFAULT_MESSAGE_TEMPLATES.map((template) => template.key));
    for (const [step, defaults] of Object.entries(STEP_MESSAGE_DEFAULTS))
      expect(keys.has(defaults.messageKey), step).toBe(true);
  });

  it('reads and writes a report or folder link', () => {
    expect(readTaskAttachment('report:wcr')).toEqual({ kind: 'report', key: 'wcr' });
    expect(readTaskAttachment('document:product_manual')).toEqual({
      kind: 'document',
      category: 'product_manual',
    });
    expect(writeTaskAttachment({ kind: 'report', key: 'annexure-proforma-a' })).toBe(
      'report:annexure-proforma-a',
    );
    expect(readTaskAttachment('photo:roof')).toBeNull();
    expect(readTaskAttachment('report:')).toBeNull();
    expect(readTaskAttachment(null)).toBeNull();
  });

  it('tells the customer only about waits on someone outside OneOhm', () => {
    expect(isOutsideParty('discom')).toBe(true);
    expect(isOutsideParty('customer')).toBe(true);
    expect(isOutsideParty('internal')).toBe(false);
  });
});
