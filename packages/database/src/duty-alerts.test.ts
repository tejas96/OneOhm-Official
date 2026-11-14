import { describe, expect, it, vi } from 'vitest';
import { dutyAlertTargets } from './duty-alerts';

// Everyone is at work, unless listed as away (no backup).
const away = new Set<string>();
vi.mock('./chat-answerer', () => ({
  answererFor: async (_db: unknown, id: string) => (away.has(id) ? null : id),
}));

/** A db whose holder query returns `rows`. */
const dbWith = (rows: { id: string; system: boolean }[]) => {
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'from', 'innerJoin']) chain[name] = () => chain;
  chain.where = async () => rows;
  return chain as never;
};

const ROWS = [
  { id: 'rohit', system: false },
  { id: 'admin', system: true },
];

describe('dutyAlertTargets', () => {
  it('keeps the desk back while a non-desk holder is at work', async () => {
    away.clear();
    expect(await dutyAlertTargets(dbWith(ROWS), 'x')).toEqual(['rohit']);
  });

  it('includeDesk reaches the desk too', async () => {
    away.clear();
    expect(await dutyAlertTargets(dbWith(ROWS), 'x', { includeDesk: true })).toEqual([
      'rohit',
      'admin',
    ]);
  });

  it('includeDesk skips holders who are away, and falls back to every holder', async () => {
    away.clear();
    away.add('rohit');
    expect(await dutyAlertTargets(dbWith(ROWS), 'x', { includeDesk: true })).toEqual(['admin']);
    away.add('admin');
    expect(await dutyAlertTargets(dbWith(ROWS), 'x', { includeDesk: true })).toEqual([
      'rohit',
      'admin',
    ]);
  });
});
