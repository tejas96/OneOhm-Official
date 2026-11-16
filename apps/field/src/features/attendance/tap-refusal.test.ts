import { describe, expect, it } from 'vitest';
import { refusalNotice } from './tap-refusal';

const apiError = (status: number, message: string, code: string) =>
  Object.assign(new Error(message), { status, code });
const tap = {
  userId: 'u1',
  kind: 'in',
  tappedAt: '2026-11-15T03:30:00.000Z',
  position: null,
} as const;

describe('what is said about a refused tap', () => {
  it('says a too-old tap was dropped and points to a correction for that day', () => {
    const error = apiError(422, 'old', 'tap_too_old');
    const notice = refusalNotice({ tap, error });
    expect(notice.message).toBe('Check-in from 9:00 am was too old to send. Ask for a correction.');
    expect(notice.correctionDate).toBe('2026-11-15');
  });

  it('shows the servers own sentence for any other refusal', () => {
    const notice = refusalNotice({ tap, error: apiError(403, 'No.', 'forbidden') });
    expect(notice).toEqual({ message: 'No.', correctionDate: null });
  });
});
