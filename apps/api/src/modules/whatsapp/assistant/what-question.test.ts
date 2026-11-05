import { describe, expect, it } from 'vitest';
import { BUTTON_MAX, DESCRIPTION_MAX, ROW_MAX } from './chat-words';
import { inLanguage } from './language';
import { buildQuestion, type MissingRow, type QuestionInput } from './what-question';
import { WHAT_LISTS } from './what-words';

const base: QuestionInput = {
  count: 1,
  photos: true,
  each: null,
  stage: 'first',
  asked: [],
  missing: [],
  problem: false,
};
const bill = { id: 'a1', title: 'Electricity bill', home: 'Sangli', person: false };
const pan = { id: 'a2', title: 'PAN card', home: null, person: true };
const missing = (count: number): MissingRow[] =>
  Array.from({ length: count }, (_, n) => ({
    key: `k${n}`,
    propertyId: n % 2 ? 'p1' : null,
    title: `Paper ${n}`,
    home: n % 2 ? 'Sangli' : null,
  }));

describe('What is this? (redesign 5.2)', () => {
  it('one asked paper is a yes/no question naming the home', () => {
    const { reply, offered } = buildQuestion({ ...base, asked: [bill] });
    expect(offered).toBe('a1');
    expect(reply).toMatchObject({
      kind: 'buttons',
      body: 'Is this your *Electricity bill* for Sangli?',
      buttons: [
        { id: 'what:yes', title: 'Yes' },
        { id: 'what:more', title: 'Something else' },
      ],
    });
  });

  it('an ID paper never names a home', () => {
    const { reply } = buildQuestion({ ...base, asked: [pan] });
    expect(reply).toMatchObject({ body: 'Is this your *PAN card*?' });
  });

  it('two asked papers are a list with Something else', () => {
    const { reply } = buildQuestion({ ...base, asked: [bill, pan] });
    expect(reply.kind).toBe('list');
    const rows = reply.kind === 'list' ? reply.rows : [];
    expect(rows.map((row) => row.id)).toEqual(['what:a:a1', 'what:a:a2', 'what:more']);
    expect(rows[0]?.description).toBe('Sangli');
  });

  it('nothing asked lists the missing papers, then the three fixed rows', () => {
    const { reply } = buildQuestion({ ...base, missing: missing(2) });
    const rows = reply.kind === 'list' ? reply.rows : [];
    expect(rows.map((row) => row.id)).toEqual([
      'what:i:person:k0',
      'what:i:p1:k1',
      'what:pay',
      'what:prob',
      'what:other',
    ]);
  });

  it('keeps ten rows, trimming the missing papers and keeping the fixed ones', () => {
    for (const [count, fixed] of [
      [1, 3],
      [3, 4],
    ] as const) {
      const { reply } = buildQuestion({ ...base, count, missing: missing(20) });
      const rows = reply.kind === 'list' ? reply.rows : [];
      expect(rows).toHaveLength(10);
      expect(rows.slice(-fixed).map((row) => row.id)).toContain('what:other');
      expect(rows.filter((row) => row.id.startsWith('what:i:'))).toHaveLength(10 - fixed);
    }
  });

  it('a burst says the count and offers "They\'re different"', () => {
    const { reply } = buildQuestion({ ...base, count: 3 });
    expect(reply).toMatchObject({ body: 'Got your 3 photos ✅ What are they?' });
    const rows = reply.kind === 'list' ? reply.rows : [];
    expect(rows.at(-1)?.id).toBe('what:diff');
    const confirm = buildQuestion({ ...base, count: 3, asked: [bill] }).reply;
    expect(confirm.kind === 'buttons' ? confirm.buttons.map((b) => b.id) : []).toEqual([
      'what:yes',
      'what:more',
      'what:diff',
    ]);
  });

  it('asks about one file at a time after "They\'re different"', () => {
    const { reply } = buildQuestion({ ...base, count: 3, each: { n: 2, of: 3 } });
    expect(reply).toMatchObject({ body: 'File 2 of 3 — what is it?' });
    expect(reply.kind === 'list' ? reply.rows.map((row) => row.id) : []).not.toContain('what:diff');
  });

  it('only an ID paper says "For all your homes"; an unknown home says nothing', () => {
    const unknown = { id: 'a3', title: 'Sale deed', home: null, person: false };
    const { reply } = buildQuestion({ ...base, asked: [pan, unknown] });
    const rows = reply.kind === 'list' ? reply.rows : [];
    expect(rows[0]?.description).toBe('For all your homes');
    expect(rows[1]?.description).toBeUndefined();
  });

  it('offers a problem told a moment ago, never attaching the photo unasked', () => {
    const only = buildQuestion({ ...base, problem: true }).reply;
    expect(only).toMatchObject({
      kind: 'buttons',
      body: 'Is this a photo for the problem you told us about?',
    });
    expect(only.kind === 'buttons' ? only.buttons[0]?.id : '').toBe('what:probadd');
    const withPaper = buildQuestion({ ...base, problem: true, asked: [bill, pan] }).reply;
    expect(withPaper.kind === 'list' ? withPaper.rows[0]?.id : '').toBe('what:probadd');
    const nothing = buildQuestion({ ...base, problem: true, stage: 'more' }).reply;
    expect(nothing.kind === 'list' ? nothing.rows[0]?.title : '').toBe('Photo for your problem');
  });

  it('after Something else, never offers the asked papers again', () => {
    const { reply } = buildQuestion({ ...base, stage: 'more', asked: [bill, pan] });
    const rows = reply.kind === 'list' ? reply.rows : [];
    expect(rows.map((row) => row.id)).toEqual(['what:pay', 'what:prob', 'what:other']);
  });

  it('keeps every title and description within WhatsApp limits in all languages', async () => {
    for (const language of ['en', 'mr', 'hi'] as const) {
      const words = WHAT_LISTS[language];
      for (const title of Object.values(words.buttons))
        expect(title.length, `${language} "${title}"`).toBeLessThanOrEqual(BUTTON_MAX);
      for (const one of Object.values(words.rows)) {
        expect(one.title.length, `${language} "${one.title}"`).toBeLessThanOrEqual(ROW_MAX);
        expect(one.description.length, `${language} "${one.description}"`).toBeLessThanOrEqual(
          DESCRIPTION_MAX,
        );
      }
      expect(words.allHomes.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(words.choose.length).toBeLessThanOrEqual(BUTTON_MAX);
      await inLanguage(language, async () => {
        const { reply } = buildQuestion({ ...base, count: 3, missing: missing(20) });
        for (const one of reply.kind === 'list' ? reply.rows : []) {
          expect(one.title.length).toBeLessThanOrEqual(ROW_MAX);
          expect((one.description ?? '').length).toBeLessThanOrEqual(DESCRIPTION_MAX);
        }
      });
    }
  });

  it('says the same things in all three languages', () => {
    const shape = (value: unknown, path = ''): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, inner]) => shape(inner, `${path}.${key}`))
        : [path];
    for (const language of ['mr', 'hi'] as const)
      expect(shape(WHAT_LISTS[language]).sort()).toEqual(shape(WHAT_LISTS.en).sort());
  });
});
