import { describe, expect, it } from 'vitest';
import type { Incoming } from '../whatsapp-events';
import { asTap } from './onboarding-after';
import { ESTIMATE_CHOICES } from './onboarding-context';

const typed = (text: string): Incoming => ({
  from: '918087823247',
  waMessageId: 'wamid.x',
  at: new Date(),
  profileName: null,
  kind: 'text',
  text,
  choiceId: null,
});

describe('asTap', () => {
  it('turns typed button words into the tap, in any language', () => {
    expect(asTap(typed('Book a visit'))?.choiceId).toBe(ESTIMATE_CHOICES.visit);
    expect(asTap(typed('  book a VISIT! '))?.choiceId).toBe(ESTIMATE_CHOICES.visit);
    expect(asTap(typed('भेट ठरवा'))?.choiceId).toBe(ESTIMATE_CHOICES.visit);
    expect(asTap(typed('मुझे कॉल करें'))?.choiceId).toBe(ESTIMATE_CHOICES.call);
    expect(asTap(typed('Not now'))?.choiceId).toBe(ESTIMATE_CHOICES.notNow);
    expect(asTap(typed('Book a visit'))?.kind).toBe('choice');
  });

  it('leaves other words and real taps alone', () => {
    expect(asTap(typed('Can you visit on Sunday morning?'))?.choiceId).toBeNull();
    const tap = { ...typed('Call me'), kind: 'choice' as const, choiceId: ESTIMATE_CHOICES.call };
    expect(asTap(tap)).toBe(tap);
    expect(asTap(null)).toBeNull();
  });
});
