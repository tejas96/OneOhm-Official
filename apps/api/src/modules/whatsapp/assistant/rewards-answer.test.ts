import type { Referral } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { rewardsText } from './rewards-answer';

const person = (name: string, status: Referral['status'], reward: Referral['reward'] = null) => ({
  id: name,
  name,
  status,
  reward,
  createdAt: '2026-10-01T00:00:00.000Z',
});

describe('my rewards answer', () => {
  it('shows each person, the reward and the totals', () => {
    const text = rewardsText([
      person('Kiran', 'installed', { status: 'paid', amountPaise: 200000, paidOn: '2026-10-20' }),
      person('Sunita', 'ordered', { status: 'pending', amountPaise: 200000, paidOn: null }),
      person('Anil', 'installed', { status: 'approved', amountPaise: 150000, paidOn: null }),
      person('Meena', 'received'),
    ]);
    expect(text).toContain(
      '• Kiran: their solar is installed; reward ₹2,000, paid on 20 October 2026',
    );
    expect(text).toContain('• Sunita: they ordered solar; reward ₹2,000, waiting for approval');
    expect(text).toContain('• Meena: we will call them soon');
    expect(text).toContain('Paid to you: ₹2,000');
    expect(text).toContain(
      '• Anil: their solar is installed; reward ₹1,500, approved and paying soon',
    );
    expect(text).toContain('On the way: ₹3,500');
  });

  it('invites a first referral when there is none', () => {
    expect(rewardsText([])).toMatch(/Refer a friend/);
  });

  it('keeps the answer short', () => {
    const many = Array.from({ length: 11 }, (_, index) => person(`Friend ${index}`, 'in_progress'));
    const text = rewardsText(many);
    expect(text.match(/^• /gm)).toHaveLength(8);
    expect(text).toContain('And 3 more.');
    expect(text).not.toContain('OneOhm app');
    expect(text).not.toContain('Paid to you');
  });
});
