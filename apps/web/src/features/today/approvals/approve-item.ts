import type { ApprovalItem } from '@oneohm/api-contracts';
import { api, expectStatus } from '@/lib/api/api-client';

/**
 * Says yes to one waiting item through its own endpoint, so every rule there still
 * applies (rights, money limits, a leave's handover). Kinds that need a choice first
 * (who does a critical task) are opened instead.
 */
export async function approveItem(item: ApprovalItem): Promise<void> {
  const params = { id: item.id };
  switch (item.kind) {
    case 'task_review':
      await expectStatus(api.tasks.approveTask({ params }), 200);
      return;
    case 'discount':
      await expectStatus(api.quotations.approveDiscount({ params }), 200);
      return;
    case 'leave':
      await expectStatus(api.workforce.decideLeave({ params, body: { approve: true } }), 200);
      return;
    case 'attendance_correction':
      await expectStatus(api.workforce.decideCorrection({ params, body: { approve: true } }), 200);
      return;
    case 'travel_claim':
      await expectStatus(
        api.siteActivity.decideTravelClaim({ params, body: { approve: true } }),
        200,
      );
      return;
    case 'purchase_request':
      await expectStatus(api.purchasing.requests.approve({ params, body: { note: null } }), 200);
      return;
    case 'vendor_advance':
      await expectStatus(api.purchasing.advances.approve({ params }), 200);
      return;
    case 'bill':
      await expectStatus(api.finance.approvePayable({ params }), 200);
      return;
    case 'points':
      await expectStatus(api.rewards.decidePoints({ params, body: { approve: true } }), 200);
      return;
    case 'bonus':
      await expectStatus(api.engagement.decideBonus({ params, body: { approve: true } }), 200);
      return;
    case 'commission':
      await expectStatus(api.commissions.approveEntry({ params, body: {} }), 200);
      return;
    case 'referral_reward':
      await expectStatus(api.referrals.approveReward({ params, body: {} }), 200);
      return;
    case 'assignee_confirm':
      throw new Error('Open the task to confirm who does it.');
  }
}

/** True when the inbox can say yes in place; the rest open where they are decided. */
export const approvesInPlace = (item: ApprovalItem) => item.kind !== 'assignee_confirm';
