import { describe, expect, it } from 'vitest';
import { SITE } from '../../copy/site';
import { openVisitTitle } from './open-visit';

describe('openVisitTitle (S1)', () => {
  it('names the task or request', () =>
    expect(openVisitTitle({ taskTitle: ' Panel installation ', projectCode: 'P-1' })).toBe(
      'Panel installation',
    ));
  it('falls back to the project code, then to nothing', () => {
    expect(openVisitTitle({ taskTitle: null, projectCode: 'P-1' })).toBe('P-1');
    expect(openVisitTitle({ taskTitle: null, projectCode: null })).toBe('');
  });
  it('words the button for a visit with no name', () => {
    expect(SITE.checkOutElsewhere('')).toBe('Check out of that visit');
    expect(SITE.checkOutElsewhere('Survey')).toBe('Check out of Survey');
  });
});
