import { describe, expect, it } from 'vitest';
import { closedPayload, isStale, keptStepWaiting } from './journey-stale';

const roof = { taskId: 'dispatch', payload: { kind: 'site_ready' } };
const task = (templateKey: string, id = 'x') => ({ id, projectId: 'p', templateKey });

describe('which asks end with a step', () => {
  it('keeps the roof question open when dispatch itself completes', () => {
    expect(isStale(task('dispatch_material', 'dispatch'), roof, 'completed')).toBe(false);
  });
  it('closes the roof question when installation work starts or completes', () => {
    expect(isStale(task('structure_installation'), roof, 'started')).toBe(true);
    expect(isStale(task('installation_complete'), roof, 'completed')).toBe(true);
  });
  it('closes the installation question with its own step or at commissioning, not at start', () => {
    const ask = { taskId: 'inst', payload: { kind: 'installation' } };
    expect(isStale(task('installation_complete', 'inst'), ask, 'completed')).toBe(true);
    expect(isStale(task('testing_commissioning'), ask, 'completed')).toBe(true);
    expect(isStale(task('testing_commissioning'), ask, 'started')).toBe(false);
  });
  it('leaves other questions alone', () => {
    expect(
      isStale(
        task('structure_installation'),
        { taskId: null, payload: { kind: 'subsidy' } },
        'completed',
      ),
    ).toBe(false);
  });
});

describe('closing the roof question early', () => {
  it('keeps the customer answer apart from the step_done marker', () => {
    expect(closedPayload({ kind: 'site_ready', answer: 'not_yet', waitSince: 't' })).toMatchObject({
      answer: 'step_done',
      customerAnswer: 'not_yet',
      waitSince: 't',
    });
    expect(closedPayload({ kind: 'site_ready' })).toEqual({
      kind: 'site_ready',
      answer: 'step_done',
    });
  });
  it('only a roof question answered Not yet had kept the step waiting', () => {
    expect(keptStepWaiting({ kind: 'site_ready', answer: 'not_yet' })).toBe(true);
    expect(keptStepWaiting({ kind: 'site_ready' })).toBe(false);
    expect(keptStepWaiting({ kind: 'subsidy', answer: 'not_yet' })).toBe(false);
  });
});
