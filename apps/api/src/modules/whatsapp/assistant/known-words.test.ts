import { describe, expect, it } from 'vitest';
import { choiceOfTap, isChoiceTap, OLD_MENU_IDS_UNTIL } from './chat-choices';
import { knownChoice, scriptLanguage, smallTalkOf } from './known-words';

describe('small talk (redesign §14)', () => {
  it('knows ok, thanks, done, 👍 and greetings of the day in three languages', () => {
    const cases: [string, string][] = [
      ['ok', 'ok'],
      ['Okay.', 'ok'],
      ['okk', 'ok'],
      ['Done!', 'ok'],
      ['thanks', 'thanks'],
      ['Thank you!!', 'thanks'],
      ['Thanks 🙏', 'thanks'],
      ['thank you so much', 'thanks'],
      ['धन्यवाद', 'thanks'],
      ['शुक्रिया', 'thanks'],
      ['ठीक आहे', 'ok'],
      ['ठीक है।', 'ok'],
      ['हो गया', 'ok'],
      ['👍', 'ok'],
      ['👍🏽🙏', 'thanks'],
      ['😊 😊', 'ok'],
      ['Good morning', 'morning'],
      ['good night!', 'night'],
      ['शुभ सकाळ', 'morning'],
      ['सुप्रभात', 'morning'],
      ['शुभ रात्रि', 'night'],
    ];
    for (const [text, kind] of cases) expect(smallTalkOf(text), text).toBe(kind);
  });

  it('is never a question or a problem', () => {
    for (const text of ['ok when will you come', 'thanks, the inverter is off', '5', '', 'yes'])
      expect(smallTalkOf(text), text).toBeNull();
  });
});

describe('known words (principles §7: rules only)', () => {
  it('finds the answer by a word anywhere in the message, in three languages', () => {
    const cases: [string, string][] = [
      ['When will you come?', 'update'],
      ['kab aayenge', 'update'],
      ['तुम्ही केव्हा येणार?', 'update'],
      ['काम कब होगा', 'update'],
      ['what is the status', 'update'],
      ['subsidy kab milegi', 'update'],
      ['How much is left to pay?', 'payments'],
      ['kitna baki hai', 'payments'],
      ['अजून किती पैसे?', 'payments'],
      ['payment due', 'payments'],
      ['send my receipt', 'documents'],
      ['bill', 'bill'],
      ['send my light bill', 'bill'],
      ['Send bill photo', 'sendbill'],
      ['Our invoice', 'invoices'],
      ['बिलाचा फोटो पाठवा', 'sendbill'],
      ['हमारा इनवॉइस', 'invoices'],
      ['I have a problem with the inverter', 'problem'],
      ['complaint', 'problem'],
      ['warranty card', 'warranty'],
      ['my rewards', 'rewards'],
      ['Project update', 'update'],
      ['My problems', 'problems'],
      ['प्रकल्प अपडेट', 'update'],
      ['help', 'talk'],
      ['language', 'language'],
    ];
    for (const [text, choice] of cases) expect(knownChoice(text), text).toBe(choice);
  });

  it('knows nothing it was not taught', () => {
    for (const text of ['Is the price the same as last week?', 'xyz', 'yes', '1'])
      expect(knownChoice(text), text).toBeUndefined();
  });
});

describe('Marathi or Hindi in Devanagari', () => {
  it('tells them apart by the words only one uses', () => {
    expect(scriptLanguage('माझे पेमेंट किती बाकी आहे?')).toBe('mr');
    expect(scriptLanguage('मेरा पेमेंट कितना बाकी है?')).toBe('hi');
    expect(scriptLanguage('पेमेंट')).toBe('unclear');
    expect(scriptLanguage('payment kitna hai')).toBeNull();
  });
});

describe('old menu ids (decision 8)', () => {
  it('keep working for 30 days, mapped to the new answers', () => {
    expect(OLD_MENU_IDS_UNTIL).toBe('2026-12-04');
    const old: Record<string, string> = {
      progress: 'update',
      payments: 'payments',
      documents: 'documents',
      service: 'problem',
      requests: 'problems',
      warranty: 'warranty',
      refer: 'refer',
      rewards: 'rewards',
      feedback: 'feedback',
      human: 'talk',
    };
    for (const [id, choice] of Object.entries(old)) expect(choiceOfTap(id), id).toBe(choice);
    expect(choiceOfTap('go:more')).toBe('more');
    expect(isChoiceTap('pay:0b6f2f9e-6c1a-4f43-9d55-3f3c2a1b7e10')).toBe(true);
    expect(isChoiceTap('lang:mr')).toBe(true);
    expect(isChoiceTap('lang:fr')).toBe(false);
    expect(isChoiceTap('pay:1')).toBe(false);
  });
});
