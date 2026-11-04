import { describe, expect, it } from 'vitest';
import { keyEditable } from './leave-kinds';

describe('keyEditable', () => {
  const saved = ['casual', 'sick'];

  it('allows editing the short name of a new kind', () => {
    expect(keyEditable(null, saved)).toBe(true);
  });

  it('allows editing a kind added this session and not yet saved', () => {
    expect(keyEditable({ key: 'study', label: 'Study', daysPerYear: 2 }, saved)).toBe(true);
  });

  it('locks the short name once the kind is saved, as requests may use it', () => {
    expect(keyEditable({ key: 'sick', label: 'Sick', daysPerYear: 12 }, saved)).toBe(false);
  });
});
