import { describe, expect, it } from 'vitest';
import {
  CALLBACK_SLOTS,
  callbackWhen,
  pinDecision,
  rightsFor,
  type SendPlace,
  sendActionsFor,
} from './send-to-customer';

const place = (over: Partial<SendPlace>): SendPlace => ({
  customer: true,
  project: false,
  lead: false,
  task: false,
  ...over,
});

describe('sendActionsFor', () => {
  it('a customer-level place offers the customer-level actions only', () => {
    const actions = sendActionsFor(place({}));
    expect(actions).toEqual([
      'ask_location',
      'send_document',
      'payment_reminder',
      'send_receipt',
      'ask_payment_proof',
      'ask_callback',
    ]);
  });

  it('project-only actions are hidden on a lead', () => {
    const actions = sendActionsFor(place({ lead: true }));
    expect(actions).toEqual(['ask_paper', 'ask_location', 'send_document', 'ask_callback']);
  });

  it('a project adds papers and the crew; a task adds the delay notice', () => {
    const project = sendActionsFor(place({ project: true }));
    expect(project).toContain('ask_paper');
    expect(project).toContain('share_crew');
    expect(project).not.toContain('delay_notice');
    expect(sendActionsFor(place({ project: true, task: true }))).toContain('delay_notice');
  });

  it('offers nothing without a customer', () => {
    expect(sendActionsFor(place({ customer: false, lead: true }))).toEqual([]);
  });
});

describe('rightsFor', () => {
  it('names the rights that allow each action', () => {
    expect(rightsFor('ask_paper')).toEqual(['documents.upload', 'documents.manage']);
    expect(rightsFor('ask_location')).toContain('customers.manage');
    expect(rightsFor('payment_reminder')).toContain('finance.record_payments');
  });
});

describe('pinDecision', () => {
  const here = { latitude: 17.32, longitude: 74.62 };
  it('saves a pin on a home with no location', () => {
    expect(pinDecision(null, here)).toBe('save');
  });
  it('keeps a surveyor point and offers the pin as a suggestion', () => {
    expect(pinDecision({ latitude: 17.4, longitude: 74.7 }, here)).toBe('suggest');
  });
  it('the same spot changes nothing', () => {
    expect(pinDecision({ latitude: 17.32, longitude: 74.62 }, here)).toBe('same');
  });
});

describe('CALLBACK_SLOTS', () => {
  it('has three times of day', () => {
    expect(CALLBACK_SLOTS).toEqual(['morning', 'afternoon', 'evening']);
  });
});

describe('callbackWhen', () => {
  it('a slot still ahead is today, one that has started is tomorrow', () => {
    expect(callbackWhen('afternoon', '11:30')).toEqual({ time: '14:00', nextDay: false });
    expect(callbackWhen('morning', '11:30')).toEqual({ time: '10:00', nextDay: true });
    expect(callbackWhen('evening', '17:30')).toEqual({ time: '17:30', nextDay: true });
  });
});
