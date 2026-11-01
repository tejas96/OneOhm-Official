import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme';

export interface ScreenProps {
  readonly children: ReactNode;
  /** Pinned under the content (an action bar); stays above the keyboard. */
  readonly footer?: ReactNode;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
  /** The soft brand glow behind the top of the screen. */
  readonly glow?: boolean;
  /** Set false when the screen sits under a native header (no top inset). */
  readonly topInset?: boolean;
  readonly scroll?: boolean;
}

/** Every screen: canvas colour, safe areas, the brand glow, pull to refresh. */
export function Screen({
  children,
  footer,
  refreshing = false,
  onRefresh,
  glow = true,
  topInset = true,
  scroll = true,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: (topInset ? insets.top : 0) + 12,
    paddingBottom: (footer ? 16 : insets.bottom) + 24,
  };
  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.colors.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {glow ? <Glow from={theme.glow[0]} /> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, padding]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.accent}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, padding]}>{children}</View>
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: theme.colors.canvas,
              borderTopColor: theme.colors.borderSubtle,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Glow({ from }: { readonly from: string }) {
  return (
    <View pointerEvents="none" style={styles.glow}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="oh-screen-glow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={from} stopOpacity={1} />
            <Stop offset="1" stopColor={from} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#oh-screen-glow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },
  fill: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
});
