import { describe, expect, it } from 'vitest';
import { CUSTOMER_DOCUMENT_CATEGORIES } from './customer-categories';
import {
  paperVersion,
  readSystemPaperKey,
  SYSTEM_PAPER_CATEGORY,
  systemPaperAction,
  systemPaperKey,
} from './system-papers';

const ID = '3f2a9c1e-0b7d-4e55-9a21-6c8d2f1b7e40';

describe('system papers', () => {
  it('stores one file per source and version, and reads the key back', () => {
    const key = systemPaperKey('receipt', ID, 'issued');
    expect(key).toBe(`system/receipt/${ID}/issued.pdf`);
    expect(readSystemPaperKey(key)).toEqual({ kind: 'receipt', sourceId: ID, version: 'issued' });
  });

  it('ignores files that are not system papers', () => {
    expect(readSystemPaperKey(`projects/${ID}/photo.jpg`)).toBeNull();
    expect(readSystemPaperKey(`system/brochure/${ID}/v1.pdf`)).toBeNull();
    expect(() => systemPaperKey('invoice', '../x', 'v')).toThrow();
  });

  it('files a paper once, again only when its version changes', () => {
    const wanted = systemPaperKey('invoice', ID, 'cancelled');
    expect(systemPaperAction(null, wanted)).toBe('file');
    expect(systemPaperAction(wanted, wanted)).toBe('keep');
    expect(systemPaperAction(systemPaperKey('invoice', ID, 'issued'), wanted)).toBe('refile');
  });

  it('gives the same version for the same parts and a new one when they change', () => {
    const open = paperVersion(['open', '2026-11-04', 1_200_000, null]);
    expect(paperVersion(['open', '2026-11-04', 1_200_000, null])).toBe(open);
    expect(paperVersion(['cancelled', '2026-11-04', 1_200_000, 'Customer cancelled'])).not.toBe(
      open,
    );
    expect(open).toMatch(/^[a-z0-9]+$/);
  });

  it('never files work orders where customers can see them', () => {
    expect(CUSTOMER_DOCUMENT_CATEGORIES as readonly string[]).not.toContain(
      SYSTEM_PAPER_CATEGORY.work_order,
    );
    expect(CUSTOMER_DOCUMENT_CATEGORIES as readonly string[]).toContain(
      SYSTEM_PAPER_CATEGORY.receipt,
    );
  });
});
