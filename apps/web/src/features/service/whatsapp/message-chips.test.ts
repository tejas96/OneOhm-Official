import { describe, expect, it } from 'vitest';
import { formLinkTarget, splitChips } from './message-chips';

describe('splitChips', () => {
  it('takes the final bracket group of buttons as chips', () => {
    expect(splitChips('buttons', 'Pay now?\n[Pay · Later]')).toEqual({
      text: 'Pay now?',
      chips: ['Pay', 'Later'],
    });
  });
  it('shows a form message button as one chip', () => {
    expect(splitChips('flow', 'Tell us\n[अडचण सांगा]')).toEqual({
      text: 'Tell us',
      chips: ['अडचण सांगा'],
    });
  });
  it('leaves earlier brackets and other kinds alone', () => {
    expect(splitChips('buttons', 'See [this] first\n[Yes]')).toEqual({
      text: 'See [this] first',
      chips: ['Yes'],
    });
    expect(splitChips('text', 'Hello\n[Yes]')).toEqual({ text: 'Hello\n[Yes]', chips: [] });
    expect(splitChips('document', 'Here\n[file.pdf]').chips).toEqual([]);
    expect(splitChips('buttons', 'No buttons').chips).toEqual([]);
  });
});

describe('formLinkTarget', () => {
  it('opens a ticket, a lead and a customer on their screens', () => {
    expect(formLinkTarget({ kind: 'service_request', id: 'a' }).href).toBe('/service?request=a');
    expect(formLinkTarget({ kind: 'lead', id: 'b' }).href).toBe('/leads/b');
    expect(formLinkTarget({ kind: 'customer', id: 'c' }).href).toBe('/customers/c');
  });
});
