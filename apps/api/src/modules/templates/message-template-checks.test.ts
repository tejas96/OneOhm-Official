import { describe, expect, it } from 'vitest';
import { checkMessageTemplate } from './message-template-checks';

const preview = 'Hello {{1}}, an update on {{2}}: {{3}}.';

describe('checkMessageTemplate', () => {
  it('accepts the fields the message is sent with, in any order', () => {
    expect(() =>
      checkMessageTemplate('project_milestone', {
        preview,
        fields: ['project', 'customer', 'milestone'],
      }),
    ).not.toThrow();
  });

  it('refuses a field the sender never fills, naming it', () => {
    expect(() =>
      checkMessageTemplate('project_milestone', {
        preview,
        fields: ['customer', 'project', 'amount'],
      }),
    ).toThrow(/amount/);
  });

  it('refuses wording whose placeholders do not match the fields', () => {
    expect(() =>
      checkMessageTemplate('project_milestone', { preview, fields: ['customer', 'project'] }),
    ).toThrow(/do not match/);
  });
});
