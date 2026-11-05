import { describe, expect, it } from 'vitest';
import { usableName } from './name-check';

describe('usableName', () => {
  it('accepts real names in three scripts', () => {
    expect(usableName('Suresh Patil')).toBe('Suresh Patil');
    expect(usableName('सुरेश पाटील')).toBe('सुरेश पाटील');
    expect(usableName("D'Souza")).toBe("D'Souza");
  });

  it('refuses emoji, digits, single letters and business names', () => {
    for (const bad of [
      '😀',
      '🔥🔥 Raj',
      'S',
      'Raj123',
      '9876543210',
      'Solar Energy Traders',
      'OneOhm',
    ])
      expect(usableName(bad)).toBeNull();
  });

  it('refuses a name with a business word in it: asking costs one typed line', () => {
    expect(usableName('Surya Solar Traders')).toBeNull();
    expect(usableName('Ravi Solar')).toBeNull();
  });
});
