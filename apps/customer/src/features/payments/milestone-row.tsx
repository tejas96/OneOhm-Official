import type { CustomerProject } from '@oneohm/api-contracts';
import { Button, formatInr, StatusPill, Text, useTheme } from '@oneohm/mobile-ui';
import { CreditCard, Landmark, UserRound } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';
import { PAYMENTS } from '@/copy/money';
import { momentDate } from '@/lib/dates';

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
      {line.payUrl && line.payer === 'customer' ? (
        <PayNow url={line.payUrl} owed={line.amountPaise - line.paidPaise} />
      ) : null}
    </View>
  );
}

/** Opens the Razorpay page for what is still owed on this milestone. */
function PayNow({ url, owed }: { readonly url: string; readonly owed: number }) {
  const theme = useTheme();
  return (
    <View style={styles.pay}>
      <Button
        label={PAYMENTS.payNow(formatInr(owed))}
        icon={<CreditCard size={18} color={theme.colors.onAccent} />}
        onPress={() => void Linking.openURL(url)}
        fullWidth
      />
      <Text variant="label" tone="tertiary">
        {PAYMENTS.payHint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 14 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fill: { flex: 1, gap: 4 },
  payer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  pay: { gap: 6, paddingTop: 4 },
});
