import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ageRaisedProblem,
  bodyOf,
  filesOn,
  requestsOf,
  sendPhoto,
  sendVideo,
  sendVoice,
} from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat } from '../support/send';
import { askAboutFiles, questions } from '../support/what-is-this';

// Photos, videos and voice notes that arrive during the problem report, or within two minutes of
// Done (WhatsApp delivers a burst a few seconds after it), join the problem on their own: one
// reply for the burst, no question, no hand-over. Later, a photo or a video is asked about.

describe('Problem: files that arrive with or after the report', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  async function raised(name: string, language?: 'mr') {
    const sale = await sellProject(admin, { name });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    if (language) await tap(phone, `lang:${language}`);
    await tap(phone, 'go:problem');
    await tap(phone, 'pb:what:nopower');
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    return { sale, phone, requestId: request?.id ?? '', customerId: sale.customer.customerId };
  }
  const stateOf = async (phone: string) =>
    (
      await rows<{ state: string }>('SELECT state FROM wa_conversations WHERE phone = $1', [phone])
    )[0]?.state;

  it('a video then two photos 1 to 3 seconds after Done join the problem with one reply', async () => {
    const { phone, requestId } = await raised('Burst After Done (test)');
    const before = (await replies(phone)).length;
    await sendVideo(phone);
    await sendPhoto(phone);
    await sendPhoto(phone);
    // Attached at once; nothing is said until the burst is over.
    expect((await filesOn(requestId)).map((f) => f.content_type).sort()).toEqual([
      'image/png',
      'image/png',
      'video/mp4',
    ]);
    expect((await replies(phone)).length).toBe(before);
    expect(await stateOf(phone)).not.toBe('human');
    expect(await questions(phone)).toHaveLength(0);
    await askAboutFiles(admin);
    const said = await lastReply(phone);
    expect(said?.body).toBe('Added 2 photos and 1 video to your problem ✅');
    expect(said?.buttons?.map((b) => b.title)).toEqual(['My problems', 'Menu']);
    // One reply: running again, or a late timer, says nothing more.
    await askAboutFiles(admin, 600);
    expect((await replies(phone)).length).toBe(before + 1);
    expect(await questions(phone)).toHaveLength(0);
    expect(await stateOf(phone)).not.toBe('human');
  });

  it('one photo is "1 photo"; a voice note is counted too', async () => {
    const { phone, requestId } = await raised('Singular (test)');
    await sendPhoto(phone);
    await askAboutFiles(admin);
    expect(await bodyOf(phone)).toBe('Added 1 photo to your problem ✅');
    await sendVoice(phone);
    await sendVideo(phone);
    await askAboutFiles(admin, 120);
    expect(await bodyOf(phone)).toBe('Added 1 video and 1 voice note to your problem ✅');
    expect(await filesOn(requestId)).toHaveLength(3);
  });

  it('the count is said in Marathi', async () => {
    const { phone } = await raised('Marathi Burst (test)', 'mr');
    await sendPhoto(phone);
    await sendPhoto(phone);
    await sendVideo(phone);
    await askAboutFiles(admin);
    expect(await bodyOf(phone)).toBe('तुमच्या समस्येला 2 फोटो आणि 1 व्हिडिओ जोडले ✅');
  });

  it('a video sent during the questions joins the report when it is raised, without a hand-over', async () => {
    const sale = await sellProject(admin, { name: 'Video In Flow (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    await sendVideo(phone);
    expect(await stateOf(phone)).not.toBe('human');
    await tap(phone, 'pb:what:damage');
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    expect((await filesOn(request?.id ?? '')).map((f) => f.content_type)).toEqual(['video/mp4']);
    expect(await stateOf(phone)).not.toBe('human');
  });

  it('after the two minutes a photo and a video are asked about, and Yes attaches them', async () => {
    const { phone, requestId, customerId } = await raised('Three Minutes (test)');
    await ageRaisedProblem(phone, 180);
    await sendVideo(phone);
    // Not a hand-over: the chat stays with the assistant and nothing is attached unasked.
    expect(await stateOf(phone)).not.toBe('human');
    expect(await filesOn(requestId)).toHaveLength(0);
    await askAboutFiles(admin);
    const question = await lastReply(phone);
    expect(question?.body).toBe('Is this for the problem you told us about?');
    await tap(phone, 'what:probadd');
    expect((await filesOn(requestId)).map((f) => f.content_type)).toEqual(['video/mp4']);
    expect(await requestsOf(customerId)).toHaveLength(1);
  });

  it('a video with no problem open is a normal file: it goes to their person', async () => {
    const sale = await sellProject(admin, { name: 'Video No Problem (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await sendVideo(phone);
    expect(await bodyOf(phone)).toMatch(/^Thank you for the video\. .+ will watch it/);
  });
});
