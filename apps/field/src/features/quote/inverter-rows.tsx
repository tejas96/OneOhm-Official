import type { Product } from '@oneohm/api-contracts';
import { inverterFit } from '@oneohm/domain';
import {
  Button,
  Field,
  Input,
  type PickerOption,
  PressableScale,
  SearchPicker,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { QUOTE } from '@/copy/quote';
import type { InverterRow } from './quote-options';

const EMPTY_ROW: InverterRow = { productId: null, quantity: '1' };
const kw = (watts: number) => `${Number((watts / 1000).toFixed(2)).toLocaleString('en-IN')} kW`;

export const productName = (product: Product) =>
  product.brand && product.brand !== 'Starter catalog'
    ? `${product.brand} ${product.name}`
    : product.name;

/** Catalog products as search options: name shown, SKU and brand searchable. */
export function productOptions(
  products: readonly Product[],
  describe?: (product: Product) => string | undefined,
): PickerOption<string>[] {
  return products.map((product) => ({
    value: product.id,
    label: productName(product),
    description: describe?.(product),
    keywords: `${product.sku} ${product.brand}`,
  }));
}

export const SEARCH_WORDS = { ...QUOTE.search, close: COMMON.close };

/**
 * The quote's inverters: one row per model with how many, more rows for a mix. Shows
 * the total AC rating against the panels and warns when they do not fit.
 */
export function InverterRows({
  rows,
  onChange,
  inverters,
  capacityWp,
  error,
}: {
  readonly rows: readonly InverterRow[];
  readonly onChange: (rows: InverterRow[]) => void;
  readonly inverters: readonly Product[];
  /** The panels' DC size; 0 when not known yet. */
  readonly capacityWp: number;
  readonly error?: string | undefined;
}) {
  const theme = useTheme();
  const copy = QUOTE.inverters;
  const shown = rows.length > 0 ? rows : [EMPTY_ROW];
  const options = productOptions(inverters, (product) =>
    product.ratedW ? kw(product.ratedW) : undefined,
  );
  const update = (index: number, next: Partial<InverterRow>) =>
    onChange(shown.map((row, at) => (at === index ? { ...row, ...next } : row)));
  const totalW = shown.reduce((sum, row) => {
    const rated = inverters.find((product) => product.id === row.productId)?.ratedW ?? 0;
    const count = Number(row.quantity);
    return sum + (Number.isInteger(count) && count > 0 ? rated * count : 0);
  }, 0);
  const fit = inverterFit(capacityWp, totalW);
  return (
    <Field label={copy.label} error={error}>
      <View style={styles.rows}>
        {shown.map((row, index) => {
          const product = inverters.find((entry) => entry.id === row.productId);
          const name = product ? productName(product) : copy.row(index + 1);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            <View key={index} style={styles.row}>
              <View style={styles.flex}>
                <SearchPicker
                  label={copy.row(index + 1)}
                  value={row.productId}
                  options={options}
                  onChange={(productId) => update(index, { productId })}
                  words={SEARCH_WORDS}
                  invalid={Boolean(error)}
                />
              </View>
              <View style={styles.count}>
                <Input
                  value={row.quantity}
                  onChangeText={(value) =>
                    update(index, { quantity: value.replace(/\D/g, '').slice(0, 2) })
                  }
                  keyboardType="number-pad"
                  maxLength={2}
                  mono
                  textAlign="center"
                  accessibilityLabel={copy.count(name)}
                />
              </View>
              {shown.length > 1 ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={copy.remove(name)}
                  onPress={() => onChange(shown.filter((_, at) => at !== index))}
                  style={styles.remove}
                >
                  <Text variant="body" tone="secondary">
                    ✕
                  </Text>
                </PressableScale>
              ) : null}
            </View>
          );
        })}
        {shown.length < 10 ? (
          <Button
            label={copy.add}
            variant="quiet"
            size="sm"
            onPress={() => onChange([...shown, EMPTY_ROW])}
          />
        ) : null}
        {totalW > 0 ? (
          <Text variant="bodySm" tone="secondary">
            {copy.total(kw(totalW), capacityWp > 0 ? kw(capacityWp) : null)}
          </Text>
        ) : null}
        {fit === 'small' || fit === 'large' ? (
          <Text variant="bodySm" color={theme.status.atRisk.fg}>
            {copy[fit]}
          </Text>
        ) : null}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  count: { width: 64 },
  remove: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
