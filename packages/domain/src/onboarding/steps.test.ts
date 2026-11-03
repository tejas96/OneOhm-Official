import { describe, expect, it } from 'vitest';
import { DEFAULT_ONBOARDING, type OnboardingSettings } from './settings';
import { nextStep, parseAnswer, previousStep } from './steps';

const s: OnboardingSettings = { ...DEFAULT_ONBOARDING, serviceCities: ['Pune', 'Nashik'] };
const typed = (step: Parameters<typeof parseAnswer>[0], text: string) =>
  parseAnswer(step, { choiceId: null, text }, s);
const chose = (step: Parameters<typeof parseAnswer>[0], choiceId: string) =>
  parseAnswer(step, { choiceId, text: '' }, s);

describe('parseAnswer by choice id', () => {
  it('parses each choice id', () => {
    expect(chose('language', 'ob:language:mr')).toEqual({ ok: true, value: 'mr' });
    expect(chose('site', 'ob:site:farm')).toEqual({ ok: true, value: 'farm' });
    expect(chose('bill', 'ob:bill:3000_5000')).toEqual({ ok: true, value: '3000_5000' });
    expect(chose('roof', 'ob:roof:tin')).toEqual({ ok: true, value: 'tin' });
    expect(chose('floors', 'ob:floors:2')).toEqual({ ok: true, value: 2 });
    expect(chose('photo', 'ob:photo:later')).toEqual({ ok: true, value: 'later' });
    expect(chose('city', 'ob:city:Pune')).toEqual({ ok: true, value: 'Pune' });
  });
  it('rejects a choice of another step or an unknown value', () => {
    expect(chose('site', 'ob:roof:tin')).toEqual({ ok: false });
    expect(chose('site', 'ob:site:moon')).toEqual({ ok: false });
    expect(chose('bill', 'ob:bill:nope')).toEqual({ ok: false });
  });
});

describe('parseAnswer typed', () => {
  it('reads option numbers and words in three languages', () => {
    expect(typed('site', '2')).toEqual({ ok: true, value: 'society' });
    expect(typed('site', 'घर')).toEqual({ ok: true, value: 'home' });
    expect(typed('site', ' Shop ')).toEqual({ ok: true, value: 'business' });
    expect(typed('site', 'शेत')).toEqual({ ok: true, value: 'farm' });
    expect(typed('language', '3')).toEqual({ ok: true, value: 'hi' });
    expect(typed('roof', 'slab')).toEqual({ ok: true, value: 'rcc' });
    expect(typed('roof', 'पत्रा')).toEqual({ ok: true, value: 'tin' });
    expect(typed('photo', '2')).toEqual({ ok: true, value: 'later' });
    expect(typed('site', 'banana')).toEqual({ ok: false });
  });
  it('reads a bill as a band', () => {
    expect(typed('bill', '3000')).toEqual({ ok: true, value: '2000_3000' });
    expect(typed('bill', '₹4,500')).toEqual({ ok: true, value: '3000_5000' });
    expect(typed('bill', '9000')).toEqual({ ok: true, value: 'over_5000' });
    expect(typed('bill', '3k')).toEqual({ ok: true, value: '2000_3000' });
    expect(typed('bill', '1001')).toEqual({ ok: true, value: '1000_2000' });
    expect(typed('bill', '800')).toEqual({ ok: true, value: 'up_to_1000' });
    expect(typed('bill', 'lots')).toEqual({ ok: false });
  });
  it('reads floors', () => {
    expect(typed('floors', 'G+2')).toEqual({ ok: true, value: 2 });
    expect(typed('floors', '5')).toEqual({ ok: true, value: 3 });
    expect(typed('floors', '1')).toEqual({ ok: true, value: 1 });
    expect(typed('floors', 'g+0')).toEqual({ ok: false });
    expect(typed('floors', 'high')).toEqual({ ok: false });
  });
  it('reads a city', () => {
    expect(typed('city', ' pune ')).toEqual({ ok: true, value: 'Pune' });
    expect(typed('city', 'x')).toEqual({ ok: false });
    expect(typed('city', 'Satara')).toEqual({ ok: true, value: 'Satara' });
    expect(typed('city', 'a'.repeat(41))).toEqual({ ok: false });
  });
  it('reads a name, 2 to 60 characters', () => {
    expect(typed('name', '  Asha  Patil ')).toEqual({ ok: true, value: 'Asha Patil' });
    expect(typed('name', 'A')).toEqual({ ok: false });
  });
});

describe('step order', () => {
  it('skips known steps', () => {
    expect(nextStep('language', {}, { name: 'Ravi' })).toBe('city');
    expect(nextStep('city', {}, { site: 'home', bill: '1000_2000' })).toBe('roof');
    expect(nextStep('city', { site: 'home' }, {})).toBe('bill');
    expect(nextStep('photo', {}, {})).toBe('done');
    expect(nextStep('floors', { photo: 'sent' }, {})).toBe('done');
  });
  it('goes back one step', () => {
    expect(previousStep('city')).toBe('name');
    expect(previousStep('language')).toBe('language');
    expect(previousStep('done')).toBe('photo');
  });
});
