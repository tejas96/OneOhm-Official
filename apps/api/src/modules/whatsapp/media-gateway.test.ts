import { detectFileType } from '@oneohm/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnvironment } from '../../config/environment';
import {
  createMediaGateway,
  liveMediaGateway,
  logMediaGateway,
  MediaTooLargeError,
  mediaFileName,
} from './media-gateway';

const photo = { type: 'image', id: 'media-1', mimeType: 'image/jpeg', fileName: null } as const;
const paper = {
  type: 'document',
  id: 'media-2',
  mimeType: 'application/pdf',
  fileName: 'Light bill.pdf',
} as const;

describe('WhatsApp media in log mode', () => {
  it('stands in a real PNG for photos and a real PDF for papers', async () => {
    const lines: string[] = [];
    const gateway = logMediaGateway((line) => lines.push(line));
    const image = await gateway.download(photo);
    const pdf = await gateway.download(paper);
    expect(detectFileType(image.buffer)).toBe('image/png');
    expect(image.fileName).toBe('WhatsApp photo.png');
    expect(detectFileType(pdf.buffer)).toBe('application/pdf');
    expect(pdf.fileName).toBe('Light bill.pdf');
    expect(pdf.buffer.toString('latin1')).toMatch(/startxref\n\d+\n%%EOF/);
    expect(lines).toHaveLength(2);
  });

  it('names files after what the customer sent', () => {
    expect(mediaFileName(photo)).toBe('WhatsApp photo.jpg');
    expect(mediaFileName({ ...photo, type: 'audio' })).toBe('WhatsApp audio.ogg');
    expect(mediaFileName(paper)).toBe('Light bill.pdf');
  });
});

describe('WhatsApp media settings', () => {
  const base = { DATABASE_URL: 'postgres://x:y@localhost:5432/oneohm' };

  it('is log mode by default and never calls Meta', () => {
    expect(createMediaGateway(loadEnvironment(base)).mode).toBe('log');
  });

  it('needs the access token when live', () => {
    expect(() => loadEnvironment({ ...base, WHATSAPP_DELIVERY: 'live' })).toThrow(
      /WHATSAPP_ACCESS_TOKEN/,
    );
    const env = loadEnvironment({ ...base, WHATSAPP_DELIVERY: 'live', WHATSAPP_ACCESS_TOKEN: 't' });
    expect(createMediaGateway(env).mode).toBe('live');
  });
});

describe('WhatsApp media when live', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_API_VERSION: 'v25.0' };

  it('asks Graph for the URL, then fetches the file with the token', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ url: 'https://lookaside.example/f', file_size: 4 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4])));
    vi.stubGlobal('fetch', fetch);
    const file = await liveMediaGateway(env).download(paper);
    expect(file.buffer).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(fetch.mock.calls[0]?.[0]).toBe('https://graph.facebook.com/v25.0/media-2');
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ headers: { authorization: 'Bearer token' } });
  });

  it('refuses a file above the cap', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ url: 'https://lookaside.example/f' }))
        .mockResolvedValueOnce(new Response(new Uint8Array(20))),
    );
    await expect(liveMediaGateway(env, 10).download(photo)).rejects.toBeInstanceOf(
      MediaTooLargeError,
    );
  });
});
