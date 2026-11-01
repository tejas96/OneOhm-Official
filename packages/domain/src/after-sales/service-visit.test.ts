import { describe, expect, it } from 'vitest';
import { byUrgency, checkInChanges, finishChanges, finishProblems } from './service-visit';

const now = new Date('2026-11-01T06:00:00Z');
const earlier = new Date('2026-11-01T04:00:00Z');

describe('checkInChanges', () => {
  it('answers an unanswered request and starts an open one', () => {
    expect(checkInChanges({ status: 'open', respondedAt: null }, now)).toEqual({
      status: 'in_progress',
      respondedAt: now,
    });
  });

  it('keeps the first answer and an in-progress status', () => {
    expect(checkInChanges({ status: 'in_progress', respondedAt: earlier }, now)).toEqual({});
    expect(checkInChanges({ status: 'in_progress', respondedAt: null }, now)).toEqual({
      respondedAt: now,
    });
  });
});

describe('finishProblems', () => {
  it('needs what was done to mark it done, and a reason to hand it back', () => {
    expect(finishProblems({ outcome: 'done', workDone: '  ' })).toHaveProperty('workDone');
    expect(finishProblems({ outcome: 'done', workDone: 'Cleaned panels' })).toEqual({});
    expect(finishProblems({ outcome: 'handed_back' })).toHaveProperty('reason');
    expect(finishProblems({ outcome: 'handed_back', reason: 'Needs a new inverter' })).toEqual({});
  });
});

describe('finishChanges', () => {
  it('resolves with the work done as the note, answering it if needed', () => {
    expect(
      finishChanges(
        { status: 'in_progress', respondedAt: null },
        { outcome: 'done', workDone: ' Reset breaker ' },
        now,
      ),
    ).toEqual({
      status: 'resolved',
      resolutionNote: 'Reset breaker',
      resolvedAt: now,
      respondedAt: now,
    });
    expect(
      finishChanges(
        { status: 'in_progress', respondedAt: earlier },
        { outcome: 'done', workDone: 'Fixed' },
        now,
      ),
    ).not.toHaveProperty('respondedAt');
  });

  it('hands it back to the desk unassigned, its status unchanged', () => {
    expect(
      finishChanges(
        { status: 'open', respondedAt: null },
        { outcome: 'handed_back', reason: 'Part needed' },
        now,
      ),
    ).toEqual({ assigneeUserId: null });
  });
});

describe('byUrgency', () => {
  const job = (id: string, response: string | null, due: string | null) => ({
    id,
    sla: { response, resolution: null },
    resolutionDueAt: due,
    scheduledFor: null,
    createdAt: '2026-11-01T00:00:00Z',
  });
  it('puts missed promises first, then due soon, then the earliest due', () => {
    const list = [
      job('later', 'on_track', '2026-11-05T00:00:00Z'),
      job('soon', 'due_soon', '2026-11-04T00:00:00Z'),
      job('late', 'breached', '2026-11-06T00:00:00Z'),
      job('earlier', 'on_track', '2026-11-02T00:00:00Z'),
    ];
    expect(list.sort(byUrgency).map((item) => item.id)).toEqual([
      'late',
      'soon',
      'earlier',
      'later',
    ]);
  });
});
