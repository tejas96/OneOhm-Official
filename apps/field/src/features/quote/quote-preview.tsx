import type { QuotationPreview } from '@oneohm/api-contracts';
import { Card, describeError, formatInr, Text, useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { QUOTE } from '@/copy/quote';
import { Comparison, PriceStack } from './price-stack';

/** The price stack, approval note and DCR comparison, or why there is no price yet. */
export function QuotePreviewBlock({
  data,
  ready,
  fetching,
  error,
  dcr,
  approved,
}: {
  readonly data: QuotationPreview | undefined;
  readonly ready: boolean;
  readonly fetching: boolean;
  readonly error: unknown;
  readonly dcr: boolean;
  /** The saved quotation's discount is already approved: no approval note. */
  readonly approved: boolean;
}) {
  const theme = useTheme();
  if (!data || !ready) {
    return (
      <Card tone="sunken">
        <Text variant="bodySm" tone="secondary">
          {error ? describeError(error) : QUOTE.fillIn}
        </Text>
      </Card>
    );
  }
  return (
    <>
      <PriceStack totals={data.totals} updating={fetching} />
      {error ? (
        <Text variant="bodySm" color={theme.status.overdue.fg}>
          {describeError(error)}
        </Text>
      ) : null}
      {data.discountNeedsApproval && !approved ? (
        <Text variant="bodySm" color={theme.status.atRisk.fg}>
          {QUOTE.needsApproval}
        </Text>
      ) : null}
      {data.comparison ? <Comparison comparison={data.comparison} dcrSelected={dcr} /> : null}
    </>
  );
}

/** Every priced line: what it is, how much, and its total. */
export function QuoteLines({ lines }: { readonly lines: QuotationPreview['lines'] }) {
  const theme = useTheme();
  return (
    <View style={styles.lines}>
      <SectionTitle title={QUOTE.lines} count={lines.length} />
      {lines.map((line) => (
        <View
          key={line.key}
          style={[styles.line, { borderBottomColor: theme.colors.borderSubtle }]}
        >
          <View style={styles.flex}>
            <Text variant="bodySm" numberOfLines={2}>
              {line.description}
            </Text>
            <Text variant="mono" tone="tertiary">
              {line.quantity} {line.unit}
            </Text>
          </View>
          <Text variant="bodySm">{formatInr(line.totalPaise)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lines: { gap: 4 },
  line: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
