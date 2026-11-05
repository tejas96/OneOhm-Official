import { DEFAULT_ONBOARDING, MAX_BILL_BANDS, MAX_SERVICE_CITIES, STEP_ORDER } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { inLanguage } from '../assistant/language';
import type { ChatReply } from '../chat-store';
import { ONBOARD_LISTS } from './onboard-words';
import { question } from './onboarding-replies';

const ids = (reply: ChatReply) =>
  reply.kind === 'list'
    ? reply.rows.map((row) => row.id)
    : reply.kind === 'buttons'
      ? reply.buttons.map((button) => button.id)
      : [];
const titles = (reply: ChatReply) =>
  reply.kind === 'list' ? reply.rows.map((row) => row.title) : [];
const settings = { ...DEFAULT_ONBOARDING, serviceCities: ['Pune', 'Satara'] };
const view = { settings, profileName: 'tejas' };

describe('the first message (live review C10)', () => {
  it('opens with a welcome from OneOhm Solar in all three languages, then the language buttons', () => {
    const first = question('language', view);
    expect(first.kind).toBe('buttons');
    if (first.kind !== 'buttons') return;
    expect(first.body.split('\n')[0]).toBe('Welcome to OneOhm Solar 🙏');
    expect(first.body).toContain('OneOhm सोलरमध्ये आपले स्वागत 🙏');
    expect(first.body).toContain('OneOhm सोलर में आपका स्वागत है 🙏');
    expect(first.buttons.map((button) => button.title)).toEqual(['English', 'मराठी', 'हिंदी']);
  });
});

describe('a Back row on every list after the first question (live review C14)', () => {
  it('sits just above "Talk to a person", in the chat language', async () => {
    for (const step of ['city', 'site', 'bill', 'roof', 'floors'] as const) {
      const offered = ids(question(step, view));
      expect(offered.slice(-2), step).toEqual([`ob:${step}:back`, 'ob:person']);
    }
    const mr = await inLanguage('mr', async () => question('site', view));
    expect(titles(mr).at(-2)).toBe('मागे');
    const hi = await inLanguage('hi', async () => question('roof', view));
    expect(titles(hi).at(-2)).toBe('पीछे');
    expect(ids(question('photo', view))).toEqual(['ob:photo:later', 'ob:photo:back', 'ob:person']);
  });

  it('still fits 10 rows at the most cities and bill bands an owner can set', () => {
    const full = {
      ...DEFAULT_ONBOARDING,
      serviceCities: Array.from({ length: MAX_SERVICE_CITIES }, (_, i) => `City ${i}`),
      billBands: Array.from({ length: MAX_BILL_BANDS }, (_, i) => ({
        id: `b${i}`,
        label: `B${i}`,
        targetWp: 1000,
      })),
    };
    // The city list also holds the 📍 row, so at the most cities Back is the row left out.
    const bill = ids(question('bill', { settings: full, profileName: null }));
    expect(bill).toHaveLength(10);
    expect(bill).toContain('ob:bill:back');
    const city = ids(question('city', { settings: full, profileName: null }));
    expect(city).toHaveLength(10);
    expect(city).toContain('ob:city:pin');
    expect(city.at(-1)).toBe('ob:person');
    // A list saved before the limits were cut still fits: Back is left out, not the rows.
    const old = { ...full, serviceCities: [...full.serviceCities, 'City 7'] };
    const offered = ids(question('city', { settings: old, profileName: null }));
    expect(offered).toHaveLength(10);
    expect(offered).not.toContain('ob:city:back');
  });

  it('is not on the language question', () => {
    expect(ids(question('language', view))).not.toContain('ob:language:back');
    for (const step of STEP_ORDER) expect(ids(question(step, view))).not.toContain('ob:back');
  });
});

describe('bill bands in the chat language (live review C13)', () => {
  it('shows the Marathi or Hindi label when the owner gave one, else the label', async () => {
    const [first, ...rest] = DEFAULT_ONBOARDING.billBands;
    if (!first) throw new Error('defaults changed');
    const bands = [{ ...first, labelMr: '₹1,000 पर्यंत', labelHi: '₹1,000 तक' }, ...rest];
    const translated = { settings: { ...settings, billBands: bands }, profileName: null };
    expect(titles(question('bill', translated))[0]).toBe('Up to ₹1,000');
    const mr = await inLanguage('mr', async () => question('bill', translated));
    expect(titles(mr).slice(0, 2)).toEqual(['₹1,000 पर्यंत', '₹1,000–2,000']);
    const hi = await inLanguage('hi', async () => question('bill', translated));
    expect(titles(hi)[0]).toBe('₹1,000 तक');
  });
});

describe('names and Marathi wording (live review C15)', () => {
  it('writes the WhatsApp name with a capital letter', async () => {
    const reply = await inLanguage('mr', async () => question('name', view));
    expect(reply.kind === 'buttons' && reply.body).toBe('आम्ही तुम्हाला Tejas म्हणू का?');
  });

  it('uses respectful forms for the person who will call', () => {
    expect(ONBOARD_LISTS.mr.willCall('Priya', 'today')).toBe(
      'धन्यवाद. आज Priya यांच्याकडून तुम्हाला कॉल येईल.',
    );
    expect(ONBOARD_LISTS.mr.willCall(null, 'tomorrow')).toBe(
      'धन्यवाद. उद्या सकाळी आमच्या टीमकडून तुम्हाला कॉल येईल.',
    );
    expect(ONBOARD_LISTS.mr.askPhoto).not.toContain('नवीन');
  });
});

describe('files and voice notes (live review C11, C12)', () => {
  it('never calls a file it has not checked "your electricity bill"', () => {
    expect(ONBOARD_LISTS.en.billThanks).toBe('Thank you. File received — our team will check it.');
    for (const words of Object.values(ONBOARD_LISTS))
      expect(words.billThanks).not.toMatch(/bill|बिल/i);
  });

  it('hands a voice note warmly to a named person, in every language', () => {
    for (const [language, words] of Object.entries(ONBOARD_LISTS)) {
      expect(words.videoHandOver('Priya'), language).toContain('Priya');
      expect(words.videoHandOver(null), language).not.toContain('null');
      // A file we cannot read names the button the question actually shows (fix round 1).
      expect(words.notRead, language).toContain(`"${words.talkToPerson}"`);
      expect(words.voiceHandOver('Priya'), language).toContain('Priya');
      expect(words.voiceHandOver(null), language).not.toContain('null');
    }
  });
});

describe('the estimate caption (live review C2, C9)', () => {
  it('says the size in panels and the saving as "up to"', () => {
    const caption = ONBOARD_LISTS.en.estimateCaption(
      '6 panels (3.27 kW)',
      '₹1,83,969',
      '₹1,05,969',
      '₹3,000',
    );
    expect(caption).toContain('6 panels (3.27 kW)');
    expect(caption).toContain('up to ₹3,000 a month');
    for (const words of [ONBOARD_LISTS.mr, ONBOARD_LISTS.hi])
      expect(words.estimateCaption('6 पॅनल (3.27 kW)', 'a', 'b', '₹3,000')).toContain('₹3,000');
  });
});
