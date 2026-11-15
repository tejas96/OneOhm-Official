import { describe, expect, it } from 'vitest';
import { fakeGraph, launchInput, metaAccess, metaApp, status } from './meta-test-kit';
import { createMetaTools } from './meta-tools';

const instant = async () => {};

describe('meta tools', () => {
  const media = launchInput().media;

  it('publishes a Facebook photo and video', async () => {
    const { fetch, calls } = fakeGraph({
      'POST page1/photos': { id: 'ph1', post_id: 'page1_55' },
      'POST page1/videos': { id: 'v1' },
    });
    const tools = createMetaTools(metaAccess(), metaApp(fetch), { sleep: instant });
    const photo = await tools.publishPost({ channel: 'facebook', text: 'Hi', media });
    expect(photo.postId).toBe('page1_55');
    expect(calls[0]?.body).toEqual({ url: media.publicUrl, message: 'Hi' });
    await tools.publishPost({
      channel: 'facebook',
      text: 'Vid',
      media: { ...media, kind: 'video' },
    });
    expect(calls[1]?.body).toEqual({ file_url: media.publicUrl, description: 'Vid' });
  });

  it('publishes to Instagram after the file is ready', async () => {
    let polls = 0;
    const { fetch, calls } = fakeGraph({
      'POST ig1/media': { id: 'cr1' },
      'GET cr1': () => ({ status_code: ++polls < 2 ? 'IN_PROGRESS' : 'FINISHED' }),
      'POST ig1/media_publish': { id: 'pub1' },
      'GET pub1': { permalink: 'https://instagram.com/p/x' },
    });
    const tools = createMetaTools(metaAccess(), metaApp(fetch), { sleep: instant });
    const out = await tools.publishPost({
      channel: 'instagram',
      text: 'Cap',
      media: { ...media, kind: 'video' },
    });
    expect(out).toEqual({ postId: 'pub1', permalink: 'https://instagram.com/p/x' });
    expect(calls[0]?.body).toEqual({
      media_type: 'REELS',
      video_url: media.publicUrl,
      caption: 'Cap',
    });
    expect(calls.find((c) => c.path === 'ig1/media_publish')?.body).toEqual({ creation_id: 'cr1' });
  });

  it('sends a message to a person or privately to a comment', async () => {
    const { fetch, calls } = fakeGraph({ 'POST page1/messages': { message_id: 'mid1' } });
    const tools = createMetaTools(metaAccess(), metaApp(fetch));
    expect(
      await tools.sendMessage({
        channel: 'messenger',
        recipientId: 'U1',
        commentId: null,
        text: 'Hi',
      }),
    ).toEqual({ messageId: 'mid1' });
    await tools.sendMessage({
      channel: 'instagram',
      recipientId: null,
      commentId: 'C1',
      text: 'Hey',
    });
    expect(calls[0]?.body).toEqual({
      recipient: { id: 'U1' },
      messaging_type: 'RESPONSE',
      message: { text: 'Hi' },
    });
    expect(calls[1]?.body.recipient).toEqual({ comment_id: 'C1' });
  });

  it('reads a lead and normalises the phone', async () => {
    const { fetch } = fakeGraph({
      'GET L1': {
        id: 'L1',
        created_time: '2026-11-10T08:00:00+0000',
        ad_id: 'AD',
        form_id: 'F',
        campaign_id: 'C',
        platform: 'ig',
        field_data: [
          { name: 'full_name', values: ['Asha Rao'] },
          { name: 'phone_number', values: ['98765 43210'] },
          { name: 'city', values: ['Pune'] },
          { name: 'email', values: ['a@b.co'] },
        ],
      },
      'GET L2': {
        id: 'L2',
        field_data: [
          { name: 'full_name', values: ['<test lead: dummy data for full_name>'] },
          { name: 'phone_number', values: ['+919876543210'] },
        ],
      },
    });
    const tools = createMetaTools(metaAccess(), metaApp(fetch));
    expect(await tools.readLead('L1')).toMatchObject({
      platformLeadId: 'L1',
      name: 'Asha Rao',
      phone: '+919876543210',
      city: 'Pune',
      email: 'a@b.co',
      adId: 'AD',
      campaignExternalId: 'C',
      formId: 'F',
      platform: 'instagram',
      isTest: false,
      createdAt: new Date('2026-11-10T08:00:00Z'),
    });
    const test = await tools.readLead('L2');
    expect(test.isTest).toBe(true);
    expect(test.platform).toBe('facebook');
  });

  it('reads profile names and returns null on any error', async () => {
    const { fetch } = fakeGraph({
      'GET U1': { name: 'Ravi' },
      'GET S1': { username: 'asha', name: 'Asha' },
      'GET BAD': status(400, { error: { code: 100, message: 'x' } }),
    });
    const tools = createMetaTools(metaAccess(), metaApp(fetch));
    expect(await tools.profileName('messenger', 'U1')).toBe('Ravi');
    expect(await tools.profileName('instagram', 'S1')).toBe('@asha');
    expect(await tools.profileName('messenger', 'BAD')).toBeNull();
  });

  it.each([
    [{ code: 10, message: 'outside window' }],
    [{ code: 100, error_subcode: 2018108, message: 'already replied' }],
    [{ code: 551, message: 'unavailable' }],
  ])('says plainly when the reply window is closed (%j)', async (error) => {
    const { fetch } = fakeGraph({ 'POST page1/messages': status(400, { error }) });
    await expect(
      createMetaTools(metaAccess(), metaApp(fetch)).sendMessage({
        channel: 'instagram',
        recipientId: 'U1',
        commentId: null,
        text: 'Hi',
      }),
    ).rejects.toMatchObject({
      kind: 'invalid',
      message: expect.stringContaining('no longer lets us reply here'),
    });
  });
});
