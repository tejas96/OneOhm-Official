import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readFileLink, signFileLink } from './file-links';

describe('shared file links', () => {
  const file = { kind: 'receipt', id: 'p1', customerId: 'c1', exp: 2_000_000_000 } as const;

  it('opens with the right secret before it expires', () => {
    const token = signFileLink('a-long-secret-value', file);
    expect(readFileLink('a-long-secret-value', token, 1_000_000_000_000)).toEqual(file);
  });

  it('refuses a changed, foreign or expired link', () => {
    const token = signFileLink('a-long-secret-value', file);
    expect(readFileLink('another-secret-value', token)).toBeNull();
    expect(readFileLink('a-long-secret-value', `x${token}`)).toBeNull();
    expect(readFileLink('a-long-secret-value', token, 2_000_000_001_000)).toBeNull();
  });

  it('carries tax invoices, and reports with their project and key', () => {
    const invoice = { kind: 'invoice', id: 'i1', customerId: 'c1', exp: 2_000_000_000 } as const;
    const report = { ...invoice, kind: 'report', id: 'project-1', key: 'wcr' } as const;
    const secret = 'a-long-secret-value';
    expect(readFileLink(secret, signFileLink(secret, invoice), 0)).toEqual(invoice);
    expect(readFileLink(secret, signFileLink(secret, report), 0)).toEqual(report);
  });

  it('still opens links made before reports had a key', () => {
    // Exactly how older links were made: the JSON of kind, id, customerId and exp.
    const data = Buffer.from(JSON.stringify(file)).toString('base64url');
    const mac = createHmac('sha256', 'a-long-secret-value').update(data).digest('base64url');
    expect(readFileLink('a-long-secret-value', `${data}.${mac}`, 0)).toEqual(file);
  });
});
