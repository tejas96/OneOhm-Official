import type { CustomerProject } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import {
  asksForFeedback,
  dialDigits,
  isLive,
  milestoneLabel,
  percentPaid,
  shareSplit,
  stepProgress,
} from './journey';

type Stage = CustomerProject['stages'][number];

function project(overrides: Partial<CustomerProject>): CustomerProject {
  return {
    id: 'b6a4f1d2-0000-4000-8000-000000000001',
    code: 'OH-2026-001',
    capacityWp: 5450,
    type: 'residential',
    place: 'Sangli',
    status: 'active',
    currentStage: 'design',
    stages: [],
    updates: [],
    nextStep: null,
    waiting: null,
    payments: { totalPaise: 0, paidPaise: 0, milestones: [] },
    subsidy: { amountPaise: 0, status: 'pending' },
    quotation: { id: 'b6a4f1d2-0000-4000-8000-000000000002', number: 'OH-Q-2026-0001' },
    contact: null,
    feedbackGiven: false,
    ...overrides,
  };
}

const stages = (states: Stage['state'][]): Stage[] =>
  (['survey', 'design', 'material', 'installation', 'commissioning'] as const).map(
    (stage, index) => ({ stage, state: states[index] ?? 'upcoming' }),
  );

describe('stepProgress', () => {
  it('counts only the steps that apply to the home', () => {
    expect(stepProgress(stages(['done', 'done', 'current', 'skipped', 'upcoming']))).toEqual({
      done: 2,
      total: 4,
    });
  });
});

describe('isLive and asksForFeedback', () => {
  it('treats a switched-on system as live and asks for a rating once', () => {
    const switchedOn = project({ stages: stages(['done', 'done', 'done', 'done', 'done']) });
    expect(isLive(switchedOn)).toBe(true);
    expect(asksForFeedback(switchedOn)).toBe(true);
    expect(asksForFeedback({ ...switchedOn, feedbackGiven: true })).toBe(false);
  });

  it('does not ask before switch-on', () => {
    expect(asksForFeedback(project({ stages: stages(['done', 'current']) }))).toBe(false);
  });
});

describe('payments', () => {
  it('rounds the paid share down and splits own and bank shares', () => {
    const milestones: CustomerProject['payments']['milestones'] = [
      {
        label: 'Advance',
        payer: 'customer',
        amountPaise: 100,
        paidPaise: 100,
        status: 'paid',
        dueAt: null,
        payUrl: null,
      },
      {
        label: 'Loan',
        payer: 'bank',
        amountPaise: 200,
        paidPaise: 0,
        status: 'upcoming',
        dueAt: null,
        payUrl: null,
      },
    ];
    expect(percentPaid({ totalPaise: 300, paidPaise: 100, milestones })).toBe(33);
    expect(percentPaid({ totalPaise: 0, paidPaise: 0, milestones: [] })).toBe(0);
    expect(shareSplit(milestones)).toEqual({
      customer: { totalPaise: 100, paidPaise: 100 },
      bank: { totalPaise: 200, paidPaise: 0 },
    });
  });
});

describe('labels and links', () => {
  it('says milestones in plain words and keeps unknown titles', () => {
    expect(milestoneLabel({ key: 'net_meter_installation', title: 'Net meter installed' })).toBe(
      'Net meter fitted',
    );
    expect(milestoneLabel({ key: 'something_new', title: 'Something new' })).toBe('Something new');
  });

  it('adds India’s code to ten-digit numbers', () => {
    expect(dialDigits('+91 98093 01808')).toBe('919809301808');
    expect(dialDigits('98093 01808')).toBe('919809301808');
  });
});
