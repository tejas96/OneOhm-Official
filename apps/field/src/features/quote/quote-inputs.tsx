import type { Product } from '@oneohm/api-contracts';
import { ChoiceChips, Field, Input } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { QUOTE } from '@/copy/quote';
import { SIZE_CHOICES_KW } from './quote-options';

export type Structure = 'rcc_elevated' | 'tin_shed' | 'ground_mount';

export interface QuoteForm {
  readonly sizeKw: string;
  readonly dcr: boolean;
  readonly panelId: string | null;
  readonly inverterId: string | null;
  readonly structure: Structure;
  readonly floors: string;
  readonly households: string;
  readonly distanceKm: string;
  readonly discount: string;
}

/** Size, panels, inverter, mounting and the few site numbers pricing needs. */
export function QuoteInputs({
  form,
  set,
  panels,
  inverters,
  suggestedInverterId,
  society,
}: {
  readonly form: QuoteForm;
  readonly set: <K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) => void;
  readonly panels: readonly Product[];
  readonly inverters: readonly Product[];
  readonly suggestedInverterId: string | null;
  readonly society: boolean;
}) {
  const sameType = panels.filter((panel) => panel.dcr === form.dcr);
  return (
    <View style={styles.root}>
      <Field label={QUOTE.size}>
        <ChoiceChips
          label={QUOTE.size}
          choices={SIZE_CHOICES_KW.map((kw) => ({ value: kw, label: QUOTE.sizeLabel(kw) }))}
          value={(SIZE_CHOICES_KW as readonly string[]).includes(form.sizeKw) ? form.sizeKw : null}
          onChange={(kw) => set('sizeKw', kw)}
        />
      </Field>
      <Field label={QUOTE.sizeCustom}>
        <Input
          value={form.sizeKw}
          onChangeText={(value) => set('sizeKw', value)}
          keyboardType="decimal-pad"
          mono
          accessibilityLabel={QUOTE.sizeCustom}
        />
      </Field>
      <Field label={QUOTE.panels}>
        <ChoiceChips
          kind="segmented"
          label={QUOTE.panels}
          choices={[
            { value: 'dcr', label: QUOTE.dcr },
            { value: 'nonDcr', label: QUOTE.nonDcr },
          ]}
          value={form.dcr ? 'dcr' : 'nonDcr'}
          onChange={(value) => {
            set('dcr', value === 'dcr');
            set('panelId', null);
          }}
        />
        {sameType.length > 1 ? (
          <ChoiceChips
            label={QUOTE.panels}
            choices={sameType.map((panel) => ({
              value: panel.id,
              label: `${panel.name} · ${panel.wattageWp ?? ''} Wp`,
            }))}
            value={form.panelId ?? sameType[0]?.id ?? null}
            onChange={(id) => set('panelId', id)}
          />
        ) : null}
      </Field>
      <Field label={QUOTE.inverter}>
        <ChoiceChips
          label={QUOTE.inverter}
          choices={inverters.map((inverter) => ({ value: inverter.id, label: inverter.name }))}
          value={form.inverterId ?? suggestedInverterId}
          onChange={(id) => set('inverterId', id)}
        />
      </Field>
      <Field label={QUOTE.structure}>
        <ChoiceChips
          kind="segmented"
          label={QUOTE.structure}
          choices={(Object.keys(QUOTE.structures) as Structure[]).map((value) => ({
            value,
            label: QUOTE.structures[value],
          }))}
          value={form.structure}
          onChange={(value) => set('structure', value)}
        />
      </Field>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Field label={QUOTE.floors}>
            <Input
              value={form.floors}
              onChangeText={(value) => set('floors', value)}
              keyboardType="number-pad"
              mono
              accessibilityLabel={QUOTE.floors}
            />
          </Field>
        </View>
        {society ? (
          <View style={styles.flex}>
            <Field label={QUOTE.households}>
              <Input
                value={form.households}
                onChangeText={(value) => set('households', value)}
                keyboardType="number-pad"
                mono
                accessibilityLabel={QUOTE.households}
              />
            </Field>
          </View>
        ) : null}
      </View>
      <Field label={QUOTE.distance} hint={QUOTE.distanceHint}>
        <Input
          value={form.distanceKm}
          onChangeText={(value) => set('distanceKm', value)}
          keyboardType="number-pad"
          mono
          accessibilityLabel={QUOTE.distance}
        />
      </Field>
      <Field label={QUOTE.discount} hint={QUOTE.discountHint} optional={COMMON.optional}>
        <Input
          value={form.discount}
          onChangeText={(value) => set('discount', value)}
          keyboardType="number-pad"
          mono
          accessibilityLabel={QUOTE.discount}
        />
      </Field>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 18 },
  pair: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
