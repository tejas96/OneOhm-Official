import { describe, expect, it } from 'vitest';
import { choiceFor, correctionDay } from './correction-date';

const today = '2026-11-15';

describe('which day a correction names', () => {
  it('picks today and yesterday without typing', () => {
    expect(correctionDay('today', '', today, 31).date).toBe('2026-11-15');
    expect(correctionDay('yesterday', '', today, 31).date).toBe('2026-11-14');
  });
  it('takes a typed day inside the window', () => {
    expect(correctionDay('other', '2026-10-15', today, 31).date).toBe('2026-10-15');
    expect(correctionDay('other', '2026-10-14', today, 31).date).toBeNull();
  });
  it('refuses the future, a half-typed day and a day that does not exist', () => {
    expect(correctionDay('other', '2026-11-16', today, 31).date).toBeNull();
    expect(correctionDay('other', '2026-11-1', today, 31).date).toBeNull();
    expect(correctionDay('other', '2026-02-30', today, 31).date).toBeNull();
  });
  it('opens on the chip that fits a day', () => {
    expect(choiceFor(null, today)).toBe('today');
    expect(choiceFor('2026-11-14', today)).toBe('yesterday');
    expect(choiceFor('2026-11-01', today)).toBe('other');
  });
});
