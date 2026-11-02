import type { ProjectTask } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { blockingOf } from './task-status';

describe('blockingOf', () => {
  it('reads the tasks this one holds up', () => {
    expect(blockingOf({ blocking: ['Panel install'] } as ProjectTask)).toEqual(['Panel install']);
  });

  it('is empty when an older API sends no blocking field', () => {
    expect(blockingOf({} as ProjectTask)).toEqual([]);
  });
});
