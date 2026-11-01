import { daysBetween } from '@oneohm/shared';
import { type AgeingBucket, ageingBucket } from '../finance/receivable-ageing';

/**
 * Vendor performance and outstanding (PRD 3.10). An order is on time when it was
 * received in full (or closed short) by its expected date; late when that happened
 * after the date, or when it is still open past it.
 */
export type DeliveryOutcome = 'on_time' | 'late' | 'open_late' | 'open' | 'no_date' | 'not_ordered';

export interface OrderDelivery {
  readonly status: 'draft' | 'sent' | 'partly_received' | 'received' | 'closed' | 'cancelled';
  readonly orderDate: string;
  readonly expectedOn: string | null;
  readonly totalPaise: number;
  /** The day each goods receipt arrived. */
  readonly receivedOn: readonly string[];
}

const lastOf = (dates: readonly string[]) =>
  dates.reduce<string | null>((last, date) => (last === null || date > last ? date : last), null);

export function deliveryOutcome(order: OrderDelivery, today: string): DeliveryOutcome {
  if (order.status === 'draft' || order.status === 'cancelled') return 'not_ordered';
  const last = lastOf(order.receivedOn);
  const done = (order.status === 'received' || order.status === 'closed') && last !== null;
  if (!done) return order.expectedOn !== null && order.expectedOn < today ? 'open_late' : 'open';
  if (order.expectedOn === null) return 'no_date';
  return last <= order.expectedOn ? 'on_time' : 'late';
}

export interface DeliverySummary {
  /** Orders placed (sent or later, not cancelled) and their value. */
  readonly orders: number;
  readonly orderedPaise: number;
  readonly delivered: number;
  readonly onTime: number;
  readonly late: number;
  readonly openLate: number;
  /** On time out of every order with a date that is done or overdue, in basis points. */
  readonly onTimeBp: number | null;
  /** Order date to the last receipt, over delivered orders, to one decimal. */
  readonly averageDaysToDeliver: number | null;
}

export function summariseDeliveries(
  orders: readonly OrderDelivery[],
  today: string,
): DeliverySummary {
  let placed = 0;
  let orderedPaise = 0;
  let delivered = 0;
  let onTime = 0;
  let late = 0;
  let openLate = 0;
  let days = 0;
  for (const order of orders) {
    const outcome = deliveryOutcome(order, today);
    if (outcome === 'not_ordered') continue;
    placed += 1;
    orderedPaise += order.totalPaise;
    if (outcome === 'on_time') onTime += 1;
    if (outcome === 'late') late += 1;
    if (outcome === 'open_late') openLate += 1;
    const last = lastOf(order.receivedOn);
    if ((outcome === 'on_time' || outcome === 'late' || outcome === 'no_date') && last) {
      delivered += 1;
      days += Math.max(0, daysBetween(order.orderDate, last));
    }
  }
  const judged = onTime + late + openLate;
  return {
    orders: placed,
    orderedPaise,
    delivered,
    onTime,
    late,
    openLate,
    onTimeBp: judged === 0 ? null : Math.round((onTime * 10_000) / judged),
    averageDaysToDeliver: delivered === 0 ? null : Math.round((days * 10) / delivered) / 10,
  };
}

export interface OutstandingBill {
  readonly balancePaise: number;
  /** The vendor's invoice date, or the day the goods arrived. */
  readonly billedOn: string;
  readonly dueOn: string;
}

export interface PayableAgeing {
  readonly totalPaise: number;
  readonly overduePaise: number;
  /** By days since the bill: 0-30, 31-60, 61-90 and over 90. */
  readonly buckets: Readonly<Record<AgeingBucket, number>>;
}

export function payableAgeing(bills: readonly OutstandingBill[], today: string): PayableAgeing {
  const buckets: Record<AgeingBucket, number> = {
    current: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_over_90: 0,
  };
  let totalPaise = 0;
  let overduePaise = 0;
  for (const bill of bills) {
    if (bill.balancePaise <= 0) continue;
    totalPaise += bill.balancePaise;
    if (bill.dueOn < today) overduePaise += bill.balancePaise;
    const bucket = ageingBucket(Math.max(0, daysBetween(bill.billedOn, today)));
    buckets[bucket] += bill.balancePaise;
  }
  return { totalPaise, overduePaise, buckets };
}
