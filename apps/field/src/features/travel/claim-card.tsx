import type { TravelClaim } from '@oneohm/api-contracts';
import { Card, formatInr, StatusPill, Text, type Tone } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { TRAVEL } from '@/copy/site';
import { shortDate } from '@/lib/dates';

type State = keyof typeof TRAVEL.status;

const TONE: Readonly<Record<State, Tone>> = {
  pending: 'review',
  approved: 'waiting',
  paid: 'done',
  rejected: 'overdue',
  cancelled: 'neutral',
};

export const stateOf = (claim: TravelClaim): State =>
  claim.status === 'approved' && claim.paid ? 'paid' : claim.status;

/** One claimed day: when, how far, how much, and where it stands. */
export function ClaimCard({ claim }: { readonly claim: TravelClaim }) {
  const state = stateOf(claim);
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text variant="titleMd">{shortDate(claim.workDate)}</Text>
        <Text variant="titleMd" style={styles.amount}>
          {formatInr(claim.amountPaise)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text variant="bodySm" tone="secondary">
          {TRAVEL.total(
            claim.distanceM,
            formatInr(claim.ratePaisePerKm),
            formatInr(claim.amountPaise),
          )}
        </Text>
        {claim.project ? (
          <Text variant="bodySm" tone="secondary">
            {TRAVEL.forProject(claim.project.code)}
          </Text>
        ) : null}
      </View>
      <View style={styles.status}>
        <StatusPill size="sm" tone={TONE[state]} label={TRAVEL.status[state]} />
      </View>
      {claim.decisionNote ? (
        <Text variant="bodySm" tone="secondary">
          {TRAVEL.decisionNote(claim.decisionNote)}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  amount: { fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row' },
});
