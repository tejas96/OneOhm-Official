import type { ApprovalItem, BankPayout, Payable, PayoutOptions } from '@oneohm/api-contracts';
import { expect } from 'vitest';
import { rows } from './db';
import { Session } from './http';
import { providerId, signedWebhook } from './money';
import { ownPerson, retire } from './people';
import { sellProject } from './sales';
import { STAFF } from './team';

/**
 * The people and helpers behind the payout-people scenarios: the admin (approves payments),
 * Accounts (records payments only), a second approver, and one sale with a work order
 * that raises approved advance bills ready to go by bank.
 */
export class PayoutDesk {
  admin!: Session;
  accounts!: Session;
  second!: Session;
  orderId = '';
  orderNumber = '';
  policy: Record<string, number> = {};
  private readonly used = new Set<string>();
  private amount: number;

  constructor(
    private readonly saleName: string,
    startAmount: number,
  ) {
    this.amount = startAmount;
  }

  async open(): Promise<void> {
    this.admin = await Session.admin();
    this.accounts = await Session.code(STAFF.accounts.phone);
    const person = await ownPerson(this.admin, 'Second Approver (test)', ['super_admin']);
    this.second = await Session.code(person.phone);
    this.policy = await this.admin.get<Record<string, number>>('/settings/approvals');
    const sale = await sellProject(this.admin, { name: this.saleName });
    const [order] = await this.admin.get<{ id: string; number: string }[]>(
      `/work-orders?projectId=${sale.project.id}`,
    );
    this.orderId = order?.id ?? '';
    this.orderNumber = order?.number ?? '';
  }

  /** Puts the Settings limit back and removes the second approver. */
  async close(): Promise<void> {
    await this.admin.put('/settings/approvals', { ...this.policy, secondPersonAbovePaise: 0 });
    await retire(this.admin, [{ id: this.second.userId, phone: '', name: this.second.name }]);
  }

  /** The two-people limit in Settings (0 turns it off). */
  limit(paise: number): Promise<unknown> {
    return this.admin.put('/settings/approvals', { ...this.policy, secondPersonAbovePaise: paise });
  }

  /** A fresh approved advance bill (approved by the admin). Returns its id and amount. */
  async newBill(): Promise<{ id: string; amount: number }> {
    this.amount += 1_000;
    await this.admin.post(`/work-orders/${this.orderId}/advances`, {
      amountPaise: this.amount,
      note: 'Test',
    });
    const bills = await this.admin.get<Payable[]>('/finance/payables');
    const bill = bills.find(
      (p) =>
        p.description === `Advance · ${this.orderNumber}` &&
        !this.used.has(p.id) &&
        p.status === 'pending',
    );
    expect(bill, 'the advance raised a bill').toBeDefined();
    this.used.add(bill?.id ?? '');
    await this.admin.post(`/finance/payables/${bill?.id}/approve`);
    return { id: bill?.id ?? '', amount: this.amount };
  }

  options = (who: Session, id: string) => who.get<PayoutOptions>(`/payables/${id}/payout-options`);
  send = (who: Session, id: string, body?: Record<string, unknown>) =>
    who.raw<BankPayout & { code?: string; message?: string }>(
      'POST',
      `/payables/${id}/payouts`,
      body,
    );
  inbox = async (who: Session, id: string) =>
    (await who.get<ApprovalItem[]>('/approvals/mine')).find(
      (item) => item.kind === 'bank_payout' && item.id === id,
    );
  alerts = (userId: string, kind: string) =>
    rows<{ title: string; body: string }>(
      'select title, body from notifications where user_id = $1 and kind = $2',
      [userId, kind],
    );
  audits = (action: string, entityId: string) =>
    rows<{ data: unknown }>('select data from audit_log where action = $1 and entity_id = $2', [
      action,
      entityId,
    ]);
  settle = async (payout: BankPayout) =>
    signedWebhook({
      event: 'payout.processed',
      payload: {
        payout: {
          entity: {
            id: await providerId('bank_payouts', payout.id),
            status: 'processed',
            utr: `U${payout.id.slice(0, 8)}`,
          },
        },
      },
    });
}
