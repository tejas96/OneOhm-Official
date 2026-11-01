import type { ExtraLineInput } from '@oneohm/api-contracts';
import { Button, Card, formatInr, Text, useTheme } from '@oneohm/mobile-ui';
import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { QUOTE } from '@/copy/quote';
import { ExtraSheet } from './extra-sheet';

const shown = (line: ExtraLineInput) => {
  if (line.kind === 'gift') return QUOTE.extras.free;
  const paise = Math.round(line.quantity * line.unitPricePaise);
  return paise < 0 ? `− ${formatInr(-paise)}` : formatInr(paise);
};

/** Lines have no id until saved; what they say tells them apart. */
const lineKey = (line: ExtraLineInput) =>
  `${line.kind}:${line.description}:${line.unitPricePaise}:${line.unitCostPaise}:${line.reason}`;

/** Gifts, optional items, site charges and adjustments added on site. */
export function ExtrasBlock({
  extras,
  onChange,
}: {
  readonly extras: readonly ExtraLineInput[];
  readonly onChange: (extras: readonly ExtraLineInput[]) => void;
}) {
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const copy = QUOTE.extras;
  return (
    <View style={styles.root}>
      <SectionTitle title={copy.section} {...(extras.length > 0 ? { count: extras.length } : {})} />
      {extras.map((line, index) => (
        <Card key={lineKey(line)} style={styles.row}>
          <View style={styles.flex}>
            <Text variant="label" tone="tertiary">
              {copy.kinds[line.kind]}
            </Text>
            <Text variant="bodySm">{line.description}</Text>
            {line.reason ? (
              <Text variant="bodySm" tone="secondary">
                {line.reason}
              </Text>
            ) : null}
          </View>
          <Text variant="bodySm">{shown(line)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.remove(line.description)}
            hitSlop={12}
            onPress={() => onChange(extras.filter((_, at) => at !== index))}
          >
            <X size={18} color={theme.colors.textSecondary} />
          </Pressable>
        </Card>
      ))}
      <Button
        label={copy.addButton}
        variant="secondary"
        icon={<Plus size={18} color={theme.colors.textPrimary} />}
        onPress={() => setAdding(true)}
        disabled={extras.length >= 20}
      />
      <ExtraSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(line) => onChange([...extras, line])}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  flex: { flex: 1, gap: 2 },
});
