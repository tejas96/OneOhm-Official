import type { DatabaseExecutor } from '@oneohm/database';
import { describe, expect, it, vi } from 'vitest';

const asked = vi.hoisted(() => vi.fn(async () => 'sent'));
vi.mock('../care/rating-ask', () => ({ askRating: asked }));

import { askForStageRating } from './rating-request';

/** A db whose task list is `tasks` and whose open-question lookup finds `open`. */
function fakeDb(open: boolean): DatabaseExecutor {
  const tasks = [{ stage: 'survey', status: 'completed', customerVisible: true }];
  return {
    select: (shape: Record<string, unknown>) => ({
      from: () => {
        const rows = 'stage' in shape ? tasks : open ? [{ id: 'a1' }] : [];
        const result = Promise.resolve(rows);
        return Object.assign(result, {
          where: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }),
          innerJoin: () => ({ where: () => ({ limit: async () => rows }) }),
        });
      },
    }),
  } as unknown as DatabaseExecutor;
}

describe('askForStageRating', () => {
  it('asks when nothing else waits', async () => {
    asked.mockClear();
    expect(await askForStageRating(fakeDb(false), { projectId: 'p', stage: 'survey' })).toBe(true);
    expect(asked).toHaveBeenCalledOnce();
  });

  it('does not ask while another rating or confirm question is open', async () => {
    asked.mockClear();
    expect(await askForStageRating(fakeDb(true), { projectId: 'p', stage: 'survey' })).toBe(false);
    expect(asked).not.toHaveBeenCalled();
  });
});
