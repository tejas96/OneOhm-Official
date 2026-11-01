import { describe, expect, it } from 'vitest';
import { summaryLine } from './owner-summary';

describe('owner summary', () => {
  it('reads as one short line', () => {
    const line = summaryLine({
      receivedPaise: 1_25_000_00,
      newLeads: 3,
      quotesSent: 2,
      quotesAccepted: 1,
      projectsStarted: 1,
      tasksDone: 8,
      overdueNow: 5,
      dueUnpaidPaise: 56_349_00,
    });
    expect(line).toContain('received');
    expect(line).toContain('3 new leads');
    expect(line).toContain('2 quotes sent, 1 accepted');
    expect(line).toContain('5 late now');
  });
});
