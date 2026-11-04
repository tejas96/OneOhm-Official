import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readFileLink, sharedFileUrl, signFileLink } from './file-links';

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

  it('carries a lead’s estimate with the lead and no customer', () => {
    const estimate = {
      kind: 'estimate',
      id: 'e1',
      customerId: '',
      leadId: 'lead-1',
      exp: 2_000_000_000,
    } as const;
    const secret = 'a-long-secret-value';
    expect(readFileLink(secret, signFileLink(secret, estimate), 0)).toEqual(estimate);
  });

  it('still opens links made before reports had a key', () => {
    // Exactly how older links were made: the JSON of kind, id, customerId and exp.
    const data = Buffer.from(JSON.stringify(file)).toString('base64url');
    const mac = createHmac('sha256', 'a-long-secret-value').update(data).digest('base64url');
    expect(readFileLink('a-long-secret-value', `${data}.${mac}`, 0)).toEqual(file);
  });

  it('sharedFileUrl builds a link readFileLink accepts until FILE_LINK_HOURS pass', () => {
    const env = {
      API_PUBLIC_URL: 'https://api.example.test',
      FILE_LINK_SECRET: 'a-long-secret-value',
      FILE_LINK_HOURS: 2,
    };
    const now = 1_000_000_000_000;
    const url = sharedFileUrl(env, { kind: 'receipt', id: 'p1', customerId: 'c1' }, now);
    const prefix = 'https://api.example.test/v1/files/shared/';
    expect(url.startsWith(prefix)).toBe(true);
    const token = url.slice(prefix.length);
    const hours = 2 * 3600 * 1000;
    expect(readFileLink(env.FILE_LINK_SECRET, token, now + hours - 1)).toEqual({
      kind: 'receipt',
      id: 'p1',
      customerId: 'c1',
      exp: now / 1000 + 2 * 3600,
    });
    expect(readFileLink(env.FILE_LINK_SECRET, token, now + hours + 1)).toBeNull();
  });
});
