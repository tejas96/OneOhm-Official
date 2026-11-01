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

type Line = QuotationPreview['lines'][number];

const lineAmount = (line: Line) => {
  if (line.extra === 'gift') return QUOTE.extras.free;
  return line.totalPaise < 0 ? `− ${formatInr(-line.totalPaise)}` : formatInr(line.totalPaise);
};

/** Every priced line: what it is, how much, and its total; optional items apart. */
export function QuoteLines({ lines }: { readonly lines: QuotationPreview['lines'] }) {
  const included = lines.filter((line) => line.extra !== 'optional');
  const optional = lines.filter((line) => line.extra === 'optional');
  return (
    <View style={styles.lines}>
      <SectionTitle title={QUOTE.lines} count={included.length} />
      <LineList lines={included} />
      {optional.length > 0 ? (
        <>
          <SectionTitle title={QUOTE.extras.optionalTitle} count={optional.length} />
          <Text variant="bodySm" tone="secondary">
            {QUOTE.extras.optionalNote}
          </Text>
          <LineList lines={optional} />
        </>
      ) : null}
    </View>
  );
}

function LineList({ lines }: { readonly lines: readonly Line[] }) {
  const theme = useTheme();
  return (
    <>
      {lines.map((line) => (
        <View
          key={line.key}
          style={[styles.line, { borderBottomColor: theme.colors.borderSubtle }]}
        >
          <View style={styles.flex}>
            <Text variant="bodySm" numberOfLines={2}>
              {line.description}
            </Text>
            {line.reason ? (
              <Text variant="bodySm" tone="secondary" numberOfLines={2}>
                {line.reason}
              </Text>
            ) : null}
            <Text variant="mono" tone="tertiary">
              {line.quantity} {line.unit}
            </Text>
          </View>
          <Text variant="bodySm">{lineAmount(line)}</Text>
        </View>
      ))}
    </>
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
