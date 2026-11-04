import { describe, expect, it } from 'vitest';
import { skillsNotAllowed } from './person-skills';

describe('skillsNotAllowed', () => {
  const active = new Set(['roofing', 'wiring']);

  it('lets a person keep a switched-off skill they already have', () => {
    expect(skillsNotAllowed(['roofing', 'welding'], active, new Set(['welding']))).toEqual([]);
  });

  it('refuses newly giving a switched-off or unknown skill', () => {
    expect(skillsNotAllowed(['welding', 'roofing'], active, new Set())).toEqual(['welding']);
  });
});
