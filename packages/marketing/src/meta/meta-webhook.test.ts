import { describe, expect, it } from 'vitest';
import { readMetaWebhook } from './meta-webhook';

const own = { pageId: 'PAGE', instagramId: 'IG' };

describe('readMetaWebhook', () => {
  it('reads a lead', () => {
    const events = readMetaWebhook(
      {
        object: 'page',
        entry: [
          {
            id: 'PAGE',
            time: 1,
            changes: [
              {
                field: 'leadgen',
                value: {
                  leadgen_id: 'L1',
                  page_id: 'PAGE',
                  ad_id: 'AD',
                  form_id: 'F',
                  created_time: 1762000000,
                },
              },
            ],
          },
        ],
      },
      own,
    );
    expect(events).toEqual([
      {
        kind: 'lead',
        key: 'meta:lead:L1',
        leadgenId: 'L1',
        pageId: 'PAGE',
        adId: 'AD',
        formId: 'F',
        at: new Date(1762000000 * 1000),
      },
    ]);
  });

  it('reads a message with an ad referral and skips echoes and our own', () => {
    const events = readMetaWebhook(
      {
        object: 'page',
        entry: [
          {
            id: 'PAGE',
            messaging: [
              {
                sender: { id: 'U1' },
                timestamp: 1762000000000,
                message: { mid: 'm1', text: 'Hi', attachments: [{}] },
                referral: { ad_id: 'AD9', ads_context_data: { ad_title: 'Solar' } },
              },
              { sender: { id: 'PAGE' }, message: { mid: 'm2', text: 'reply', is_echo: true } },
              { sender: { id: 'PAGE' }, message: { mid: 'm3', text: 'ours' } },
              {
                sender: { id: 'U2' },
                postback: { mid: 'm4', title: 'Start', referral: { ad_id: 'AD8' } },
              },
            ],
          },
        ],
      },
      own,
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: 'message',
      key: 'meta:msg:m1',
      channel: 'messenger',
      senderId: 'U1',
      text: 'Hi',
      attachments: 1,
      adId: 'AD9',
      adTitle: 'Solar',
      at: new Date(1762000000000),
    });
    expect(events[1]).toMatchObject({ key: 'meta:msg:m4', adId: 'AD8', text: 'Start' });
  });

  it('reads Facebook comments and skips our own page', () => {
    const feed = (from: string, verb = 'add') => ({
      field: 'feed',
      value: {
        item: 'comment',
        verb,
        comment_id: `C-${from}`,
        post_id: 'P1',
        message: 'Price?',
        from: { id: from, name: 'Ravi' },
        created_time: 1762000000,
      },
    });
    const events = readMetaWebhook(
      {
        object: 'page',
        entry: [{ id: 'PAGE', changes: [feed('U1'), feed('PAGE'), feed('U3', 'edited')] }],
      },
      own,
    );
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'comment',
        key: 'meta:comment:C-U1',
        channel: 'messenger',
        senderName: 'Ravi',
        postId: 'P1',
        text: 'Price?',
      }),
    ]);
  });

  it('reads Instagram messages and comments, skipping our own', () => {
    const events = readMetaWebhook(
      {
        object: 'instagram',
        entry: [
          {
            id: 'IG',
            time: 1762000000000,
            messaging: [
              { sender: { id: 'S1' }, message: { mid: 'im1', text: 'hello' } },
              { sender: { id: 'IG' }, message: { mid: 'im2', is_echo: true } },
            ],
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'IC1',
                  text: 'Nice',
                  from: { id: 'S2', username: 'asha' },
                  media: { id: 'M1' },
                },
              },
              {
                field: 'comments',
                value: { id: 'IC2', text: 'mine', from: { id: 'IG', username: 'us' } },
              },
            ],
          },
        ],
      },
      own,
    );
    expect(events.map((e) => e.key)).toEqual(['meta:msg:im1', 'meta:comment:IC1']);
    expect(events[0]).toMatchObject({ channel: 'instagram', senderId: 'S1' });
    expect(events[1]).toMatchObject({ channel: 'instagram', senderName: 'asha', postId: 'M1' });
  });

  it('never throws on odd input', () => {
    for (const body of [
      null,
      'x',
      5,
      {},
      { object: 'page' },
      { object: 'page', entry: [null, 3, { changes: 'no', messaging: [{}] }] },
    ]) {
      expect(readMetaWebhook(body, own)).toEqual([]);
    }
  });

  it('drops entries from other Pages and accounts, or when ours is unknown', () => {
    const page = (id: string) => ({
      object: 'page',
      entry: [
        {
          id,
          time: 1,
          changes: [{ field: 'leadgen', value: { leadgen_id: 'L1', page_id: id } }],
        },
      ],
    });
    expect(readMetaWebhook(page('OTHER'), own)).toEqual([]);
    expect(readMetaWebhook(page('PAGE'), { pageId: null, instagramId: 'IG' })).toEqual([]);
    expect(readMetaWebhook(page('PAGE'), own)).toHaveLength(1);
    const ig = {
      object: 'instagram',
      entry: [
        {
          id: 'OTHER_IG',
          changes: [
            {
              field: 'comments',
              value: { id: 'c1', text: 'hi', from: { id: 'U1', username: 'u' } },
            },
          ],
        },
      ],
    };
    expect(readMetaWebhook(ig, own)).toEqual([]);
    expect(readMetaWebhook({ ...ig, entry: [{ ...ig.entry[0], id: 'IG' }] }, own)).toHaveLength(1);
    expect(
      readMetaWebhook(
        { ...ig, entry: [{ ...ig.entry[0], id: 'IG' }] },
        { ...own, instagramId: null },
      ),
    ).toEqual([]);
  });
});
