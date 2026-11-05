import { describe, expect, it } from 'vitest';
import { readForm } from './form-reply-data';

const reply = (data: unknown) => JSON.stringify(data);
const file = (id: string, name = 'a.jpg', mime = 'image/jpeg') => ({
  id,
  file_name: name,
  mime_type: mime,
  sha256: `h-${id}`,
});

describe('reading a form reply (nfm_reply response_json)', () => {
  it('reads our token and the photos of the first screen', () => {
    const form = readForm(reply({ flow_token: 'tok', photos: [file('m1'), file('m2', 'b.jpg')] }));
    expect(form.token).toBe('tok');
    expect(form.files).toEqual([
      { id: 'm1', fileName: 'a.jpg', mimeType: 'image/jpeg', sha256: 'h-m1' },
      { id: 'm2', fileName: 'b.jpg', mimeType: 'image/jpeg', sha256: 'h-m2' },
    ]);
    expect(form.keys).toEqual(['flow_token', 'photos']);
  });

  it('reads the PDFs of the second screen alone', () => {
    const form = readForm(
      reply({ flow_token: 'tok', pdfs: [file('p1', 'bill.pdf', 'application/pdf')] }),
    );
    expect(form.files.map((one) => one.id)).toEqual(['p1']);
  });

  it('still reads `files` (the first version of the flow)', () => {
    expect(readForm(reply({ flow_token: 't', files: [file('f1')] })).files).toHaveLength(1);
  });

  it('keeps at most four files, skips entries without an id, and survives bad JSON', () => {
    const many = Array.from({ length: 7 }, (_, n) => ({ id: `m${n}` }));
    expect(readForm(reply({ flow_token: 't', photos: many })).files).toHaveLength(4);
    expect(readForm(reply({ photos: [{ file_name: 'x' }, null, 'x'] })).files).toEqual([]);
    expect(readForm('not json')).toEqual({
      token: null,
      files: [],
      answers: {},
      named: {},
      amount: null,
      date: null,
      keys: [],
    });
    expect(readForm(undefined)).toEqual({
      token: null,
      files: [],
      answers: {},
      named: {},
      amount: null,
      date: null,
      keys: [],
    });
  });

  it('reads the amount and day of the I paid another way form, as text or numbers', () => {
    const form = readForm(
      JSON.stringify({
        flow_token: 't',
        amount: 45000,
        date: '2026-11-03',
        photos: [{ id: 'm1', file_name: 'p.jpg' }],
      }),
    );
    expect(form).toMatchObject({ amount: '45000', date: '2026-11-03' });
    expect(form.files).toHaveLength(1);
    expect(readForm(JSON.stringify({ amount: ' 1,200 ', date: 1762128000000 }))).toMatchObject({
      amount: '1,200',
      date: '1762128000000',
    });
  });

  it('reads the self survey: answers by name and one photo per screen', () => {
    const form = readForm(
      reply({
        flow_token: 't',
        roof: 'rcc',
        floors: '2',
        shade: 'none',
        size: 'unknown',
        consumer: ' 12345 ',
        corner_a: [{ id: 'a', file_name: 'a.jpg' }],
        meter: [{ id: 'm' }],
        board: 'nope',
      }),
    );
    expect(form.answers).toEqual({
      roof: 'rcc',
      floors: '2',
      shade: 'none',
      size: 'unknown',
      consumer: '12345',
    });
    expect(Object.keys(form.named)).toEqual(['corner_a', 'meter']);
    expect(form.files).toEqual([]);
  });
});
