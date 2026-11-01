import { MIN_TOUCH_TARGET, RADIUS } from '@oneohm/design-system/tokens';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import { type MobileTheme, useTheme } from '../theme/theme';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'panel';

export interface ButtonProps {
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: ButtonVariant;
  readonly size?: 'md' | 'lg' | 'sm';
  readonly icon?: ReactNode;
  readonly trailingIcon?: ReactNode;
  readonly pending?: boolean;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly accessibilityHint?: string;
  readonly style?: ViewStyle;
}

function palette(theme: MobileTheme, variant: ButtonVariant) {
  const { colors } = theme;
  switch (variant) {
    case 'primary':
      return { bg: colors.accent, fg: colors.onAccent, border: colors.accent };
    case 'secondary':
      return { bg: colors.surfaceRaised, fg: colors.textPrimary, border: colors.borderStrong };
    case 'danger':
      return { bg: theme.status.overdue.tint, fg: theme.status.overdue.fg, border: 'transparent' };
    case 'panel':
      return {
        bg: 'rgba(255,255,255,0.12)',
        fg: theme.ocean.onPanel,
        border: 'rgba(255,255,255,0.2)',
      };
    default:
      return { bg: 'transparent', fg: colors.accent, border: 'transparent' };
  }
}

const HEIGHT = { sm: 36, md: MIN_TOUCH_TARGET, lg: 54 } as const;

/** One button for the whole app; shows a spinner and blocks repeat taps while pending. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  pending = false,
  disabled = false,
  fullWidth = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const colors = palette(theme, variant);
  const inactive = disabled || pending;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: inactive, busy: pending }}
      disabled={inactive}
      onPress={onPress}
      style={[
        styles.base,
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? 12 : 18,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        },
        fullWidth ? styles.full : null,
        variant === 'primary' ? styles.lift : null,
        style,
      ]}
    >
      {pending ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text variant={size === 'sm' ? 'label' : 'titleMd'} color={colors.fg} numberOfLines={1}>
            {label}
          </Text>
          {trailingIcon}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  full: { alignSelf: 'stretch' },
  lift: {
    shadowColor: '#002840',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
