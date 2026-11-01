import { describe, expect, it } from 'vitest';
import { effectiveStep, type LeadStep, orderSteps } from './lead-steps';

const steps: LeadStep[] = [
  { key: 'quoted', name: 'Quotation sent', stage: 'quoted', position: 0, active: true },
  { key: 'negotiation', name: 'Negotiation', stage: 'quoted', position: 1, active: true },
  { key: 'new', name: 'New', stage: 'new', position: 0, active: true },
  { key: 'loan_check', name: 'Loan check', stage: 'quoted', position: 2, active: false },
];

describe('lead steps (PRD 3.3)', () => {
  it('orders steps by stage, then by the owner order', () => {
    expect(orderSteps(steps).map((step) => step.key)).toEqual([
      'new',
      'quoted',
      'negotiation',
      'loan_check',
    ]);
  });

  it('keeps the saved step while it belongs to the stage', () => {
    expect(effectiveStep(steps, 'quoted', 'negotiation')?.key).toBe('negotiation');
  });

  it('falls back to the first active step when automation moved the stage', () => {
    expect(effectiveStep(steps, 'quoted', 'new')?.key).toBe('quoted');
    expect(effectiveStep(steps, 'quoted', 'loan_check')?.key).toBe('quoted');
  });

  it('gives won and lost leads no step', () => {
    expect(effectiveStep(steps, 'won', 'negotiation')).toBeNull();
  });
});
