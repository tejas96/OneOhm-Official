import type { CustomerProject } from '@oneohm/api-contracts';
import { formatInr, StatusPill, Text, useTheme } from '@oneohm/mobile-ui';
import { Landmark, UserRound } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { PAYMENTS } from '@/copy/money';
import { momentDate } from '@/lib/dates';
import { canPayNow, PayNow } from './pay-now';

type Line = CustomerProject['payments']['milestones'][number];

const TONE = { upcoming: 'neutral', due: 'atRisk', partly_paid: 'waiting', paid: 'done' } as const;

/** One milestone: its purpose, who pays, the amount and where it stands. */
export function MilestoneRow({ line, first }: { readonly line: Line; readonly first: boolean }) {
  const theme = useTheme();
  const Icon = line.payer === 'bank' ? Landmark : UserRound;
  const bankWait =
    line.payer === 'bank' && (line.status === 'due' || line.status === 'partly_paid');
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
      <View style={styles.top}>
        <View style={styles.fill}>
          <Text variant="body">{PAYMENTS.milestone(line.key, line.label)}</Text>
          <View style={styles.payer}>
            <Icon size={14} color={theme.colors.textTertiary} />
            <Text variant="label" tone="tertiary">
              {line.payer === 'bank' ? PAYMENTS.bankShare : PAYMENTS.yourShare}
            </Text>
          </View>
        </View>
        <Text variant="titleMd">{formatInr(line.amountPaise)}</Text>
      </View>
      <View style={styles.bottom}>
        {bankWait ? (
          <StatusPill tone="waiting" label={PAYMENTS.waitingForBank} size="sm" />
        ) : (
          <StatusPill tone={TONE[line.status]} label={PAYMENTS.status[line.status]} size="sm" />
        )}
        {line.status === 'partly_paid' ? (
          <Text variant="label" tone="secondary">
            {PAYMENTS.paidSoFar(formatInr(line.paidPaise))}
          </Text>
        ) : null}
        {line.status === 'due' && line.dueAt && !bankWait ? (
          <Text variant="label" tone="secondary">
            {PAYMENTS.dueOn(momentDate(line.dueAt))}
          </Text>
        ) : null}
      </View>
      {canPayNow(line) ? <PayNow line={line} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 14 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fill: { flex: 1, gap: 4 },
  payer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
});
