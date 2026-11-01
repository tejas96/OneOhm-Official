import { describe, expect, it } from 'vitest';
import { requiredDocuments } from './required-documents';

const keys = (list: { key: string }[]) => list.map((item) => item.key);

describe('requiredDocuments', () => {
  it('asks a plain home for the basics', () => {
    const list = requiredDocuments({
      type: 'residential',
      loan: false,
      subsidy: false,
      nameChange: false,
    });
    expect(keys(list)).toEqual([
      'kyc',
      'bill',
      'property',
      'survey',
      'quotation',
      'net_metering',
      'handover',
      'warranty',
    ]);
  });

  it('adds loan, subsidy, society and name-change papers when they apply', () => {
    const list = requiredDocuments({
      type: 'society',
      loan: true,
      subsidy: true,
      nameChange: true,
    });
    expect(keys(list)).toEqual(
      expect.arrayContaining(['society', 'loan', 'subsidy_bank', 'name_change']),
    );
  });
});
