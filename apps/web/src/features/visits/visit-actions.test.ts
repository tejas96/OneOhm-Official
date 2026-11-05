import { describe, expect, it } from 'vitest';
import { showsTaskDifference, visitActions } from './visit-actions';

describe('visitActions', () => {
  it('a missed visit can be marked done or booked again, not confirmed or cancelled', () => {
    expect(visitActions({ status: 'missed' })).toEqual({
      open: false,
      confirm: false,
      done: true,
      cancel: false,
      bookAgain: true,
    });
  });
  it('a proposed visit is confirmed or cancelled; a confirmed one is done or cancelled', () => {
    expect(visitActions({ status: 'proposed' })).toMatchObject({
      confirm: true,
      done: false,
      cancel: true,
    });
    expect(visitActions({ status: 'confirmed' })).toMatchObject({
      confirm: false,
      done: true,
      cancel: true,
    });
    expect(visitActions(undefined).done).toBe(false);
  });
  it('the task note is for confirmed visits only', () => {
    expect(showsTaskDifference({ status: 'confirmed', day: '2026-11-09' }, '2026-11-06')).toBe(
      true,
    );
    expect(showsTaskDifference({ status: 'proposed', day: '2026-11-09' }, '2026-11-06')).toBe(
      false,
    );
    expect(showsTaskDifference({ status: 'confirmed', day: '2026-11-06' }, '2026-11-06')).toBe(
      false,
    );
  });
});
