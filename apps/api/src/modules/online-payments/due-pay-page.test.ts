import { describe, expect, it } from 'vitest';
import { payPage } from './due-pay.controller';

describe('the pay landing page', () => {
  it('asks search engines and link checkers not to index it or follow Continue', () => {
    const html = payPage('<p>Pay</p>', true);
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('<a class="go" href="?go=1" rel="nofollow">Continue to pay</a>');
  });
});
