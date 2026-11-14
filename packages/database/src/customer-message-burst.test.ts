import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { DatabaseExecutor } from './client';
import {
  holdMessage,
  isHeldMessage,
  MERGE_MARGIN_SECONDS,
  MILESTONE_HOLD_SECONDS,
  mergeIntoHeldMilestone,
  mergeMilestone,
  releaseHeldMilestones,
  sayMilestones,
} from './customer-message-burst';
import { chatSentence } from './customer-message-chat';
import { localValues } from './customer-message-words';

const first = {
  customer: 'Asha',
  project: 'OH-1',
  milestone: 'Net meter fitted',
  step: 'net_meter_installation',
  language: 'mr-IN',
};

describe('step updates merged into one message', () => {
  it('only step updates are held', () => {
    expect(isHeldMessage('project_milestone')).toBe(true);
    expect(isHeldMessage('payment_received')).toBe(false);
    expect(MILESTONE_HOLD_SECONDS).toBe(90);
  });

  it('lists every title, joined, and keeps the step keys in order', () => {
    const two = mergeMilestone(first, { ...first, milestone: 'Inspection done', step: 'x' });
    expect(two).toMatchObject({
      milestone: 'Net meter fitted; Inspection done',
      milestones: 'Net meter fitted; Inspection done',
      steps: 'net_meter_installation,x',
    });
    const three = mergeMilestone(two, { ...first, milestone: 'Panels up', step: '' });
    expect(three.milestones).toBe('Net meter fitted; Inspection done; Panels up');
    expect(three.steps).toBe('net_meter_installation,x,');
  });

  it('does not add a title twice', () => {
    const two = mergeMilestone(first, { ...first, milestone: 'Inspection done', step: 'x' });
    expect(mergeMilestone(two, first)).toBe(two);
  });

  it('says each step in the customer’s language, then joins them', () => {
    const merged = mergeMilestone(first, { ...first, milestone: 'Inspection done', step: 'x' });
    expect(localValues('mr-IN', 'project_milestone', merged).milestone).toBe(
      'नेट मीटर बसवला; Inspection done',
    );
    // English keeps the joined text; a single step is said as before.
    expect(localValues('en-IN', 'project_milestone', merged).milestone).toBe(
      'Net meter fitted; Inspection done',
    );
    expect(localValues('mr-IN', 'project_milestone', first).milestone).toBe('नेट मीटर बसवला');
    expect(sayMilestones(first, () => 'x')).toBeUndefined();
  });

  it('reads as one chat sentence in each language', () => {
    expect(chatSentence('project_milestone', first, 'en-IN')).toBe(
      'Update on your solar project OH-1: Net meter fitted.',
    );
    expect(chatSentence('project_milestone', first, 'mr-IN')).toBe(
      'तुमच्या सोलर प्रकल्पाची (OH-1) नवी माहिती: नेट मीटर बसवला.',
    );
    expect(
      chatSentence(
        'service_update',
        { topic: 'panel cleaning', status: 'being worked on' },
        'hi-IN',
      ),
    ).toBe('आपके सर्विस अनुरोध की जानकारी, पैनल की सफ़ाई: काम चल रहा है।');
    expect(chatSentence('nothing_like_this', {}, 'mr-IN')).toBeNull();
  });
});

/** A database that answers the held-row lookup with `held` and records what is written. */
function fakeDb(held: { id: string; payload: unknown } | undefined, existing = false) {
  const updates: { payload?: unknown; notBefore?: unknown }[] = [];
  const wheres: unknown[] = [];
  let selects = 0;
  const chain = (result: unknown[]) => {
    const q = {
      from: () => q,
      where: (condition: unknown) => {
        wheres.push(condition);
        return q;
      },
      orderBy: () => q,
      for: () => q,
      limit: () => q,
      // biome-ignore lint/suspicious/noThenProperty: a drizzle query is awaited as is.
      then: (done: (rows: unknown[]) => unknown) => Promise.resolve(result).then(done),
    };
    return q;
  };
  const db = {
    select: () => {
      selects += 1;
      // First the dedupe-key check, then the held-row lookup.
      return chain(selects === 1 ? (existing ? [{ id: 'old' }] : []) : held ? [held] : []);
    },
    update: () => ({
      set: (values: { payload?: unknown; notBefore?: unknown }) => {
        updates.push(values);
        return { where: async () => undefined };
      },
    }),
  };
  return { updates, wheres, db: db as unknown as DatabaseExecutor };
}

describe('folding a step update into the held one', () => {
  it('merges into the held row and writes the joined payload', async () => {
    const { updates, db } = fakeDb({ id: 'h1', payload: first });
    const merged = await mergeIntoHeldMilestone(
      db,
      '+919800000001',
      { ...first, milestone: 'Inspection done', step: 'x' },
      'task_completed:2',
    );
    expect(merged).toBe(true);
    expect(updates[0]?.payload).toMatchObject({ milestones: 'Net meter fitted; Inspection done' });
  });

  it('starts a new message when none is held for this project', async () => {
    const { updates, db } = fakeDb(undefined);
    expect(await mergeIntoHeldMilestone(db, '+919800000001', first, 'k')).toBe(false);
    expect(updates).toEqual([]);
  });

  it('never merges an event that was already queued under its key', async () => {
    const { updates, db } = fakeDb({ id: 'h1', payload: first }, true);
    expect(await mergeIntoHeldMilestone(db, '+919800000001', first, 'k')).toBe(false);
    expect(updates).toEqual([]);
  });

  it('remembers every merged event key in the payload, even a repeated title', async () => {
    const { updates, db } = fakeDb({ id: 'h1', payload: { ...first, mergedKeys: ['task:1'] } });
    await mergeIntoHeldMilestone(db, '+919800000001', first, 'task:2');
    expect(updates[0]?.payload).toMatchObject({ mergedKeys: ['task:1', 'task:2'] });
  });

  const sqlOf = (condition: unknown) =>
    new PgDialect().sqlToQuery(condition as Parameters<PgDialect['sqlToQuery']>[0]);

  it('looks for the key in the dedupe column and in merged keys of held rows', async () => {
    const { wheres, db } = fakeDb(undefined);
    await mergeIntoHeldMilestone(db, '+919800000001', first, 'task:9');
    const seen = sqlOf(wheres[0]);
    expect(seen.sql).toContain('"dedupe_key"');
    expect(seen.sql).toContain('@>');
    expect(seen.params).toContain(JSON.stringify({ mergedKeys: ['task:9'] }));
  });

  it('only merges into a row that is not started and has time left before it goes', async () => {
    const { wheres, db } = fakeDb(undefined);
    await mergeIntoHeldMilestone(db, '+919800000001', first, 'task:9');
    const held = sqlOf(wheres[1]);
    expect(held.sql).toContain('"started_at" is null');
    expect(held.sql).toContain('"attempts" = $');
    expect(held.sql).toContain('clock_timestamp() + $');
    expect(held.params).toContain(MERGE_MARGIN_SECONDS);
    expect(MERGE_MARGIN_SECONDS).toBe(15);
  });

  it('a newer message releases a held step update by setting its wait to now', async () => {
    const { updates, db } = fakeDb(undefined);
    await releaseHeldMilestones(db, '+919800000001');
    expect(updates[0]).toHaveProperty('notBefore');
  });

  it('holds a new message by setting not_before', async () => {
    const { updates, db } = fakeDb(undefined);
    await holdMessage(db, 'k');
    expect(updates[0]).toHaveProperty('notBefore');
  });
});
