import { describe, expect, it } from 'vitest';
import { moveTarget } from './move-target';

const sold = { propertyId: 'p1', projectId: 'j1', title: 'Pune', description: 'Pune' };
const leadOnly = { propertyId: 'p2', projectId: null, title: 'Farm', description: 'Sangli' };

describe('where the move sheet files a paper', () => {
  it('on the project of a home that has one', () => {
    expect(moveTarget([sold, leadOnly], 'p1')).toEqual({ projectId: 'j1', propertyId: null });
  });

  it('on the property of a home that is only a lead', () => {
    expect(moveTarget([sold, leadOnly], 'p2')).toEqual({ projectId: null, propertyId: 'p2' });
  });

  it('nowhere for no home (a person paper)', () => {
    expect(moveTarget([sold], 'none')).toEqual({ projectId: null, propertyId: null });
  });
});
