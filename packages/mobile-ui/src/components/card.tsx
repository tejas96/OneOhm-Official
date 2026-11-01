import { RADIUS } from '@oneohm/design-system/tokens';
import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/theme';
import { PressableScale } from './pressable-scale';

export type CardTone = 'raised' | 'sunken' | 'panel' | 'ocean';

export interface CardProps {
  readonly children: ReactNode;
  readonly tone?: CardTone;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The surface everything sits on. `panel` is the theme's hero surface (white glow in
 * light, deep ocean in dark); `ocean` is always the deep ocean.
 */
export function Card({ children, tone = 'raised', onPress, accessibilityLabel, style }: CardProps) {
  const theme = useTheme();
  const { colors } = theme;
  const surface: ViewStyle =
    tone === 'sunken'
      ? { backgroundColor: colors.surfaceSunken, borderColor: 'transparent' }
      : tone === 'panel'
        ? { backgroundColor: colors.panel, borderColor: colors.panelLine }
        : tone === 'ocean'
          ? { backgroundColor: theme.ocean.panel, borderColor: theme.ocean.panelLine }
          : { backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle };
  const lift = tone === 'sunken' ? null : theme.scheme === 'dark' ? styles.liftDark : styles.lift;
  const composed = [styles.base, surface, lift, style];
  if (!onPress) return <View style={composed}>{children}</View>;
  return (
    <PressableScale
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      onPress={onPress}
      pressedScale={0.985}
      style={composed}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  lift: {
    shadowColor: '#14171A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  liftDark: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
