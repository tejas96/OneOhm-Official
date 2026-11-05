import { describe, expect, it } from 'vitest';
import { actionReminderDue } from './action-reminders';
import {
  askedSince,
  confirmReminder,
  isSubsidyWait,
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

  it('once agreed, the reminder asks for the signed page again', () => {
    const agreed = ask(
      { paperTitle: 'Net-metering agreement', agreedAt: '2026-11-08T06:00:00Z' },
      'signature',
    );
    expect(signatureReminder(agreed, given).template).toBe('signed_page_reminder');
    expect(signatureReminder(agreed, given).payload.showPayload).toBe('jr:a1');
  });
});

describe('subsidy, bank and layout reminders', () => {
  it('ask again with the same buttons, by the approved template of each', () => {
    expect(confirmReminder(ask({ kind: 'subsidy_register' }), given)).toEqual({
      template: 'subsidy_register_help',
      payload: { ...given, donePayload: 'stp:ok:a1', helpPayload: 'stp:alt:a1' },
    });
    expect(confirmReminder(ask({ kind: 'subsidy_credit', amountPaise: 7800000 }), given)).toEqual({
      template: 'subsidy_credit_check',
      payload: {
        ...given,
        amount: '₹78,000',
        yesPayload: 'stp:ok:a1',
        notYetPayload: 'stp:alt:a1',
      },
    });
    expect(
      confirmReminder(
        ask({ kind: 'bank_sign', bank: 'HDFC Bank', branch: 'Sangli', dayText: 'Thu 6 Nov' }),
        given,
      ),
    ).toEqual({
      template: 'bank_sign_visit',
      payload: {
        customer: 'Tejas',
        bank: 'HDFC Bank',
        branch: 'Sangli',
        day: 'Thu 6 Nov',
        goPayload: 'stp:ok:a1',
        changePayload: 'stp:alt:a1',
      },
    });
    expect(confirmReminder(ask({ kind: 'layout', paperTitle: 'Roof layout' }), given)).toEqual({
      template: 'signature_reminder',
      payload: { ...given, document: 'Roof layout', showPayload: 'jr:a1' },
    });
  });

  it('a subsidy that has not arrived waits for the money, not for another reminder', () => {
    expect(isSubsidyWait(ask({ kind: 'subsidy_credit', answer: 'not_yet' }))).toBe(true);
    expect(isSubsidyWait(ask({ kind: 'subsidy_credit' }))).toBe(false);
    expect(isSubsidyWait(ask({ kind: 'site_ready', answer: 'not_yet' }))).toBe(false);
  });

  it('tells the asker what they have not done', () => {
    expect(waitingFor(ask({ kind: 'subsidy_register' }))).toBe('the PM Surya Ghar registration');
    expect(waitingFor(ask({ kind: 'bank_sign' }))).toBe('an answer about the visit to the bank');
    expect(waitingFor(ask({ kind: 'layout' }))).toBe('an answer about the panel layout');
  });
});
