import { describe, expect, it } from 'vitest';
import { leadCampaignInputSchema } from './lead-campaign.schema';

describe('lead campaign input', () => {
  it('refuses a word the WhatsApp opener never reads as a code', () => {
    for (const code of ['menu', 'HELP', 'start', 'Code']) {
      expect(leadCampaignInputSchema.safeParse({ code, name: 'Diwali ads' }).success).toBe(false);
    }
  });

  it('takes an ordinary code, uppercased', () => {
    const parsed = leadCampaignInputSchema.parse({ code: 'diwali-26', name: 'Diwali ads' });
    expect(parsed.code).toBe('DIWALI-26');
  });
});
