import type { ExtraLineInput } from '@oneohm/api-contracts';
import { EXTRA_KINDS, type ExtraKind } from '@oneohm/domain';
import { Button, ChoiceChips, Field, Input, Sheet } from '@oneohm/mobile-ui';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { QUOTE } from '@/copy/quote';
import {
  EMPTY_EXTRA_FORM,
  type ExtraForm,
  type ExtraProblem,
  extraFromForm,
  takesAmount,
  takesCost,
} from './quote-extras';

/**
 * Add an extra on site (PRD 3.5, 3.9): a gift, an optional item, a charge this site
 * needs, or an adjustment. Anything that changes the price or cost needs a reason.
 */
export function ExtraSheet({
  open,
  onClose,
  onAdd,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAdd: (line: ExtraLineInput) => void;
}) {
  const copy = QUOTE.extras;
  const [form, setForm] = useState<ExtraForm>(EMPTY_EXTRA_FORM);
  const [problems, setProblems] = useState<readonly ExtraProblem[]>([]);
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_EXTRA_FORM);
    setProblems([]);
  }, [open]);
  const set = <K extends keyof ExtraForm>(key: K, value: ExtraForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const error = (field: ExtraProblem) =>
    problems.includes(field) ? copy.errors[field] : undefined;
  const add = () => {
    const result = extraFromForm(form);
    if ('problems' in result) {
      setProblems(result.problems);
      return;
    }
    onAdd(result.line);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.hints[form.kind]}
      closeLabel={COMMON.close}
      footer={<Button label={copy.add} onPress={add} fullWidth />}
    >
      <View style={styles.root}>
        <ChoiceChips
          label={copy.kind}
          choices={EXTRA_KINDS.map((value: ExtraKind) => ({ value, label: copy.kinds[value] }))}
          value={form.kind}
          onChange={(value) => set('kind', value)}
        />
        <Field label={copy.description} error={error('description')}>
          <Input
            value={form.description}
            onChangeText={(value) => set('description', value)}
            maxLength={160}
            invalid={Boolean(error('description'))}
            accessibilityLabel={copy.description}
          />
        </Field>
        {form.kind === 'adjustment' ? (
          <ChoiceChips
            kind="segmented"
            label={copy.direction}
            choices={[
              { value: 'lower', label: copy.lower },
              { value: 'raise', label: copy.raise },
            ]}
            value={form.lowers ? 'lower' : 'raise'}
            onChange={(value) => set('lowers', value === 'lower')}
          />
        ) : null}
        <View style={styles.pair}>
          {takesAmount(form.kind) ? (
            <View style={styles.flex}>
              <Field label={copy.amount[form.kind]} error={error('amount')}>
                <Input
                  value={form.amount}
                  onChangeText={(value) => set('amount', value)}
                  invalid={Boolean(error('amount'))}
                  keyboardType="decimal-pad"
                  mono
                  accessibilityLabel={copy.amount[form.kind]}
                />
              </Field>
            </View>
          ) : null}
          {takesCost(form.kind) ? (
            <View style={styles.flex}>
              <Field label={copy.cost} error={error('cost')} optional={COMMON.optional}>
                <Input
                  value={form.cost}
                  onChangeText={(value) => set('cost', value)}
                  invalid={Boolean(error('cost'))}
                  keyboardType="decimal-pad"
                  mono
                  accessibilityLabel={copy.cost}
                />
              </Field>
            </View>
          ) : null}
        </View>
        {form.kind !== 'optional' ? (
          <Field label={copy.reason} error={error('reason')}>
            <Input
              value={form.reason}
              onChangeText={(value) => set('reason', value)}
              multiline
              maxLength={300}
              invalid={Boolean(error('reason'))}
              accessibilityLabel={copy.reason}
            />
          </Field>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  pair: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
