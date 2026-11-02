import { MIN_TOUCH_TARGET, RADIUS } from '@oneohm/design-system/tokens';
import { matchesSearch } from '@oneohm/shared';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { Input } from './field';
import { PressableScale } from './pressable-scale';
import { Sheet } from './sheet';
import { Text } from './text';

export interface PickerOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** A second line under the label, also searched. */
  readonly description?: string | undefined;
  /** Extra words that find this option but are not shown (SKU, brand). */
  readonly keywords?: string | undefined;
}

/** How many matches the sheet lists at once; typing narrows the rest. */
const LIMIT = 60;

export interface SearchPickerWords {
  readonly placeholder: string;
  readonly search: string;
  readonly empty: string;
  /** Shown under a cut list. */
  readonly more: (shown: number, total: number) => string;
  readonly close: string;
}

/**
 * Pick one of a long list (a catalog of a thousand products): the field shows the pick;
 * a tap opens a sheet with a search box. Every word typed must match.
 */
export function SearchPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  words,
  invalid = false,
}: {
  readonly label: string;
  readonly value: T | null;
  readonly options: readonly PickerOption<T>[];
  readonly onChange: (value: T) => void;
  readonly words: SearchPickerWords;
  readonly invalid?: boolean;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);
  const matches = useMemo(
    () =>
      options.filter((option) =>
        matchesSearch(
          `${option.label} ${option.description ?? ''} ${option.keywords ?? ''}`,
          query,
        ),
      ),
    [options, query],
  );
  const shown = matches.slice(0, LIMIT);
  const selected = options.find((option) => option.value === value);
  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? words.placeholder }}
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: invalid ? theme.status.overdue.solid : colors.borderStrong,
          },
        ]}
      >
        <View style={styles.flex}>
          <Text variant="body" tone={selected ? 'primary' : 'tertiary'} numberOfLines={1}>
            {selected?.label ?? words.placeholder}
          </Text>
          {selected?.description ? (
            <Text variant="bodySm" tone="tertiary" numberOfLines={1}>
              {selected.description}
            </Text>
          ) : null}
        </View>
        <Text variant="body" tone="tertiary" accessibilityElementsHidden>
          ⌄
        </Text>
      </PressableScale>
      <Sheet open={open} onClose={() => setOpen(false)} title={label} closeLabel={words.close}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={words.search}
          accessibilityLabel={words.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {shown.length === 0 ? (
          <Text variant="bodySm" tone="secondary">
            {words.empty}
          </Text>
        ) : (
          <View style={styles.list}>
            {shown.map((option) => {
              const isSelected = option.value === value;
              return (
                <PressableScale
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, checked: isSelected }}
                  accessibilityLabel={option.label}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={[
                    styles.row,
                    {
                      borderColor: isSelected ? colors.accent : colors.borderSubtle,
                      backgroundColor: isSelected ? colors.canvas : colors.surfaceRaised,
                    },
                  ]}
                >
                  <View style={styles.flex}>
                    <Text variant="body" numberOfLines={2}>
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text variant="bodySm" tone="tertiary" numberOfLines={1}>
                        {option.description}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <Text variant="label" tone="accent">
                      ✓
                    </Text>
                  ) : null}
                </PressableScale>
              );
            })}
          </View>
        )}
        {matches.length > shown.length ? (
          <Text variant="bodySm" tone="tertiary">
            {words.more(shown.length, matches.length)}
          </Text>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  trigger: {
    minHeight: MIN_TOUCH_TARGET + 4,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  list: { gap: 6 },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
