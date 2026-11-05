import { Inject, Injectable } from '@nestjs/common';
import type { VendorProfile, VendorScorecard } from '@oneohm/api-contracts';
import { projects, vendorAdvances, vendors } from '@oneohm/database';
import { deliveryOutcome, leftToPay, payableAgeing, summariseDeliveries } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { VendorsService } from '../inventory/vendors.service';
import { vendorAdvanceRows } from './vendor-advance-read';
import { loadVendorFacts, receiptDates, type VendorFacts } from './vendor-performance-read';

type VendorRow = Pick<typeof vendors.$inferSelect, 'id' | 'name' | 'active'>;

/** Vendor performance and outstanding (PRD 3.10): delivery record, ageing and advances. */
@Injectable()
export class VendorPerformanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly vendors: VendorsService,
  ) {}

  async scorecards(): Promise<VendorScorecard[]> {
    const rows = await this.db
      .select({ id: vendors.id, name: vendors.name, active: vendors.active })
      .from(vendors)
      .orderBy(asc(vendors.name));
    const facts = await loadVendorFacts(this.db);
    const today = todayIn();
    const dates = receiptDates(facts);
    return rows.map((vendor) => scorecard(vendor, facts, dates, today));
  }

  async profile(actor: Actor, id: string): Promise<VendorProfile> {
    const vendor = (await this.vendors.list(actor)).find((row) => row.id === id);
    if (!vendor) throw notFound('That vendor');
    const facts = await loadVendorFacts(this.db, id);
    const today = todayIn();
    const dates = receiptDates(facts);
    const projectIds = [
      ...new Set(facts.orders.flatMap((order) => (order.projectId ? [order.projectId] : []))),
    ];
    const codes = projectIds.length
      ? await this.db
          .select({ id: projects.id, code: projects.code })
          .from(projects)
          .where(inArray(projects.id, projectIds))
      : [];
    return {
      vendor,
      scorecard: scorecard(vendor, facts, dates, today),
      orders: facts.orders.slice(0, 60).map((order) => {
        const received = dates.get(order.id) ?? [];
        return {
          id: order.id,
          number: order.number,
          status: order.status,
          projectCode: codes.find((row) => row.id === order.projectId)?.code ?? null,
          orderDate: order.orderDate,
          expectedOn: order.expectedOn,
          lastReceivedOn: received.length ? received.reduce((a, b) => (a > b ? a : b)) : null,
          outcome: deliveryOutcome({ ...order, receivedOn: received }, today),
          totalPaise: order.totalPaise,
        };
      }),
      bills: facts.bills.map(({ payable, billedOn }) => ({
        id: payable.id,
        description: payable.description,
        billNumber: payable.billNumber,
        billedOn,
        dueOn: payable.dueOn,
        amountPaise: payable.amountPaise,
        adjustedPaise: payable.advanceAdjustedPaise,
        balancePaise: leftToPay(payable),
        status: payable.status,
        overdue: payable.dueOn < today,
      })),
      rejections: facts.rejections.map(({ receiptId: _receipt, vendorId: _vendor, ...row }) => row),
      advances: await vendorAdvanceRows(this.db, eq(vendorAdvances.vendorId, id)),
    };
  }
}

function scorecard(
  vendor: VendorRow,
  facts: VendorFacts,
  dates: ReadonlyMap<string, string[]>,
  today: string,
): VendorScorecard {
  const orders = facts.orders.filter((order) => order.vendorId === vendor.id);
  const deliveries = summariseDeliveries(
    orders.map((order) => ({ ...order, receivedOn: dates.get(order.id) ?? [] })),
    today,
  );
  const ageing = payableAgeing(
    facts.bills
      .filter((bill) => bill.vendorId === vendor.id)
      .map(({ payable, billedOn }) => ({
        balancePaise: leftToPay(payable),
        billedOn,
        dueOn: payable.dueOn,
      })),
    today,
  );
  const failed = new Set(
    facts.rejections.filter((row) => row.vendorId === vendor.id).map((row) => row.receiptId),
  );
  return {
    vendorId: vendor.id,
    name: vendor.name,
    active: vendor.active,
    ...deliveries,
    receipts: facts.receipts.filter((row) => row.vendorId === vendor.id).length,
    inspectionFailures: failed.size,
    outstandingPaise: ageing.totalPaise,
    overduePaise: ageing.overduePaise,
    ageing: ageing.buckets,
    openAdvancesPaise: Number(facts.advances.find((row) => row.vendorId === vendor.id)?.open ?? 0),
  };
}
