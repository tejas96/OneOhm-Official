import { DEFAULT_MESSAGE_TEMPLATES } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { customerNotice } from './customer-message';
import { localAlertTitle, localValues, localWords, SOME_HOME } from './customer-message-words';

const payload = {
  customer: 'Ramesh',
  project: 'OH-2026-001',
  amount: '₹40,000',
  milestone: 'Advance on order confirmation',
  number: 'Q-1',
  total: '₹2,00,000',
  effective: '₹1,22,000',
  capacity: '3 kWp',
  topic: 'panel cleaning',
  status: 'being worked on',
  request: 'Name change',
  document: 'Electricity bill',
  visit: 'cleaning',
  date: 'Tue, 4 Nov',
  friend: 'Anil',
};

describe('in-app alerts in the customer’s language (PRD 5.1)', () => {
  const customerMessages = DEFAULT_MESSAGE_TEMPLATES.filter((t) => t.audience === 'customer');

  it('has Marathi and Hindi words for every customer alert that has English words', () => {
    for (const { key } of customerMessages) {
      const english = customerNotice(key, payload, 'k');
      for (const language of ['mr-IN', 'hi-IN']) {
        const local = customerNotice(key, payload, 'k', language);
        expect(local === null, `${key} ${language}`).toBe(english === null);
        if (english && local) expect(local.title, `${key} ${language}`).not.toBe(english.title);
      }
    }
  });

  it('keeps English for English, unknown languages and messages without app words', () => {
    expect(localWords('en-IN', 'payment_received')).toBeUndefined();
    expect(localWords(undefined, 'payment_received')).toBeUndefined();
    expect(localWords('mr-IN', 'staff_daily_digest')).toBeUndefined();
    expect(customerNotice('payment_received', payload, 'k', 'ta-IN')?.title).toBe(
      'Payment received',
    );
  });

  it('says OneOhm’s own names in the language, and keeps numbers and codes as they are', () => {
    const paid = customerNotice('payment_received', payload, 'k', 'mr-IN');
    expect(paid?.title).toBe('पेमेंट मिळाले');
    expect(paid?.body).toBe('₹40,000 मिळाले — ऑर्डर पक्की झाल्यावर ॲडव्हान्स. धन्यवाद!');
    const service = customerNotice('service_update', payload, 'k', 'hi-IN');
    expect(service?.body).toBe('पैनल की सफ़ाई: काम चल रहा है।');
    const step = customerNotice(
      'project_milestone',
      { ...payload, milestone: 'Net meter fitted', step: 'net_meter_installation' },
      'k',
      'mr-IN',
    );
    expect(step).toMatchObject({ title: 'नेट मीटर बसवला', body: 'OH-2026-001' });
  });

  it('leaves names the team typed as they are', () => {
    const custom = { ...payload, milestone: 'Second instalment', topic: 'meter shifting' };
    expect(customerNotice('payment_reminder', custom, 'k', 'hi-IN')?.body).toBe(
      '₹40,000 — Second instalment, OH-2026-001।',
    );
    expect(customerNotice('service_update', custom, 'k', 'mr-IN')?.body).toBe(
      'meter shifting: काम सुरू आहे.',
    );
  });

  it('says where a referral reward stands, with the reason when it was not approved', () => {
    const say = (status: string) =>
      customerNotice('referral_reward', { ...payload, status }, 'k', 'mr-IN')?.body;
    expect(say('earned and waiting for approval')).toBe(
      'Anil: ₹40,000 — मिळाले, मंजुरीची वाट पाहत आहोत.',
    );
    expect(say('paid by UPI on 4 Nov')).toBe('Anil: ₹40,000 — तुम्हाला दिले.');
    expect(say('not approved (duplicate lead)')).toBe(
      'Anil: ₹40,000 — मंजूर झाले नाही (duplicate lead).',
    );
  });

  it('titles app-only alerts in the language, and leaves English to the caller', () => {
    expect(localAlertTitle('stage_rating_reply', 'mr-IN')).toBe('आम्ही तुमच्या अभिप्रायाला उत्तर दिले');
    expect(localAlertTitle('stage_rating_reply', 'hi-IN')).toBe('हमने आपकी राय का जवाब दिया');
    expect(localAlertTitle('stage_rating_reply', 'en-IN')).toBeUndefined();
  });
});

describe('WhatsApp values for a Marathi or Hindi template (PRD 6.2)', () => {
  it('says OneOhm’s own step names in the customer’s language, and leaves English alone', () => {
    const values = { ...payload, milestone: 'Net meter fitted', step: 'net_meter_installation' };
    expect(localValues('mr-IN', 'project_milestone', values).milestone).toBe('नेट मीटर बसवला');
    expect(localValues('en-IN', 'project_milestone', values)).toBe(values);
    expect(localValues('hi-IN', 'project_milestone', values).customer).toBe('Ramesh');
  });
});

describe('contact_changed in Marathi and Hindi', () => {
  const told = (subjectKind: string) => ({
    customer: 'Ramesh',
    staff: 'Priya',
    subject: subjectKind === 'project' ? 'your solar project (Pune · 3 kW)' : 'your solar enquiry',
    subjectKind,
    ...(subjectKind === 'project' ? { projectWords: 'Pune · 3 kW' } : {}),
    phone: '+91 98000 00000',
  });

  it.each(['mr-IN', 'hi-IN'])('%s says what the contact looks after with no English', (lang) => {
    for (const kind of ['project', 'service', 'enquiry']) {
      const alert = localWords(lang, 'contact_changed')?.(told(kind));
      const values = localValues(lang, 'contact_changed', told(kind));
      for (const text of [alert?.body ?? '', values.subject ?? '']) {
        expect(text, `${lang} ${kind}`).not.toMatch(/your|solar|project|service|enquiry/i);
      }
    }
    expect(localValues(lang, 'contact_changed', told('project')).subject).toContain('Pune · 3 kW');
  });

  it('keeps the English subject for the English template', () => {
    expect(localValues('en-IN', 'contact_changed', told('project')).subject).toBe(
      'your solar project (Pune · 3 kW)',
    );
  });

  it('says a paper with no home as “your home” in the language', () => {
    const paper = { customer: 'Ramesh', document: 'Electricity bill', home: SOME_HOME };
    expect(localValues('mr-IN', 'paper_request', paper).home).toBe('तुमच्या घरी');
    expect(localValues('hi-IN', 'paper_request', paper).home).toBe('आपके घर');
    expect(localValues('en-IN', 'paper_request', paper).home).toBe('your home');
    expect(customerNotice('paper_request', paper, 'k', 'hi-IN')?.body).toContain('आपके घर पर');
  });
});
