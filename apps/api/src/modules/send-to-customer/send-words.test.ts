import { CUSTOMER_STEP_TITLES } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { stageForCustomer } from './send-messages';
import { SEND_LISTS } from './send-words';

describe('send-to-customer words', () => {
  for (const [language, words] of Object.entries(SEND_LISTS)) {
    it(`${language}: every button title keeps 20 characters`, () => {
      for (const [name, title] of Object.entries(words.buttons))
        expect(title.length, `${language} ${name}`).toBeLessThanOrEqual(20);
    });

    it(`${language}: messages fit a WhatsApp body and are not empty`, () => {
      const texts = [
        words.location.ask('Sangli'),
        words.location.saved('Sangli'),
        words.location.checking('Sangli'),
        words.pay.due('₹45,000', 'Sangli'),
        words.pay.askProof('₹45,000', 'Sangli'),
        words.callback.ask('Priya'),
        words.callback.thanks('Priya', words.callback.slots.morning),
        words.crew('Ravi', 'installation', '+919800000001'),
        words.delay('Net meter', 'the electricity board'),
      ];
      for (const text of texts) {
        expect(text.length).toBeGreaterThan(10);
        expect(text.length).toBeLessThanOrEqual(1024);
      }
    });
  }

  it('Marathi and Hindi differ from English', () => {
    expect(SEND_LISTS.mr.location.which).not.toBe(SEND_LISTS.en.location.which);
    expect(SEND_LISTS.hi.buttons.paidOther).not.toBe(SEND_LISTS.en.buttons.paidOther);
  });
});

describe('the step named in a delay notice', () => {
  const none = { stage: null, templateKey: 'made_up_step' };
  it('with no words of its own it is said in the customer language, never English inside Marathi or Hindi', () => {
    expect(stageForCustomer(none, 'en')).toBe('work on your project');
    expect(stageForCustomer(none, 'mr')).toBe('तुमच्या प्रकल्पाचे काम');
    expect(stageForCustomer(none, 'hi')).toBe('आपके प्रोजेक्ट का काम');
  });

  it('a standard step is said in the customer language', () => {
    const net = {
      stage: CUSTOMER_STEP_TITLES.net_meter_installation ?? '',
      templateKey: 'net_meter_installation',
    };
    expect(stageForCustomer(net, 'en')).toBe(net.stage);
    expect(stageForCustomer(net, 'mr')).toBe('नेट मीटर बसवला');
    expect(stageForCustomer(net, 'hi')).not.toBe(net.stage);
  });

  it('a title the owner typed on the task template is kept as typed', () => {
    const own = { stage: 'Your meter paperwork', templateKey: 'net_meter_installation' };
    expect(stageForCustomer(own, 'mr')).toBe('Your meter paperwork');
  });
});
