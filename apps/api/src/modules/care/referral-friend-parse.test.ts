import { describe, expect, it } from 'vitest';
import { homeOptions } from './care-form-words';
import { mobileOf, nameOf } from './referral-chat.service';

describe('mobileOf', () => {
  it('normalises +91, 91, 0 and spaces to +91 and ten digits', () => {
    for (const typed of [
      '98765 43210',
      '+91 98765-43210',
      '919876543210',
      '09876543210',
      ' 9876543210 ',
    ])
      expect(mobileOf(typed), typed).toBe('+919876543210');
  });
  it('refuses short, long, non-mobile and empty numbers', () => {
    for (const bad of [
      '98765',
      '12345 67890',
      '98765432101',
      '+1 98765 43210',
      'abc',
      '',
      undefined,
    ])
      expect(mobileOf(bad), String(bad)).toBeNull();
  });
});

describe('nameOf', () => {
  it('keeps letters (also Devanagari), tidies spaces, drops digits', () => {
    expect(nameOf('  Meena   Joshi ')).toBe('Meena Joshi');
    expect(nameOf('मीना जोशी')).toBe('मीना जोशी');
    expect(nameOf('Ravi 2')).toBe('Ravi');
  });
  it('refuses nothing usable', () => {
    for (const bad of ['', '12', 'a', undefined]) expect(nameOf(bad), String(bad)).toBeNull();
  });
});

describe('homeOptions', () => {
  it('lists the town, and tells two homes in one town apart', () => {
    expect(
      homeOptions([
        { id: 'a', city: 'Sangli' },
        { id: 'b', city: 'Pune' },
      ]),
    ).toEqual([
      { id: 'a', title: 'Sangli' },
      { id: 'b', title: 'Pune' },
    ]);
    const same = homeOptions([
      { id: 'a', city: 'Sangli', site: 'Home' },
      { id: 'b', city: 'Sangli', site: 'Farm' },
      { id: 'c', city: 'Sangli' },
    ]);
    expect(same.map((one) => one.title)).toEqual(['Sangli · Home', 'Sangli · Farm', 'Sangli (3)']);
    expect(homeOptions([{ id: 'a', city: 'X'.repeat(40) }])[0]?.title).toHaveLength(30);
  });
});
