import { describe, expect, it } from 'vitest';
import { firstOutOfOrder } from './template-order';

const survey = { key: 'survey', title: 'Site survey', dependsOn: [] };
const design = { key: 'design', title: 'System design', dependsOn: ['survey'] };
const install = { key: 'install', title: 'Install', dependsOn: ['design'] };

describe('firstOutOfOrder', () => {
  it('accepts a list where every task comes after what it waits for', () => {
    expect(firstOutOfOrder([survey, design, install])).toBeNull();
  });

  it('names the task listed above a task it waits for', () => {
    expect(firstOutOfOrder([design, survey, install])).toEqual({
      task: 'System design',
      waitsFor: 'Site survey',
    });
  });
});
