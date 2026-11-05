import { describe, expect, it } from 'vitest';
import { DEFAULT_MESSAGE_TEMPLATES } from './message-templates';
import { SEND_TEMPLATE_WORDS } from './send-template-words';
import { templateIsOn } from './send-templates';
import {
  CALLBACK_SLOTS,
  callbackWhen,
  pinDecision,
  rightsFor,
  rightsForAsk,
  type SendPlace,
  sendActionsFor,
  slotReplacesFollowUp,
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
    expect(actions).toEqual([
      'ask_paper',
      'ask_location',
      'send_document',
      'ask_callback',
      'ask_visit',
    ]);
  });

  it('a service request offers only a visit ask and a call back', () => {
    expect(sendActionsFor(place({ service: true }))).toEqual(['ask_visit', 'ask_callback']);
    expect(sendActionsFor(place({ customer: true }))).not.toContain('ask_visit');
  });

  it('a project adds papers and the crew; a task adds the delay notice', () => {
    const project = sendActionsFor(place({ project: true }));
    expect(project).toContain('ask_paper');
    expect(project).toContain('share_crew');
    expect(project).not.toContain('delay_notice');
    expect(sendActionsFor(place({ project: true, task: true }))).toContain('delay_notice');
  });

  it('the journey steps (signature, roof, installation, pack) fit a project or a task, never a lead alone', () => {
    const journey = [
      'send_signature',
      'ask_site_ready',
      'ask_installation_check',
      'send_handover_pack',
    ];
    for (const action of journey) {
      expect(sendActionsFor(place({ project: true }))).toContain(action);
      expect(sendActionsFor(place({ project: true, task: true }))).toContain(action);
      expect(sendActionsFor(place({ lead: true }))).not.toContain(action);
      expect(sendActionsFor(place({}))).not.toContain(action);
    }
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

describe('rights of the journey steps', () => {
  it('a paper to sign follows the documents rights; the questions and the pack the project rights', () => {
    expect(rightsFor('send_signature')).toEqual(['documents.upload', 'documents.manage']);
    expect(rightsFor('ask_site_ready')).toEqual(['projects.manage']);
    expect(rightsFor('send_handover_pack')).toContain('projects.manage');
    expect(rightsForAsk('signature')).toEqual(rightsFor('send_signature'));
    expect(rightsForAsk('confirm')).toEqual(rightsFor('ask_installation_check'));
  });

  it('every new template has Marathi and Hindi words and button titles of 20 characters at most', () => {
    for (const key of [
      'signature_request',
      'site_ready_check',
      'installation_check',
      'handover_pack',
      'signature_reminder',
      'signed_page_reminder',
      'site_ready_reminder',
    ]) {
      const words = SEND_TEMPLATE_WORDS[key];
      expect(words, key).toBeDefined();
      for (const language of ['en', 'mr', 'hi'] as const)
        for (const title of words?.buttons[language] ?? [])
          expect(title.length, `${key} ${language}`).toBeLessThanOrEqual(20);
    }
  });
});

describe('the subsidy, bank and layout steps', () => {
  it('fit a project or a task, never a lead alone, and follow the project rights', () => {
    const steps = ['ask_subsidy_register', 'ask_subsidy_credit', 'ask_bank_sign', 'send_layout'];
    for (const action of steps) {
      expect(sendActionsFor(place({ project: true }))).toContain(action);
      expect(sendActionsFor(place({ task: true }))).toContain(action);
      expect(sendActionsFor(place({ lead: true }))).not.toContain(action);
    }
    expect(rightsFor('ask_subsidy_credit')).toEqual(['projects.manage']);
    expect(rightsFor('send_layout')).toContain('documents.manage');
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

describe('SEND_TEMPLATE_WORDS', () => {
  it('uses every field of its template and keeps buttons within 25 characters', () => {
    for (const [key, words] of Object.entries(SEND_TEMPLATE_WORDS)) {
      const template = DEFAULT_MESSAGE_TEMPLATES.find((one) => one.key === key);
      expect(template, key).toBeDefined();
      for (const text of [words.mr, words.hi])
        expect((text.match(/\{\{\d+\}\}/g) ?? []).length, key).toBe(template?.fields.length);
      for (const titles of Object.values(words.buttons))
        for (const title of titles) expect(title.length, `${key} ${title}`).toBeLessThanOrEqual(25);
    }
  });
});

describe('rightsForAsk', () => {
  it('cancelling or checking an ask needs the rights of sending it', () => {
    expect(rightsForAsk('paper')).toEqual(['documents.upload', 'documents.manage']);
    expect(rightsForAsk('location')).toEqual(rightsFor('ask_location'));
    expect(rightsForAsk('pay')).toEqual(rightsFor('payment_reminder'));
    expect(rightsForAsk('callback')).toEqual(rightsFor('ask_callback'));
  });
});

describe('slotReplacesFollowUp', () => {
  const now = { on: '2026-11-05', time: '11:00' };
  const slot = { on: '2026-11-05', time: '14:00' };
  it('sets an empty follow-up and replaces a later one', () => {
    expect(slotReplacesFollowUp(null, slot, now)).toBe(true);
    expect(slotReplacesFollowUp({ on: null, time: null }, slot, now)).toBe(true);
    expect(slotReplacesFollowUp({ on: '2026-11-06', time: '09:00' }, slot, now)).toBe(true);
  });
  it('keeps a sooner plan, comparing times and not text', () => {
    expect(slotReplacesFollowUp({ on: '2026-11-05', time: '12:00' }, slot, now)).toBe(false);
    expect(
      slotReplacesFollowUp({ on: '2026-11-05', time: '9:30' }, slot, {
        on: '2026-11-05',
        time: '08:00',
      }),
    ).toBe(false);
    expect(slotReplacesFollowUp({ on: '2026-11-05', time: '15:00' }, slot, now)).toBe(true);
  });
  it('an overdue plan blocks nothing', () => {
    expect(slotReplacesFollowUp({ on: '2026-11-03', time: null }, slot, now)).toBe(true);
    expect(slotReplacesFollowUp({ on: '2026-11-05', time: '08:00' }, slot, now)).toBe(true);
  });
});

describe('templateIsOn', () => {
  it('a row decides; with no row only the unapproved Send to customer templates are off', () => {
    expect(templateIsOn('location_request', { active: true })).toBe(true);
    expect(templateIsOn('payment_received', { active: false })).toBe(false);
    expect(templateIsOn('location_request', undefined)).toBe(false);
    expect(templateIsOn('payment_received', null)).toBe(true);
  });
});
