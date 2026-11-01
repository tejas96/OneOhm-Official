import type { ResellerEarnings } from '@oneohm/api-contracts';
import { Card, formatInr, Text } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { EARNINGS } from '@/copy/reseller';
import { shortDate } from '@/lib/dates';
import { CommissionPill } from './commission-pill';
import { kwOf, percentOf } from './use-reseller';

type Rule = ResellerEarnings['rule'];
type Entry = ResellerEarnings['entries'][number];

/** The commission terms in one plain sentence. */
export function ruleWords(rule: Rule): string {
  if (!rule.active) return EARNINGS.ruleOff;
  const amount =
    rule.basis === 'percent'
      ? EARNINGS.percentOfValue(percentOf(rule.rateBp))
      : EARNINGS.perKw(formatInr(rule.perKwPaise));
  return EARNINGS.rule(amount, rule.qualifyingEvent);
}

function Tile({ label, paise, wide }: { label: string; paise: number; wide?: boolean }) {
  return (
    <Card tone="sunken" style={[styles.tile, wide ? styles.wide : null]}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Text variant="titleLg">{formatInr(paise)}</Text>
    </Card>
  );
}

/** Earned, waiting, approved, paid and expected, as tiles. */
export function EarningsTiles({ earnings }: { readonly earnings: ResellerEarnings }) {
  const { totals } = earnings;
  return (
    <View style={styles.grid}>
      <Tile label={EARNINGS.tiles.earned} paise={totals.earnedPaise} wide />
      <Tile label={EARNINGS.tiles.pending} paise={totals.pendingPaise} />
      <Tile label={EARNINGS.tiles.approved} paise={totals.approvedPaise} />
      <Tile label={EARNINGS.tiles.paid} paise={totals.paidPaise} />
      <Tile label={EARNINGS.tiles.upcoming} paise={earnings.upcomingPaise} />
    </View>
  );
}

function basisWords(entry: Entry): string {
  return entry.basis === 'percent'
    ? EARNINGS.basisPercent(percentOf(entry.rateBp), formatInr(entry.projectValuePaise))
    : EARNINGS.basisPerKw(formatInr(entry.perKwPaise), kwOf(entry.capacityWp));
}

function paymentWords(entry: Entry): string | null {
  if (entry.status === 'rejected') return EARNINGS.rejected(entry.rejectReason ?? '');
  if (entry.status !== 'paid' || !entry.paidOn) return null;
  const method = entry.paidMethod ? EARNINGS.methods[entry.paidMethod] : '';
  return EARNINGS.paidOn(shortDate(entry.paidOn), method);
}

/** One line of the statement: the project, how it was worked out, and its payment. */
export function StatementRow({ entry }: { readonly entry: Entry }) {
  const payment = paymentWords(entry);
  return (
    <Card style={styles.row} accessibilityLabel={`${entry.projectCode} ${entry.customerName}`}>
      <View style={styles.between}>
        <View style={styles.flex}>
          <Text variant="titleMd" numberOfLines={1}>
            {entry.customerName}
          </Text>
          <Text variant="label" tone="tertiary" numberOfLines={1}>
            {`${entry.projectCode} · ${EARNINGS.earnedOn(shortDate(entry.earnedAt.slice(0, 10)))}`}
          </Text>
        </View>
        <Text variant="titleMd">{formatInr(entry.amountPaise)}</Text>
      </View>
      <Text variant="bodySm" tone="secondary">
        {basisWords(entry)}
      </Text>
      <View style={styles.between}>
        <CommissionPill status={entry.status} />
        {payment ? (
          <Text variant="label" tone="secondary" numberOfLines={2} style={styles.payment}>
            {payment}
          </Text>
        ) : null}
      </View>
      {entry.status === 'paid' && entry.paidReference ? (
        <Text variant="label" tone="tertiary">
          {EARNINGS.reference(entry.paidReference)}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, gap: 4, paddingVertical: 14 },
  wide: { flexBasis: '100%' },
  row: { gap: 10, paddingVertical: 16 },
  flex: { flex: 1, gap: 2 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  payment: { flexShrink: 1, textAlign: 'right' },
});
