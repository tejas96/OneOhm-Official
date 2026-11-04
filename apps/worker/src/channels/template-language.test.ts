import { describe, expect, it } from 'vitest';
import { approvedMessage, MissingFieldError, sentInTag, templateFor } from './message-templates';

const names = { metaName: 'project_milestone', language: 'en', metaNameMr: 'project_milestone_mr' };

describe('templateFor', () => {
  it('sends the Marathi template to a Marathi customer when it is set up', () => {
    expect(templateFor(names, 'mr-IN')).toEqual({
      name: 'project_milestone_mr',
      language: 'mr',
      local: true,
    });
  });

  it('falls back to English when the language has no template', () => {
    expect(templateFor(names, 'hi-IN')).toEqual({
      name: 'project_milestone',
      language: 'en',
      local: false,
    });
    expect(templateFor({ ...names, metaNameHi: '' }, 'hi-IN').local).toBe(false);
    expect(templateFor(names, undefined).name).toBe('project_milestone');
  });

  it('keeps English for English customers', () => {
    expect(templateFor(names, 'en-IN')).toEqual({
      name: 'project_milestone',
      language: 'en',
      local: false,
    });
  });
});

describe('sentInTag', () => {
  // Staff read English: the chat history keeps the English words and says what went out.
  it('tags a template that went in Marathi or Hindi, nothing for English', () => {
    expect(sentInTag(names, 'mr-IN')).toBe(' · sent in Marathi');
    expect(sentInTag({ ...names, metaNameHi: 'project_milestone_hi' }, 'hi-IN')).toBe(
      ' · sent in Hindi',
    );
    expect(sentInTag(names, 'hi-IN')).toBe('');
    expect(sentInTag(names, 'en-IN')).toBe('');
  });
});

describe('approvedMessage', () => {
  it('fills a Marathi template with the step name in Marathi', () => {
    const sent = approvedMessage('project_milestone', ['customer', 'milestone'], names, {
      customer: 'Ramesh',
      milestone: 'Net meter fitted',
      step: 'net_meter_installation',
      language: 'mr-IN',
    });
    expect(sent).toEqual({
      name: 'project_milestone_mr',
      language: 'mr',
      parameters: ['Ramesh', 'नेट मीटर बसवला'],
    });
  });

  it('keeps the English words in the English template', () => {
    const sent = approvedMessage('project_milestone', ['milestone'], names, {
      milestone: 'Net meter fitted',
      step: 'net_meter_installation',
      language: 'hi-IN',
    });
    expect(sent.parameters).toEqual(['Net meter fitted']);
  });

  describe('extras', () => {
    const quote = { metaName: 'quotation_sent', language: 'en' };
    const payload = {
      customer: 'Ramesh',
      number: 'Q-1',
      total: '1',
      subsidy: '2',
      effective: '3',
      documentUrl: 'https://x/q.pdf',
      documentName: 'Quotation.pdf',
      acceptPayload: 'quote:accept:1',
      askPayload: 'quote:ask:1',
    };
    const fields = ['customer', 'number', 'total', 'subsidy', 'effective'];

    it('adds header and buttons only when extrasApproved', () => {
      const on = approvedMessage('quotation_sent', fields, quote, payload, true);
      expect(on.header).toEqual({
        kind: 'document',
        link: 'https://x/q.pdf',
        filename: 'Quotation.pdf',
      });
      expect(on.buttons).toHaveLength(2);
      const off = approvedMessage('quotation_sent', fields, quote, payload, false);
      expect(off.header).toBeUndefined();
      expect(off.buttons).toBeUndefined();
    });

    it('throws MissingFieldError when extras are on but documentUrl is missing', () => {
      const { documentUrl: _omitted, ...rest } = payload;
      expect(() => approvedMessage('quotation_sent', fields, quote, rest, true)).toThrow(
        MissingFieldError,
      );
    });

    it('numbers quick replies in order and puts the URL button after them', () => {
      const on = approvedMessage('quotation_sent', fields, quote, payload, true);
      expect(on.buttons).toEqual([
        { kind: 'quick_reply', index: 0, payload: 'quote:accept:1' },
        { kind: 'quick_reply', index: 1, payload: 'quote:ask:1' },
      ]);
      const pay = approvedMessage(
        'payment_link',
        ['customer'],
        { metaName: 'payment_link', language: 'en' },
        { customer: 'R', payToken: 'tok', paidPayload: 'paidother:m1' },
        true,
      );
      // The newer quick reply has its own switch: off, the link button stays at position 0.
      expect(pay.buttons).toEqual([{ kind: 'url', index: 0, suffix: 'tok' }]);
      expect(pay.header).toBeUndefined();
    });
  });
});
