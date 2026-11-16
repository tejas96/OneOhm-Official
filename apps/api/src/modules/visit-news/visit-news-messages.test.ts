import { describe, expect, it } from 'vitest';
import { inLanguage } from '../whatsapp/assistant/language';
import { arrivedMessage, checkMessage, onWayMessage } from './visit-news-messages';

const ID = '7d3c2a10-1111-4abc-8def-0123456789ab';
const said = { customer: 'ramesh patil', worker: 'Ravi', home: 'Sangli' };

describe('the site visit messages', () => {
  it('on the way: a link button in the chat, the token on the template', () => {
    const built = onWayMessage({
      ...said,
      minutes: 15,
      token: 'tok.en',
      url: 'https://x/track/tok.en',
    });
    expect(built.replies[0]).toMatchObject({ kind: 'cta_url', label: 'Track live' });
    expect(built.replies[0]).toMatchObject({ url: 'https://x/track/tok.en' });
    expect(built.template).toEqual({
      key: 'worker_on_way',
      payload: {
        customer: 'Ramesh Patil',
        worker: 'Ravi',
        home: 'Sangli',
        minutes: '15',
        trackToken: 'tok.en',
      },
    });
  });

  it('arrived: plain words', () => {
    expect(arrivedMessage(said).replies[0]).toEqual({
      kind: 'text',
      body: '*Ravi* from OneOhm has reached *Sangli*.',
    });
  });

  it('the visit check: Yes and No carry the site visit, in the customer language', async () => {
    const built = await inLanguage('mr', async () => checkMessage({ ...said, siteVisitId: ID }));
    expect(built.replies[0]).toMatchObject({
      kind: 'buttons',
      buttons: [
        { id: `vc:y:${ID}`, title: 'हो, आले होते' },
        { id: `vc:n:${ID}`, title: 'नाही' },
      ],
    });
    expect(built.template.payload).toMatchObject({
      yesPayload: `vc:y:${ID}`,
      noPayload: `vc:n:${ID}`,
    });
  });
});
