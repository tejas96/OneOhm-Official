import type { MessageTemplate } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { taskMessageChoices } from './task-message-choices';

const message = (key: string, extra: Partial<MessageTemplate> = {}) =>
  ({
    key,
    audience: 'customer',
    fields: ['customer', 'project'],
    active: true,
    ...extra,
  }) as MessageTemplate;

describe('taskMessageChoices', () => {
  it('leaves out messages that are turned off', () => {
    const choices = taskMessageChoices([message('on'), message('off', { active: false })], 'on');
    expect(choices).toEqual([{ key: 'on', off: false }]);
  });

  it('keeps the chosen message even when it is turned off, marked off', () => {
    const choices = taskMessageChoices([message('on'), message('off', { active: false })], 'off');
    expect(choices).toEqual([
      { key: 'on', off: false },
      { key: 'off', off: true },
    ]);
  });

  it('leaves out staff messages and ones a task cannot fill', () => {
    const choices = taskMessageChoices(
      [message('staff', { audience: 'staff' }), message('odd', { fields: ['amount'] })],
      'x',
    );
    expect(choices).toEqual([]);
  });
});
