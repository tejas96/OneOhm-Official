import { describe, expect, it } from 'vitest';
import { acceptTap } from './attendance-tap';

const now = new Date('2026-11-15T10:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

describe('which tap time the server accepts', () => {
  it('uses a tap within 30 minutes with no flag', () => {
    expect(acceptTap(ago(29), now)).toEqual({ at: new Date(ago(29)), delayed: false });
  });

  it('uses a tap 30 minutes to 12 hours old but flags it for review', () => {
    expect(acceptTap(ago(120), now)).toEqual({ at: new Date(ago(120)), delayed: true });
  });

  it('refuses over 12 hours with 422 tap_too_old', () => {
    expect(() => acceptTap(ago(12 * 60 + 1), now)).toThrow(
      expect.objectContaining({ status: 422, code: 'tap_too_old' }),
    );
  });

  it('refuses a tap more than 2 minutes ahead with 422 tap_in_future', () => {
    expect(() => acceptTap(ago(-3), now)).toThrow(
      expect.objectContaining({ status: 422, code: 'tap_in_future' }),
    );
    expect(acceptTap(ago(-1), now).at).toEqual(now);
  });

  it('uses the server time when there is no tap time', () => {
    expect(acceptTap(undefined, now)).toEqual({ at: now, delayed: false });
  });
});
