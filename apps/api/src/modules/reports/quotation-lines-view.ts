import type { QuotationDetail } from '@oneohm/api-contracts';
import type { LineCategory } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';

type Line = QuotationDetail['lines'][number];

/** What a customer reads for a group of engine lines: the system, not cable sizes. */
const GROUP_LABEL: Readonly<Record<LineCategory, string>> = {
  panel: 'Solar panels',
  inverter: 'Inverter',
  battery: 'Battery',
  structure: 'Mounting structure with all parts, fasteners and fabrication',
  cable: 'DC and AC cabling with conduit, tray and accessories',
  electrical: 'Earthing, lightning arrester and electrical protection',
  installation: 'Installation, commissioning and site work',
  transport: 'Transport to site',
  liaisoning: 'DISCOM net-metering application and liaisoning',
  other: 'Other items',
};

const quantity = (value: number, unit: string) =>
  `${Number.isInteger(value) ? value : value.toFixed(2).replace(/\.?0+$/, '')} ${unit}`;

export const percent = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`;

export interface LineView {
  readonly index: number;
  readonly description: string;
  readonly note: string | null;
  readonly quantity: string;
  readonly gst: string;
  readonly amount: string;
}

export const lineView = (line: Line, index: number): LineView => ({
  index: index + 1,
  description: line.description,
  note: line.extra === 'charge' || line.extra === 'adjustment' ? (line.reason ?? null) : null,
  quantity: quantity(line.quantity, line.unit),
  gst: line.extra === 'gift' ? '—' : percent(line.taxRateBp),
  amount:
    line.extra === 'gift'
      ? 'Free'
      : line.amountPaise < 0
        ? `− ${formatInr(-line.amountPaise)}`
        : formatInr(line.amountPaise + line.contingencyPaise),
});

/** Several engine lines of one kind as one row: their amounts added, their GST rates named. */
function groupView(category: LineCategory, lines: readonly Line[], index: number): LineView {
  const rates = [...new Set(lines.map((line) => line.taxRateBp))].sort((a, b) => a - b);
  const amount = lines.reduce((sum, line) => sum + line.amountPaise + line.contingencyPaise, 0);
  return {
    index: index + 1,
    description: GROUP_LABEL[category],
    note: null,
    quantity: '1 lot',
    gst: rates.map(percent).join(' / '),
    amount: formatInr(amount),
  };
}

/**
 * The quotation's items as the customer sees them (PRD 3.9: customers see systems, not
 * cable sizes): panels, inverter and battery each on their row; every other group of
 * engine lines on one row when it has several; then lines added by hand, as they are.
 * Optional items are listed apart by the caller.
 */
export function customerLines(lines: readonly Line[]): LineView[] {
  const rows: { readonly lines: readonly Line[]; readonly category: LineCategory | null }[] = [];
  for (const line of lines) {
    if (line.extra === 'optional') continue;
    const groupable = !line.extra && !['panel', 'inverter', 'battery'].includes(line.category);
    const group = groupable ? rows.find((row) => row.category === line.category) : undefined;
    if (group) (group.lines as Line[]).push(line);
    else rows.push({ lines: [line], category: groupable ? line.category : null });
  }
  return rows.map((row, index) => {
    const [first] = row.lines;
    if (row.lines.length > 1 && row.category) return groupView(row.category, row.lines, index);
    return lineView(first as Line, index);
  });
}
