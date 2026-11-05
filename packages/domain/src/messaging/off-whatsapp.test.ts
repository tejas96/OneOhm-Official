import { describe, expect, it } from 'vitest';
import {
  channelOf,
  inPersonTask,
  offWhatsAppPathForTemplate,
  sendPath,
  smsCanStandIn,
} from './off-whatsapp';
import { inPersonClose } from './off-whatsapp-close';
import { inPersonLine } from './off-whatsapp-tasks';
import { SEND_ACTIONS } from './send-to-customer';

describe('the path of a send for a customer not on WhatsApp', () => {
  it('goes by WhatsApp when the customer is on it', () => {
    for (const action of SEND_ACTIONS) expect(sendPath(action, 'whatsapp')).toBe('whatsapp');
  });

  it('papers and ratings are an SMS text, payment an SMS pay link', () => {
    expect(sendPath('ask_paper', 'sms')).toBe('sms_text');
    expect(sendPath('ask_rating', 'sms')).toBe('sms_text');
    expect(sendPath('payment_reminder', 'sms')).toBe('sms_pay_link');
  });

  it('location, survey, visit, signature, confirmations and payouts are done in person', () => {
    for (const action of [
      'ask_location',
      'self_survey',
      'ask_visit',
      'send_signature',
      'ask_site_ready',
      'ask_installation_check',
      'ask_subsidy_register',
      'ask_subsidy_credit',
      'ask_bank_sign',
      'ask_callback',
      'ask_upi',
      'ask_payment_proof',
      'amc_renewal',
    ] as const)
      expect(sendPath(action, 'sms'), action).toBe('in_person');
  });

  it('a customer on neither is reached in person for every action', () => {
    for (const action of SEND_ACTIONS) expect(sendPath(action, 'in_person')).toBe('in_person');
  });

  it('every action has a defined path and records its channel', () => {
    for (const action of SEND_ACTIONS)
      expect(['sms', 'in_person']).toContain(channelOf(sendPath(action, 'sms')));
  });
});

describe('what an automatic message becomes for a customer not on WhatsApp', () => {
  it('marketing is never sent, a chat reminder is skipped, a first chat ask is a task', () => {
    for (const key of ['self_survey_offer', 'self_survey_reminder', 'amc_renewal_offer'])
      expect(offWhatsAppPathForTemplate(key)).toBe('never');
    for (const key of ['signature_reminder', 'signed_page_reminder', 'site_ready_reminder'])
      expect(offWhatsAppPathForTemplate(key)).toBe('skip');
    for (const key of ['location_request', 'visit_pick', 'callback_request', 'reward_upi_ask'])
      expect(offWhatsAppPathForTemplate(key)).toBe('in_person');
  });

  it('papers, ratings, the fixed check and payments keep their SMS text', () => {
    for (const key of [
      'paper_request',
      'stage_rating_request',
      'problem_fixed_check',
      'payment_due',
    ])
      expect(offWhatsAppPathForTemplate(key)).toBe('sms');
  });

  it('the task names the customer and the ask', () => {
    expect(inPersonTask('Asha', 'Share your location')).toEqual({
      title: 'Do in person: Share your location',
      body: 'Asha is not on WhatsApp: Share your location with them in person.',
    });
  });
});

describe('presence, reminders and staff words', () => {
  it('a DISCOM presence date is a task; the visit reminder is an SMS', () => {
    expect(offWhatsAppPathForTemplate('inspection_presence')).toBe('in_person');
    expect(offWhatsAppPathForTemplate('visit_reminder')).toBe('sms');
  });

  it('the task is in staff words', () => {
    expect(inPersonLine('location_request', 'Asha', { home: 'Baner' })?.title).toBe(
      'Ask Asha in person for the location of Baner',
    );
    expect(inPersonLine('payment_due', 'Asha', {})).toBeNull();
  });

  it('only plain asks close with one tap; a payment says what to do instead', () => {
    expect(inPersonClose('location', null)).toEqual({ how: 'plain' });
    expect(inPersonClose('confirm', 'site_ready')).toEqual({ how: 'confirm', kind: 'site_ready' });
    expect(inPersonClose('pay', null).how).toBe('hint');
    expect(inPersonClose('signature', null).how).toBe('hint');
  });

  it('a staff message never stands in by SMS', () => {
    expect(smsCanStandIn('payment_reminder')).toBe(true);
    expect(smsCanStandIn('staff_daily_digest')).toBe(false);
  });
});
