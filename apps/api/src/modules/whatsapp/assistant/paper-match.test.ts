import { describe, expect, it } from 'vitest';
import {
  type EarlierPaper,
  matchPaper,
  type OpenPaper,
  paperRows,
  papersForHome,
  paperTapped,
  paperWaitOf,
  rememberedPaper,
  savedWords,
} from './paper-match';

const HOME = '11111111-1111-4111-8111-111111111111';
const FARM = '22222222-2222-4222-8222-222222222222';
const paper = (id: string, category: string, propertyId: string | null): OpenPaper => ({
  id,
  title: `${id} title`,
  category,
  propertyId,
});
const kyc = paper('kyc', 'customer_kyc', HOME);
const bill = paper('bill', 'electricity_bill', HOME);
const deed = paper('deed', 'property', FARM);
const MIN = 60_000;

describe('papersForHome', () => {
  it('takes only the site papers of that home, never a person paper', () => {
    expect(papersForHome([kyc, bill, deed], { propertyId: FARM }, 2)).toEqual([deed]);
    expect(papersForHome([kyc, bill, deed], { propertyId: HOME }, 2)).toEqual([bill]);
  });

  it('gives the person row the ID and income papers', () => {
    const income = paper('income', 'income_proof', null);
    expect(papersForHome([kyc, bill, income], { propertyId: 'person' }, 2)).toEqual([kyc, income]);
  });

  it('lets one home answer person papers only when nothing else is open (decision 2)', () => {
    expect(papersForHome([kyc], { propertyId: HOME }, 1)).toEqual([kyc]);
    expect(papersForHome([kyc, bill], { propertyId: HOME }, 1)).toEqual([bill]);
    expect(papersForHome([kyc], { propertyId: HOME }, 2)).toEqual([]);
  });
});

describe('matchPaper', () => {
  const earlier = (status: string): EarlierPaper => ({
    id: 'kyc',
    title: 'Aadhaar',
    status,
    documentId: status === 'received' ? 'doc-1' : null,
  });
  const remembered = { requestId: 'kyc', propertyId: HOME, at: 0 };

  it('files with none open, answers one, asks for two or more', () => {
    expect(matchPaper({ open: [], remembered: null, earlier: null })).toEqual({ kind: 'file' });
    expect(matchPaper({ open: [bill], remembered: null, earlier: null })).toEqual({
      kind: 'answer',
      request: bill,
    });
    expect(matchPaper({ open: [bill, kyc], remembered: null, earlier: null })).toEqual({
      kind: 'ask',
    });
  });

  it('files the next file of the batch with the paper it answered', () => {
    expect(matchPaper({ open: [bill, deed], remembered, earlier: earlier('received') })).toEqual({
      kind: 'same',
      title: 'Aadhaar',
      documentId: 'doc-1',
    });
  });

  it('answers the picked paper while it is still open, and files after "Something else"', () => {
    expect(matchPaper({ open: [bill, kyc], remembered, earlier: earlier('open') })).toEqual({
      kind: 'answer',
      request: kyc,
    });
    const none = { requestId: 'none', propertyId: HOME, at: 0 };
    expect(matchPaper({ open: [bill], remembered: none, earlier: null })).toEqual({
      kind: 'file',
    });
  });

  it('falls back to the rule when the picked paper was cancelled', () => {
    expect(matchPaper({ open: [bill], remembered, earlier: earlier('cancelled') })).toEqual({
      kind: 'answer',
      request: bill,
    });
  });
});

describe('the chat memory', () => {
  it('keeps the picked paper 30 minutes, for the same home only', () => {
    const context = { filePaper: { requestId: 'kyc', propertyId: HOME, at: 0 } };
    expect(rememberedPaper(context, { propertyId: HOME }, 29 * MIN)?.requestId).toBe('kyc');
    expect(rememberedPaper(context, { propertyId: FARM }, MIN)).toBeNull();
    expect(rememberedPaper(context, { propertyId: HOME }, 31 * MIN)).toBeNull();
  });

  it('keeps the waiting files while the question is fresh', () => {
    const context = { paperWait: { propertyId: HOME, at: 0, ids: ['a'] } };
    expect(paperWaitOf(context, 10 * MIN)?.ids).toEqual(['a']);
    expect(paperWaitOf(context, 31 * MIN)).toBeNull();
    expect(paperWaitOf({}, 0)).toBeNull();
  });
});

describe('the which-paper list', () => {
  it('reads a tap, and only a well-formed one', () => {
    expect(paperTapped(`fpaper:${HOME}`)).toBe(HOME);
    expect(paperTapped('fpaper:none')).toBe('none');
    expect(paperTapped('fpaper:1; drop')).toBeNull();
    expect(paperTapped(null)).toBeNull();
  });

  it('lists at most nine papers, then "Something else"', () => {
    const many = Array.from({ length: 12 }, (_, n) => paper(`p${n}`, 'other', HOME));
    const rows = paperRows(many, (title) => title.slice(0, 3), 'Something else');
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({ id: 'fpaper:p0', title: 'p0 ' });
    expect(rows.at(-1)).toEqual({ id: 'fpaper:none', title: 'Something else' });
  });

  it('says what was saved, for which home, and what that home still needs', () => {
    const words = {
      savedFor: (kind: string, home: string) => `Saved ${kind} at ${home}.`,
      paperSaved: (kind: string) => `Got ${kind}.`,
      paperRefused: (title: string) => `Not ${title}.`,
      stillNeeded: (list: string) => `Still: ${list}.`,
    };
    expect(savedWords(words, 'Pune', 'Bill', null, [deed])).toBe(
      'Saved Bill at Pune.\n\nStill: deed title.',
    );
    expect(savedWords(words, null, 'photo', 'Bill', [])).toBe('Got photo.\n\nNot Bill.');
  });
});
