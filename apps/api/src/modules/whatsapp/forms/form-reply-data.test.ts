import { describe, expect, it } from 'vitest';
import { readForm } from './form-reply-data';
import { encryptFormMedia } from './media-encrypt';

const reply = (data: unknown) => JSON.stringify(data);

describe('reading a form reply (nfm_reply response_json)', () => {
  it('reads our token and files that came as ordinary media ids', () => {
    const form = readForm(
      reply({
        flow_token: 'tok',
        files: [
          { id: 'm1', file_name: 'front.jpg', mime_type: 'image/jpeg', sha256: 'x' },
          { id: 'm2', file_name: 'back.pdf', mime_type: 'application/pdf', sha256: 'y' },
        ],
      }),
    );
    expect(form.token).toBe('tok');
    expect(form.files).toEqual([
      { kind: 'media', id: 'm1', fileName: 'front.jpg', mimeType: 'image/jpeg' },
      { kind: 'media', id: 'm2', fileName: 'back.pdf', mimeType: 'application/pdf' },
    ]);
  });

  it('reads files with a CDN address and their encryption metadata', () => {
    const { meta } = encryptFormMedia(Buffer.from('x'));
    const form = readForm(
      reply({
        flow_token: 'tok',
        files: [
          {
            media_id: 'c1',
            cdn_url: 'https://cdn/x',
            file_name: 'a.jpg',
            encryption_metadata: meta,
          },
        ],
      }),
    );
    expect(form.files).toEqual([
      { kind: 'cdn', id: 'c1', url: 'https://cdn/x', fileName: 'a.jpg', meta },
    ]);
  });

  it('skips a CDN file without all its keys, keeps at most four, and survives bad JSON', () => {
    const files = Array.from({ length: 7 }, (_, n) => ({ id: `m${n}` }));
    expect(readForm(reply({ flow_token: 't', files })).files).toHaveLength(4);
    expect(
      readForm(reply({ files: [{ cdn_url: 'https://x', encryption_metadata: { iv: 'a' } }] }))
        .files,
    ).toEqual([]);
    expect(readForm('not json')).toEqual({ token: null, files: [] });
    expect(readForm(undefined)).toEqual({ token: null, files: [] });
  });
});
