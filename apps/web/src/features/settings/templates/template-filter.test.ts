import { describe, expect, it } from 'vitest';
import { withoutMarketing } from './template-filter';

describe('withoutMarketing', () => {
  it('drops marketing messages and keeps the rest in order', () => {
    const rows = [{ key: 'payment_due' }, { key: 'self_survey_offer' }, { key: 'visit_reminder' }];
    expect(withoutMarketing(rows).map((row) => row.key)).toEqual(['payment_due', 'visit_reminder']);
  });
});
