import { DEFAULT_ONBOARDING } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { inLanguage } from '../assistant/language';
import { FORMS } from '../forms/form-registry';
import { FORM_LIMITS } from '../forms/form-words';
import { ONBOARDING_FLOW, ONBOARDING_SCREEN, OTHER_CITY_OPTION } from '../forms/onboarding.flow';
import { answersFromForm } from './onboarding-form-answers';
import { ONBOARD_FORM_LISTS, onboardingFormStart } from './onboarding-form-words';

const settings = {
  ...DEFAULT_ONBOARDING,
  serviceCities: ['Pune', 'Satara'],
  billBands: [
    { id: 'low', label: 'Up to ₹1,000', labelMr: 'हजारापर्यंत', targetWp: 1000, maxRupees: 1000 },
    { id: 'big', label: 'Over ₹5,000', targetWp: null, maxRupees: null },
  ],
};
const [screen] = ONBOARDING_FLOW.screens;
const start = (language: 'en' | 'mr' | 'hi', profile: string | null = 'Asha Patil') =>
  inLanguage(language, async () => onboardingFormStart(settings, profile));

describe('the onboarding form (Flow JSON)', () => {
  it('is one terminal screen that completes with every answer by name', () => {
    expect(ONBOARDING_FLOW.version).toBe('6.0');
    expect(ONBOARDING_FLOW.screens).toHaveLength(1);
    expect(screen?.id).toBe(ONBOARDING_SCREEN);
    expect(screen?.terminal).toBe(true);
    const json = JSON.stringify(screen?.layout);
    for (const field of ['name', 'city', 'other_city', 'site', 'bill', 'roof', 'floors'])
      expect(json).toContain(`"name":"${field}"`);
    expect(json).toContain('"type":"PhotoPicker","name":"bill_photo"');
    expect(json).toContain('"max-uploaded-photos":1');
    const form = screen?.layout.children[1] as {
      children: { 'on-click-action'?: { name: string; payload: object } }[];
    };
    const footer = form.children.at(-1)?.['on-click-action'];
    expect(footer?.name).toBe('complete');
    expect(Object.keys(footer?.payload ?? {})).toEqual([
      'name',
      'city',
      'other_city',
      'site',
      'bill',
      'roof',
      'floors',
      'bill_photo',
    ]);
  });

  it('reads only data it declares, and the start data fills every declared field', async () => {
    const used = [...JSON.stringify(screen?.layout).matchAll(/\$\{data\.(\w+)\}/g)].map(
      (m) => m[1],
    );
    const declared = Object.keys(screen?.data ?? {});
    const given = await start('en');
    for (const name of used) expect(declared, name).toContain(name);
    for (const name of declared) expect(Object.keys(given.data), name).toContain(name);
    expect(given.screen).toBe(ONBOARDING_SCREEN);
  });

  it('is in the registry, so it is published and listed in Settings', () => {
    expect(FORMS.find((form) => form.key === 'onboarding')).toMatchObject({
      name: 'Tell us about your home',
      version: '1.0',
      flowJson: ONBOARDING_FLOW,
    });
  });
});

describe('the onboarding form start data', () => {
  it('offers the owner cities then Other, the bill bands and the chat words, in English', async () => {
    const { data, button } = await start('en');
    expect(data.city_options).toEqual([
      { id: 'Pune', title: 'Pune' },
      { id: 'Satara', title: 'Satara' },
      { id: OTHER_CITY_OPTION, title: 'Other city' },
    ]);
    expect(data.bill_options).toEqual([
      { id: 'low', title: 'Up to ₹1,000' },
      { id: 'big', title: 'Over ₹5,000' },
    ]);
    expect(data.site_options).toHaveLength(4);
    expect(data.floors_options).toEqual([
      { id: '1', title: 'Ground only' },
      { id: '2', title: '2 floors' },
      { id: '3', title: '3 or more' },
    ]);
    expect(data.name_init).toBe('Asha Patil');
    expect(button).toBe('Open form');
  });

  it('speaks Marathi and Hindi, and offers no name that cannot be used', async () => {
    const mr = await start('mr', null);
    expect(mr.data.heading).toBe('तुमच्या घराबद्दल सांगा');
    expect(mr.data.name_init).toBe('');
    expect((mr.data.bill_options as readonly { title: string }[])[0]?.title).toBe('हजारापर्यंत');
    expect((mr.data.city_options as readonly { title: string }[]).at(-1)?.title).toBe('दुसरे शहर');
    const hi = await start('hi');
    expect(hi.data.heading).toBe('अपने घर के बारे में बताएँ');
    expect(hi.data.send).toBe('मेरा अनुमान पाएँ');
  });

  it.each(['en', 'mr', 'hi'] as const)('keeps within Meta limits in %s', async (language) => {
    const words = ONBOARD_FORM_LISTS[language];
    expect(words.button.length).toBeLessThanOrEqual(FORM_LIMITS.button);
    expect(words.body.length).toBeLessThanOrEqual(FORM_LIMITS.body);
    expect(words.heading.length).toBeLessThanOrEqual(FORM_LIMITS.heading);
    expect(words.send.length).toBeLessThanOrEqual(FORM_LIMITS.send);
    expect(words.photoHint.length).toBeLessThanOrEqual(FORM_LIMITS.hint);
    for (const label of [words.nameLabel, words.otherCityLabel])
      expect(label.length, label).toBeLessThanOrEqual(20);
    for (const label of [words.cityLabel, words.siteLabel, words.billLabel, words.roofLabel])
      expect(label.length, label).toBeLessThanOrEqual(30);
    expect(words.otherCityHint.length).toBeLessThanOrEqual(80);
    const { data } = await start(language);
    for (const list of [data.city_options, data.site_options, data.bill_options, data.roof_options])
      for (const option of list as readonly { title: string }[])
        expect(option.title.length, option.title).toBeLessThanOrEqual(30);
  });
});

describe('a form reply as onboarding answers', () => {
  const full = {
    name: 'asha  patil',
    city: 'Pune',
    other_city: '',
    site: 'home',
    bill: 'low',
    roof: 'rcc',
    floors: '2',
  };

  it('reads each answer as the chat would', () => {
    expect(answersFromForm(full, settings)).toEqual({
      values: {
        name: 'Asha Patil',
        city: 'Pune',
        site: 'home',
        bill: 'low',
        roof: 'rcc',
        floors: 2,
      },
      otherCity: false,
    });
  });

  it('takes the typed city when Other is picked', () => {
    const got = answersFromForm(
      { ...full, city: OTHER_CITY_OPTION, other_city: ' Kolhapur ' },
      settings,
    );
    expect(got.values.city).toBe('Kolhapur');
    expect(got.otherCity).toBe(false);
  });

  it('asks the city in the chat when Other is picked and nothing usable is typed', () => {
    const got = answersFromForm({ ...full, city: OTHER_CITY_OPTION, other_city: ' ' }, settings);
    expect(got.values.city).toBeUndefined();
    expect(got.otherCity).toBe(true);
  });

  it('keeps a farm as the site (the expert path follows) and leaves out options we never offered', () => {
    const got = answersFromForm(
      { ...full, site: 'farm', roof: 'glass', bill: 'nope', city: 'Mumbai' },
      settings,
    );
    expect(got.values.site).toBe('farm');
    expect(got.values).not.toHaveProperty('roof');
    expect(got.values).not.toHaveProperty('bill');
    expect(got.values).not.toHaveProperty('city');
    expect(got.otherCity).toBe(false);
  });

  it('is empty when the reply has no answers', () => {
    expect(answersFromForm({}, settings)).toEqual({ values: {}, otherCity: true });
  });
});
