import { describe, expect, it } from 'vitest';
import { MENU, openSection, SECTIONS, visibleMenu } from './settings-menu';

describe('settings menu', () => {
  it('lists every section exactly once', () => {
    const listed = MENU.flatMap((group) => group.items);
    expect([...listed].sort()).toEqual([...SECTIONS].sort());
  });

  it('keeps each group short enough to scan', () => {
    for (const group of MENU) expect(group.items.length).toBeLessThanOrEqual(5);
  });

  it('opens the first section in the menu when none is asked for', () => {
    const menu = visibleMenu(SECTIONS);
    expect(openSection(menu, null)).toBe('company');
  });

  it('opens the section asked for when the person may see it', () => {
    expect(openSection(visibleMenu(SECTIONS), 'warranty')).toBe('warranty');
  });

  it('falls back to the first section the person may see', () => {
    const menu = visibleMenu(['activity', 'roles']);
    expect(openSection(menu, 'company')).toBe('roles');
  });

  it('puts lead assignment with the other lead settings', () => {
    const leads = MENU.find((group) => group.key === 'leads');
    expect(leads?.items).toContain('leadAssignment');
  });

  it('hides groups with nothing the person may see', () => {
    expect(visibleMenu(['activity']).map((group) => group.key)).toEqual(['system']);
  });
});
