import { MIN_TOUCH_TARGET, RADIUS } from '@oneohm/design-system/tokens';
import { forwardRef, type ReactNode, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  View,
} from 'react-native';
import { fontFaceFor } from '../theme/fonts';
import { useTheme } from '../theme/theme';
import { Text } from './text';

export interface FieldProps {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly optional?: string | undefined;
  readonly children: ReactNode;
}

/** A label, the control, then either the error (in words) or a hint. */
export function Field({ label, hint, error, optional, children }: FieldProps) {
  const errorColor = useTheme().status.overdue.fg;
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text variant="label" tone="secondary">
          {label}
        </Text>
        {optional ? (
          <Text variant="label" tone="tertiary">
            {optional}
          </Text>
        ) : null}
      </View>
      {children}
      {error ? (
        <Text variant="bodySm" color={errorColor} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="bodySm" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface InputProps extends TextInputProps {
  readonly invalid?: boolean;
  readonly leading?: ReactNode;
  readonly mono?: boolean;
}

/** A text box with a calm focus ring; 48pt tall so it is easy to hit on site. */
export const Input = forwardRef<TextInputInstance, InputProps>(function Input(
  { invalid = false, leading, mono = false, style, onFocus, onBlur, ...props },
  ref,
) {
  const theme = useTheme();
  const { colors } = theme;
  const [focused, setFocused] = useState(false);
  const borderColor = invalid
    ? theme.status.overdue.solid
    : focused
      ? colors.focusRing
      : colors.borderStrong;
  return (
    <View
      style={[
        styles.box,
        { backgroundColor: colors.surfaceRaised, borderColor },
        focused ? { shadowColor: colors.focusRing, shadowOpacity: 0.25, shadowRadius: 6 } : null,
      ]}
    >
      {leading}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          {
            color: colors.textPrimary,
            fontFamily: fontFaceFor(mono ? 'mono' : 'ui', 400),
          },
          props.multiline ? styles.multiline : null,
          style,
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  box: {
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 12, outlineStyle: 'none' } as never,
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
