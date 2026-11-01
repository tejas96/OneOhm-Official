import { RADIUS } from '@oneohm/design-system/tokens';
import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputInstance, View } from 'react-native';
import { Text } from '../components/text';
import { useTheme } from '../theme/theme';

const LENGTH = 6;

/**
 * Six boxes over one real text field, so SMS autofill, paste and the numeric keypad
 * all work; the boxes only draw what was typed.
 */
export function CodeBoxes({
  value,
  onChange,
  label,
  invalid = false,
  onFilled,
}: {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly label: string;
  readonly invalid?: boolean;
  readonly onFilled?: (code: string) => void;
}) {
  const theme = useTheme();
  const input = useRef<TextInputInstance>(null);
  const digits = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('');
  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}>
      <View style={styles.row}>
        {digits.map((digit, index) => {
          const active = index === Math.min(value.length, LENGTH - 1);
          const border = invalid
            ? theme.status.overdue.solid
            : active
              ? theme.colors.focusRing
              : theme.colors.borderStrong;
          return (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: positions are the identity here.
              key={index}
              style={[
                styles.box,
                { borderColor: border, backgroundColor: theme.colors.surfaceRaised },
              ]}
            >
              <Text variant="displayMd">{digit.trim()}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => {
          const code = text.replace(/\D/g, '').slice(0, LENGTH);
          onChange(code);
          if (code.length === LENGTH) onFilled?.(code);
        }}
        accessibilityLabel={label}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={LENGTH}
        autoFocus
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  box: {
    flex: 1,
    aspectRatio: 0.86,
    maxWidth: 54,
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { ...StyleSheet.absoluteFill, opacity: 0.015, color: 'transparent' },
});
