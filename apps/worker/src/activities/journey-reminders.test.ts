import { describe, expect, it } from 'vitest';
import { actionReminderDue } from './action-reminders';
import {
  askedSince,
  confirmReminder,
  signatureReminder,
  waitingBody,
  waitingFor,
} from './journey-reminders';

const DAY = 86_400_000;
const now = new Date('2026-11-10T06:00:00Z');
const ask = (over: Record<string, unknown>, type = 'confirm', ageDays = 5) => ({
  id: 'a1',
  type: type as 'confirm',
  createdAt: new Date(now.getTime() - ageDays * DAY),
  payload: { kind: 'site_ready', ...over } as Record<string, unknown>,
});
const given = { customer: 'Tejas', home: 'Sangli' };

describe('roof and installation reminders', () => {
  it('ask again with the same buttons: roof, installation', () => {
    expect(confirmReminder(ask({}), given)).toEqual({
      template: 'site_ready_check',
      payload: { ...given, yesPayload: 'rdy:y:a1', notYetPayload: 'rdy:n:a1' },
    });
    expect(confirmReminder(ask({ kind: 'installation' }), given)).toEqual({
      template: 'installation_check',
      payload: { ...given, yesPayload: 'ins:y:a1', wrongPayload: 'ins:bad:a1' },
    });
  });

  it('after "Not yet" the reminder waits for the roof with [It is ready now]', () => {
    const waiting = ask({ answer: 'not_yet', answeredAt: '2026-11-09T06:00:00Z' });
    expect(confirmReminder(waiting, given)).toEqual({
      template: 'site_ready_reminder',
      payload: { ...given, readyNowPayload: 'rdy:now:a1' },
    });
  });

  it('counts from the answer: asked 5 days ago but answered yesterday is not due yet', () => {
    const waiting = ask({ answer: 'not_yet', answeredAt: '2026-11-09T06:00:00Z' });
    expect(askedSince(waiting).toISOString()).toBe('2026-11-09T06:00:00.000Z');
    expect(actionReminderDue(askedSince(waiting), now)).toBeNull();
    expect(actionReminderDue(askedSince(ask({})), now)).toBe('team');
    const old = ask({ answer: 'not_yet', answeredAt: '2026-11-07T06:00:00Z' });
    expect(actionReminderDue(askedSince(old), now)).toBe('customer');
  });

  it('a missing or broken answer day falls back to the day it was asked', () => {
    expect(askedSince(ask({ answer: 'not_yet', answeredAt: 'x' })).getTime()).toBe(
      ask({}).createdAt.getTime(),
    );
  });

  it('the asker is told what really happened, per kind', () => {
    const waiting = ask({ answer: 'not_yet', answeredAt: '2026-11-04T06:00:00Z' });
    expect(waitingFor(waiting)).toBe('the roof to be ready');
    expect(waitingBody(waiting)).toMatch(/^They answered Not yet on 2026-11-04 /);
    expect(waitingFor(ask({}))).toBe('an answer about the roof');
    expect(waitingFor(ask({ kind: 'installation' }))).toBe('an answer about the installation');
    expect(waitingBody(ask({}))).toMatch(/has not answered/);
  });
});

describe('signature reminder', () => {
  it('names the paper and its button shows it again', () => {
    const paper = ask({ paperTitle: 'Net-metering agreement' }, 'signature');
    expect(signatureReminder(paper, given)).toEqual({
      template: 'signature_reminder',
      payload: { ...given, document: 'Net-metering agreement', showPayload: 'jr:a1' },
    });
    expect(waitingFor(paper)).toBe('a paper to agree to');
  });
});
