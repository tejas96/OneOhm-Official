import type { MyRewards } from '@oneohm/api-contracts';
import { Card, formatInr, StatusPill, Text, type Tone } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { REWARDS } from '@/copy/engagement';
import { shortDate } from '@/lib/dates';

type BonusLine = MyRewards['bonuses'][number];

function stateOf(bonus: BonusLine): { tone: Tone; label: string } {
  if (bonus.status === 'pending') return { tone: 'review', label: REWARDS.bonusState.pending };
  if (bonus.payableStatus === 'paid')
    return {
      tone: 'done',
      label: REWARDS.bonusState.paid(bonus.paidOn ? shortDate(bonus.paidOn) : ''),
    };
  return { tone: 'waiting', label: REWARDS.bonusState.approved };
}

/** Project bonuses and incentives for this person and how far each is paid (PRD 4.7). */
export function BonusList({ rewards }: { readonly rewards: MyRewards }) {
  return (
    <View style={styles.list}>
      {rewards.approvedPaise + rewards.paidPaise > 0 ? (
        <View style={styles.totals}>
          <Total amount={rewards.approvedPaise} label={REWARDS.approvedTotal} />
          <Total amount={rewards.paidPaise} label={REWARDS.paidTotal} />
        </View>
      ) : null}
      {rewards.bonuses.length === 0 ? (
        <Text variant="bodySm" tone="secondary">
          {REWARDS.noMoney}
        </Text>
      ) : (
        rewards.bonuses.map((bonus) => {
          const state = stateOf(bonus);
          return (
            <Card key={bonus.id} style={styles.card}>
              <View style={styles.head}>
                <Text variant="titleMd" style={styles.reason}>
                  {bonus.reason}
                </Text>
                <Text variant="titleMd">{formatInr(bonus.amountPaise)}</Text>
              </View>
              {bonus.projectCode ? (
                <Text variant="mono" tone="tertiary">
                  {bonus.projectCode}
                </Text>
              ) : null}
              <StatusPill tone={state.tone} label={state.label} size="sm" />
            </Card>
          );
        })
      )}
    </View>
  );
}

function Total({ amount, label }: { readonly amount: number; readonly label: string }) {
  return (
    <Card tone="sunken" style={styles.total}>
      <Text variant="titleLg">{formatInr(amount)}</Text>
      <Text variant="label" tone="tertiary">
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  totals: { flexDirection: 'row', gap: 10 },
  total: { flex: 1, gap: 2, padding: 14 },
  card: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  reason: { flex: 1 },
});
