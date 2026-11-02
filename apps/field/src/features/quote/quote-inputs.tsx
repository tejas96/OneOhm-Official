import type { ExtraLineInput, Product } from '@oneohm/api-contracts';
import { STRUCTURE_TYPES, type StructureType } from '@oneohm/domain';
import { ChoiceChips, Field, Input, SearchPicker } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { QUOTE } from '@/copy/quote';
import { InverterRows, productOptions, SEARCH_WORDS } from './inverter-rows';
import { type InverterRow, parseKw, SIZE_CHOICES_KW } from './quote-options';

/** Every kind of site the costing engine prices (PRD 3.9). */
export type Structure = StructureType;

export interface QuoteForm {
  readonly sizeKw: string;
  readonly dcr: boolean;
  readonly panelId: string | null;
  /** The inverter rows; null follows the suggestion for the size. */
  readonly inverters: readonly InverterRow[] | null;
  readonly structure: Structure;
  readonly floors: string;
  readonly households: string;
  readonly distanceKm: string;
  readonly discount: string;
  /** Gifts, optional items, site charges and adjustments added on site. */
  readonly extras: readonly ExtraLineInput[];
}

/** Size, panels, inverter, mounting and the few site numbers pricing needs. */
export function QuoteInputs({
  form,
  set,
  panels,
  inverters,
  inverterRows,
  panelId,
  society,
  errors = {},
}: {
  readonly form: QuoteForm;
  readonly set: <K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) => void;
  readonly panels: readonly Product[];
  readonly inverters: readonly Product[];
  /** The rows priced: the ones typed, or the suggestion until then. */
  readonly inverterRows: readonly InverterRow[];
  /** The panel priced, to check the inverters against. */
  readonly panelId: string | null;
  readonly society: boolean;
  /** Messages keyed by the request's fields (targetWp, floors, distanceKm…). */
  readonly errors?: Readonly<Record<string, string>>;
}) {
  const sameType = panels.filter((panel) => panel.dcr === form.dcr);
  const wattage = panels.find((panel) => panel.id === panelId)?.wattageWp ?? 0;
  const targetWp = parseKw(form.sizeKw) ?? 0;
  const capacityWp = wattage > 0 ? Math.ceil(targetWp / wattage) * wattage : 0;
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
      <Field label={QUOTE.sizeCustom} error={errors.targetWp}>
        <Input
          value={form.sizeKw}
          onChangeText={(value) => set('sizeKw', value)}
          keyboardType="decimal-pad"
          maxLength={7}
          invalid={Boolean(errors.targetWp)}
          mono
          accessibilityLabel={QUOTE.sizeCustom}
        />
      </Field>
      <Field label={QUOTE.panels} error={errors.panelProductId}>
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
          <SearchPicker
            label={QUOTE.panels}
            value={form.panelId ?? sameType[0]?.id ?? null}
            options={productOptions(sameType, (panel) => `${panel.wattageWp ?? ''} Wp`)}
            onChange={(id) => set('panelId', id)}
            words={SEARCH_WORDS}
          />
        ) : null}
      </Field>
      <InverterRows
        rows={inverterRows}
        onChange={(rows) => set('inverters', rows)}
        inverters={inverters}
        capacityWp={capacityWp}
        error={
          errors.inverters ??
          errors.inverterProductId ??
          Object.entries(errors).find(([key]) => key.startsWith('inverters.'))?.[1]
        }
      />
      <Field label={QUOTE.structure} error={errors.structureType}>
        <ChoiceChips
          label={QUOTE.structure}
          choices={STRUCTURE_TYPES.map((value) => ({
            value,
            label: QUOTE.structures[value],
          }))}
          value={form.structure}
          onChange={(value) => set('structure', value)}
        />
      </Field>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Field label={QUOTE.floors} error={errors.floors}>
            <Input
              value={form.floors}
              onChangeText={(value) => set('floors', value)}
              keyboardType="number-pad"
              maxLength={2}
              invalid={Boolean(errors.floors)}
              mono
              accessibilityLabel={QUOTE.floors}
            />
          </Field>
        </View>
        {society ? (
          <View style={styles.flex}>
            <Field label={QUOTE.households} error={errors.households}>
              <Input
                value={form.households}
                onChangeText={(value) => set('households', value)}
                keyboardType="number-pad"
                maxLength={5}
                invalid={Boolean(errors.households)}
                mono
                accessibilityLabel={QUOTE.households}
              />
            </Field>
          </View>
        ) : null}
      </View>
      <Field label={QUOTE.distance} hint={QUOTE.distanceHint} error={errors.distanceKm}>
        <Input
          value={form.distanceKm}
          onChangeText={(value) => set('distanceKm', value)}
          keyboardType="number-pad"
          maxLength={4}
          invalid={Boolean(errors.distanceKm)}
          mono
          accessibilityLabel={QUOTE.distance}
        />
      </Field>
      <Field
        label={QUOTE.discount}
        hint={QUOTE.discountHint}
        optional={COMMON.optional}
        error={errors.discountPaise}
      >
        <Input
          value={form.discount}
          onChangeText={(value) => set('discount', value)}
          keyboardType="number-pad"
          maxLength={9}
          invalid={Boolean(errors.discountPaise)}
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
