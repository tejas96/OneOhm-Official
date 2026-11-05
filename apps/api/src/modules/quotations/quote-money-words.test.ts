import { DEFAULT_MILESTONES } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { inLanguage } from '../whatsapp/assistant/language';
import { QUOTE_MONEY_LISTS, quoteMoney } from './quote-money-words';

// The live quote: ₹1,83,969 with ₹78,000 subsidy on the default 25 / 65 / 10 plan.
const TOTAL = 18_396_900;
const SUBSIDY = 7_800_000;

describe('the money line on the quote and the accept check (live review C1)', () => {
  it('gives the full price, the 3 instalments in whole rupees and the subsidy', () => {
    const money = quoteMoney(TOTAL, SUBSIDY, DEFAULT_MILESTONES);
    expect(money.line).toBe(
      'Full price ₹1,83,969, paid in 3 parts: ₹45,992 on acceptance, ₹1,19,579 before dispatch, ₹18,398 after installation. Subsidy ₹78,000 comes back to your bank after switch-on, so your cost is ₹1,05,969.',
    );
    expect(money.first).toBe('₹45,992');
    expect(money.firstWhen).toBe('on acceptance');
    expect(QUOTE_MONEY_LISTS.en.confirm('₹1,83,969', '₹45,992', 'on acceptance')).toBe(
      'Accept your solar quotation for ₹1,83,969? The 1st instalment, ₹45,992, is due on acceptance.',
    );
  });

  // Fix round 1: the parts always add up to the full price shown.
  it('makes the last part the full price minus the others, and says when the 1st is due', () => {
    const steps = [
      { key: 'a', label: 'A', shareBp: 3333, trigger: 'material_dispatch' as const },
      { key: 'b', label: 'B', shareBp: 3333, trigger: 'material_dispatch' as const },
      { key: 'c', label: 'C', shareBp: 3334, trigger: 'commissioning_completed' as const },
    ];
    const money = quoteMoney(10_000_049, 0, steps);
    const amounts = [...money.line.matchAll(/₹([\d,]+)/g)].map((m) =>
      Number(m[1]?.replaceAll(',', '')),
    );
    const [total, ...parts] = amounts;
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
    expect(money.firstWhen).toBe('before dispatch');
  });

  it('leaves the subsidy out when there is none, and says it in Marathi and Hindi', async () => {
    expect(quoteMoney(TOTAL, 0, DEFAULT_MILESTONES).line).not.toContain('Subsidy');
    const mr = await inLanguage('mr', async () => quoteMoney(TOTAL, SUBSIDY, DEFAULT_MILESTONES));
    expect(mr.line).toContain('पूर्ण किंमत ₹1,83,969');
    expect(mr.line).toContain('₹78,000');
    const hi = await inLanguage('hi', async () => quoteMoney(TOTAL, SUBSIDY, DEFAULT_MILESTONES));
    expect(hi.line).toContain('पूरी कीमत ₹1,83,969');
  });

  it('fits WhatsApp: buttons of 20 and a buttons body of 1024, with no quote number', () => {
    for (const [language, words] of Object.entries(QUOTE_MONEY_LISTS)) {
      for (const title of [words.accept, words.ask])
        expect(title.length, `${language} ${title}`).toBeLessThanOrEqual(20);
      const body = words.buttonsBody('x'.repeat(400));
      expect(body.length, language).toBeLessThanOrEqual(1024);
      expect(words.caption('OH-Q-2026-0016')).toContain('OH-Q-2026-0016');
    }
    expect(QUOTE_MONEY_LISTS.mr.buttonsBody('…')).not.toContain('वर आहे');
    for (const words of [QUOTE_MONEY_LISTS.mr, QUOTE_MONEY_LISTS.hi])
      expect(Object.keys(words).sort()).toEqual(Object.keys(QUOTE_MONEY_LISTS.en).sort());
  });
});
