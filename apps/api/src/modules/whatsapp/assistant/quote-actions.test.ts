import { describe, expect, it } from 'vitest';
import { readQuoteTap } from './quote-actions';

const ID = '7f1c2a9e-1111-4222-8333-444455556666';

describe('a tap on a quote button', () => {
  it('reads accept, confirm and ask with the quotation id', () => {
    expect(readQuoteTap(`quote_accept:${ID}`)).toEqual({ action: 'accept', quotationId: ID });
    expect(readQuoteTap(`quote_yes:${ID}`)).toEqual({ action: 'confirm', quotationId: ID });
    expect(readQuoteTap(`quote_ask:${ID}`)).toEqual({ action: 'ask', quotationId: ID });
    expect(readQuoteTap(`quote_show:${ID}`)).toEqual({ action: 'show', quotationId: ID });
  });

  it('is not a quote tap for anything else', () => {
    expect(readQuoteTap('menu')).toBeNull();
    expect(readQuoteTap('quote_accept:')).toBeNull();
    expect(readQuoteTap(`quote_maybe:${ID}`)).toBeNull();
    expect(readQuoteTap(null)).toBeNull();
  });
});
