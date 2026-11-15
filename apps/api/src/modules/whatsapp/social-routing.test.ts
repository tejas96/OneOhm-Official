import { describe, expect, it } from 'vitest';
import { canAnswerAutomatically } from '../marketing-intake/social-message';
import { chooseSocialTarget, laterDm, withComment } from './social-reply';

const now = new Date('2026-11-15T12:00:00Z');
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

describe('where a staff reply on Instagram or Facebook goes', () => {
  it('is a message while their last message is under 24 hours old', () => {
    expect(chooseSocialTarget({ lastDmAt: ago(23) }, 'p1', null, now)).toEqual({
      recipientId: 'p1',
      commentId: null,
    });
  });

  it('is a private reply to the newest comment with none yet, within 7 days', () => {
    const context = {
      lastDmAt: ago(30),
      comments: [
        { id: 'c1', at: ago(100) },
        { id: 'c2', at: ago(50) },
        { id: 'c3', at: ago(10) },
      ],
      repliedComments: ['c3'],
    };
    expect(chooseSocialTarget(context, 'p1', null, now)).toEqual({
      recipientId: null,
      commentId: 'c2',
    });
  });

  it('is refused when the message and every comment are out of time or answered', () => {
    expect(
      chooseSocialTarget(
        { lastDmAt: ago(30), comments: [{ id: 'old', at: ago(24 * 8) }] },
        'p1',
        null,
        now,
      ),
    ).toBeNull();
    expect(
      chooseSocialTarget(
        { comments: [{ id: 'a', at: ago(1) }], repliedComments: ['a'] },
        'p1',
        null,
        now,
      ),
    ).toBeNull();
  });

  it('falls back on the last inbound time for a chat saved before these were kept', () => {
    expect(chooseSocialTarget({ messaged: true }, 'p1', ago(2), now)?.recipientId).toBe('p1');
    expect(chooseSocialTarget({ lastCommentId: 'c9' }, 'p1', ago(2), now)?.commentId).toBe('c9');
  });
});

describe('what a chat remembers', () => {
  it('keeps the newest 20 comments and the later message time', () => {
    let context: { comments?: { id: string; at: string }[] } = {};
    for (let i = 0; i < 25; i++)
      context = { comments: withComment(context, `c${i}`, new Date(now.getTime() + i * 1000)) };
    expect(context.comments).toHaveLength(20);
    expect(context.comments?.[19]?.id).toBe('c24');
    expect(laterDm({ lastDmAt: ago(1) }, new Date(ago(5)))).toBe(ago(1));
    expect(laterDm({ lastDmAt: ago(5) }, new Date(ago(1)))).toBe(ago(1));
  });
});

describe('the automatic first reply', () => {
  const event = (kind: 'message' | 'comment', hours: number) =>
    ({ kind, at: new Date(Date.now() - hours * 3_600_000) }) as never;
  it('is skipped for a message older than 24 hours or a comment older than 7 days', () => {
    expect(canAnswerAutomatically(event('message', 2))).toBe(true);
    expect(canAnswerAutomatically(event('message', 25))).toBe(false);
    expect(canAnswerAutomatically(event('comment', 25))).toBe(true);
    expect(canAnswerAutomatically(event('comment', 24 * 8))).toBe(false);
  });
});
