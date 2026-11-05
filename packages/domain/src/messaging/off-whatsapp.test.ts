import { describe, expect, it } from 'vitest';
import { channelOf, inPersonTask, offWhatsAppPathForTemplate, sendPath } from './off-whatsapp';
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
    for (const key of ['visit_reminder', 'signature_reminder', 'site_ready_reminder'])
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
