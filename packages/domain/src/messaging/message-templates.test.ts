import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MESSAGE_TEMPLATES,
  FOLLOW_UP_MAX,
  followUpText,
  renderTemplate,
} from './message-templates';

describe('message templates', () => {
  it('fills placeholders in field order', () => {
    expect(
      renderTemplate('Hi {{1}}, {{2}} on {{3}}.', ['customer', 'milestone', 'project'], {
        customer: 'Asha',
        milestone: 'Installation done',
        project: 'OH-2026-001',
      }),
    ).toBe('Hi Asha, Installation done on OH-2026-001.');
  });

  it('leaves a placeholder without a value as it is', () => {
    expect(renderTemplate('{{1}} {{2}}', ['a'], { a: 'x' })).toBe('x {{2}}');
  });

  it('uses every field in each default preview', () => {
    for (const template of DEFAULT_MESSAGE_TEMPLATES) {
      const count = (template.preview.match(/\{\{\d+\}\}/g) ?? []).length;
      expect(count, template.key).toBe(template.fields.length);
    }
  });
});

describe('follow-up text', () => {
  it('keeps a staff message on one tidy line', () => {
    expect(followUpText('  Hello,\n\nyour meter   is fitted.\tCall us.  ')).toBe(
      'Hello, your meter is fitted. Call us.',
    );
  });

  it('cuts a long message with an ellipsis', () => {
    const text = followUpText('a'.repeat(FOLLOW_UP_MAX + 50));
    expect(text).toHaveLength(FOLLOW_UP_MAX);
    expect(text.endsWith('…')).toBe(true);
  });
});
