import type { CrewPayable } from '@oneohm/api-contracts';
import {
  Card,
  describeError,
  EmptyState,
  ErrorState,
  formatInr,
  LoadingState,
  StatusPill,
  Text,
  type Tone,
  useTheme,
} from '@oneohm/mobile-ui';
import { Wallet } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { CREW } from '@/copy/crew';
import { shortDate } from '@/lib/dates';
import { useCrewPayments } from './use-crew';

const TONE: Readonly<Record<CrewPayable['status'], Tone>> = {
  pending: 'review',
  approved: 'waiting',
  paid: 'done',
};

/** What the contractor is owed for this crew's work: approved, paid and when. */
export function PaymentsSection() {
  const theme = useTheme();
  const query = useCrewPayments();
  if (query.isPending) return <LoadingState label={CREW.loading} />;
  if (query.isError)
    return (
      <ErrorState
        title={COMMON.loadError}
        message={describeError(query.error)}
        retryLabel={COMMON.retry}
        onRetry={() => void query.refetch()}
      />
    );
  const data = query.data;
  const figures = [
    { key: 'awaiting', label: CREW.payments.awaiting, value: data.awaitingApprovalPaise },
    { key: 'approved', label: CREW.payments.approved, value: data.approvedPaise },
    { key: 'paid', label: CREW.payments.paid, value: data.paidPaise },
  ];
  return (
    <View style={styles.section}>
      <Card tone="ocean" style={styles.hero}>
        <Text variant="overline" color={theme.ocean.onPanelMuted}>
          {data.contractor.name}
        </Text>
        <View style={styles.figures}>
          {figures.map((figure) => (
            <View key={figure.key} style={styles.figure}>
              <Text variant="titleLg" color={theme.ocean.onPanel}>
                {formatInr(figure.value)}
              </Text>
              <Text variant="label" color={theme.ocean.onPanelMuted}>
                {figure.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      {data.payables.length === 0 ? (
        <EmptyState
          icon={<Wallet size={22} color={theme.colors.accent} />}
          title={CREW.payments.emptyTitle}
          description={CREW.payments.emptyBody}
        />
      ) : (
        <>
          <SectionTitle title={CREW.payments.title} count={data.payables.length} />
          {[...data.payables].sort(byUrgency).map((payable) => (
            <PayableRow key={payable.id} payable={payable} />
          ))}
        </>
      )}
    </View>
  );
}

/** To be paid first, then awaiting approval, then paid; soonest due first within each. */
const ORDER: Readonly<Record<CrewPayable['status'], number>> = { approved: 0, pending: 1, paid: 2 };
const byUrgency = (a: CrewPayable, b: CrewPayable) =>
  ORDER[a.status] - ORDER[b.status] ||
  (a.status === 'paid'
    ? (b.paidOn ?? '').localeCompare(a.paidOn ?? '')
    : a.dueOn.localeCompare(b.dueOn));

function dateLine(payable: CrewPayable): string {
  if (payable.status === 'paid' && payable.paidOn) {
    const method = payable.paidMethod ? CREW.payments.methods[payable.paidMethod] : null;
    return method
      ? CREW.payments.paidBy(shortDate(payable.paidOn), method)
      : CREW.payments.paidOn(shortDate(payable.paidOn));
  }
  return CREW.payments.dueOn(shortDate(payable.dueOn));
}

function PayableRow({ payable }: { readonly payable: CrewPayable }) {
  return (
    <Card style={styles.row}>
      <View style={styles.line}>
        <Text variant="mono" tone="tertiary" style={styles.grow} numberOfLines={1}>
          {payable.workOrderNumber} · {payable.project.code}
        </Text>
        <Text variant="label" tone="secondary">
          {CREW.payments.kinds[payable.kind]}
        </Text>
      </View>
      <View style={styles.line}>
        <Text variant="titleLg" style={styles.grow}>
          {formatInr(payable.amountPaise)}
        </Text>
        <StatusPill
          size="sm"
          tone={TONE[payable.status]}
          label={CREW.payments.status[payable.status]}
        />
      </View>
      <Text variant="bodySm" tone="secondary">
        {dateLine(payable)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  hero: { padding: 20, gap: 14 },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  figure: { gap: 2, minWidth: 92 },
  row: { gap: 6, paddingVertical: 14 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
});
