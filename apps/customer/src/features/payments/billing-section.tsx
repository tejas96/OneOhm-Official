import type { CustomerBilling } from '@oneohm/api-contracts';
import { Card, formatInr, LoadingState, Text, useTheme } from '@oneohm/mobile-ui';
import { Undo2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { BILLING, PAYMENTS } from '@/copy/money';
import { FileRow } from '@/features/documents/file-row';
import { longDate } from '@/lib/dates';
import { useBilling } from './use-billing';

type ProjectBilling = CustomerBilling[number];

type Receipt = ProjectBilling['receipts'][number];

/** What a receipt paid for, in the customer's language when it is one of OneOhm's steps. */
const receiptPurpose = (receipt: Receipt) =>
  receipt.milestoneLabel === null
    ? null
    : PAYMENTS.milestone(receipt.milestoneKey ?? '', receipt.milestoneLabel);

function RefundRow({
  refund,
  first,
}: {
  readonly refund: ProjectBilling['refunds'][number];
  readonly first: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        !first && {
          borderTopColor: theme.colors.borderSubtle,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
        <Undo2 size={18} color={theme.colors.onAccentSoft} />
      </View>
      <View style={styles.fill}>
        <Text variant="body">{BILLING.refund(formatInr(refund.amountPaise))}</Text>
        <Text variant="label" tone="tertiary">
          {BILLING.refundMeta(longDate(refund.paidOn), BILLING.refundMethod[refund.method])}
        </Text>
      </View>
    </View>
  );
}

/** The GST invoice and every receipt for one project, each opening as a PDF. */
function Papers({ billing }: { readonly billing: ProjectBilling }) {
  const invoice = billing.invoices.find((entry) => entry.status === 'issued');
  return (
    <Card style={styles.card}>
      {invoice ? (
        <FileRow
          first
          title={BILLING.invoice(formatInr(invoice.totalPaise))}
          meta={BILLING.invoiceMeta(invoice.number, longDate(invoice.invoiceDate))}
          file={{
            path: `/v1/customer/invoices/${invoice.id}/pdf`,
            fileName: `${invoice.number.replaceAll('/', '-')}.pdf`,
            mimeType: 'application/pdf',
          }}
        />
      ) : (
        <Text variant="body" tone="secondary" style={styles.empty}>
          {BILLING.noInvoice}
        </Text>
      )}
      {billing.receipts.map((receipt) => (
        <FileRow
          key={receipt.id}
          first={false}
          title={BILLING.receipt(formatInr(receipt.amountPaise))}
          meta={BILLING.receiptMeta(
            receipt.number,
            longDate(receipt.receivedOn),
            receipt.reversed ? BILLING.reversed : receiptPurpose(receipt),
          )}
          file={{
            path: `/v1/customer/receipts/${receipt.id}/pdf`,
            fileName: `${receipt.number.replaceAll('/', '-')}.pdf`,
            mimeType: 'application/pdf',
          }}
        />
      ))}
    </Card>
  );
}

/** Invoice, receipts, refunds and any credit held, for the chosen project. */
export function BillingSection({ projectId }: { readonly projectId: string }) {
  const query = useBilling();
  const billing = query.data?.find((entry) => entry.projectId === projectId);
  return (
    <View style={styles.section}>
      <SectionTitle title={BILLING.title.toUpperCase()} />
      {query.isPending ? <LoadingState label={BILLING.loading} /> : null}
      {billing ? <Papers billing={billing} /> : null}
      {billing && billing.creditPaise > 0 ? (
        <Card tone="sunken">
          <Text variant="bodySm" tone="secondary">
            {BILLING.credit(formatInr(billing.creditPaise))}
          </Text>
        </Card>
      ) : null}
      {billing && billing.refunds.length > 0 ? (
        <>
          <SectionTitle title={BILLING.refundsTitle.toUpperCase()} />
          <Card style={styles.card}>
            {billing.refunds.map((refund, index) => (
              <RefundRow key={refund.id} refund={refund} first={index === 0} />
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  card: { paddingVertical: 4 },
  empty: { paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, gap: 2 },
});
