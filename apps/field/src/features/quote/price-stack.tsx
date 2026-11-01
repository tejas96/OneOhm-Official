import type { QuotationPreview, QuotationTotals } from '@oneohm/api-contracts';
import { Card, formatInr, formatKwp, Text, useTheme } from '@oneohm/mobile-ui';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { QUOTE } from '@/copy/quote';

/** The hero: total price, minus the expected subsidy, equals what the customer pays. */
export function PriceStack({
  totals,
  updating,
}: {
  readonly totals: QuotationTotals;
  readonly updating: boolean;
}) {
  const theme = useTheme();
  const ink = theme.ocean.onPanel;
  const muted = theme.ocean.onPanelMuted;
  return (
    <Card tone="ocean" style={styles.card}>
      <View style={styles.top}>
        <Text variant="mono" color={muted}>
          {QUOTE.modules(totals.moduleCount, formatKwp(totals.capacityWp))}
        </Text>
        {updating ? (
          <ActivityIndicator size="small" color={muted} accessibilityLabel={QUOTE.updating} />
        ) : null}
      </View>
      <Line label={QUOTE.total} value={formatInr(totals.totalPaise)} color={ink} muted={muted} />
      <Line
        label={QUOTE.subsidy}
        value={`−\u00A0${formatInr(totals.subsidyPaise)}`}
        color={totals.subsidyPaise > 0 ? theme.brand.green : muted}
        muted={muted}
      />
      {totals.subsidyIneligible ? (
        <Text variant="bodySm" color={muted}>
          {QUOTE.noSubsidy[totals.subsidyIneligible]}
        </Text>
      ) : null}
      <View style={[styles.rule, { backgroundColor: theme.ocean.panelLine }]} />
      <Text variant="overline" color={muted}>
        {QUOTE.effective}
      </Text>
      <Text variant="hero" color={ink} adjustsFontSizeToFit numberOfLines={1}>
        {formatInr(totals.effectivePaise)}
      </Text>
    </Card>
  );
}

function Line({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color: string;
  muted: string;
}) {
  return (
    <View style={styles.line}>
      <Text variant="body" color={muted} style={styles.lineLabel}>
        {label}
      </Text>
      <Text variant="titleLg" color={color} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** The same system with DCR and non-DCR panels side by side (PRD 3.5). */
export function Comparison({
  comparison,
  dcrSelected,
}: {
  readonly comparison: NonNullable<QuotationPreview['comparison']>;
  readonly dcrSelected: boolean;
}) {
  const theme = useTheme();
  const columns = [
    { key: 'dcr', label: QUOTE.dcr, totals: comparison.dcr, selected: dcrSelected },
    { key: 'nonDcr', label: QUOTE.nonDcr, totals: comparison.nonDcr, selected: !dcrSelected },
  ] as const;
  return (
    <View style={styles.compare}>
      <Text variant="titleMd">{QUOTE.compare}</Text>
      <Text variant="bodySm" tone="secondary">
        {QUOTE.compareBody}
      </Text>
      <View style={styles.columns}>
        {columns.map((column) => (
          <Card
            key={column.key}
            tone={column.selected ? 'raised' : 'sunken'}
            style={[
              styles.column,
              column.selected ? { borderColor: theme.colors.accent, borderWidth: 1.5 } : null,
            ]}
          >
            <Text variant="label" tone={column.selected ? 'accent' : 'secondary'}>
              {column.label}
            </Text>
            <Text variant="bodySm" tone="tertiary">
              {QUOTE.total}
            </Text>
            <Text variant="body">{formatInr(column.totals.totalPaise)}</Text>
            <Text variant="bodySm" tone="tertiary">
              {QUOTE.subsidy}
            </Text>
            <Text
              variant="body"
              color={
                column.totals.subsidyPaise > 0 ? theme.colors.energy : theme.colors.textSecondary
              }
            >
              {formatInr(column.totals.subsidyPaise)}
            </Text>
            <Text variant="bodySm" tone="tertiary">
              {QUOTE.effective}
            </Text>
            <Text variant="titleLg">{formatInr(column.totals.effectivePaise)}</Text>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 22 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  lineLabel: { flex: 1 },
  rule: { height: 1, marginVertical: 4 },
  compare: { gap: 8 },
  columns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1, gap: 2, padding: 14 },
});
