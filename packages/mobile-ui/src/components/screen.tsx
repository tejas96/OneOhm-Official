import { type ReactNode, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
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

/** Room left between the focused field (or the footer) and the keyboard. */
const KEYBOARD_GAP = 24;

/**
 * Every screen: canvas colour, safe areas, the brand glow, pull to refresh. Keyboard-aware
 * on both platforms: a scrolling screen scrolls the focused field above the keyboard and
 * the footer rides on top of it; a fixed screen (a chat) shrinks above the keyboard.
 */
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
  // The footer covers the bottom of the list while the keyboard is up, minus the safe
  // area it no longer needs; the focused field has to clear it too.
  const [footerHeight, setFooterHeight] = useState(0);
  const footerOverlap = footer ? Math.max(footerHeight - insets.bottom, 0) : 0;
  const footerView = footer ? (
    <View
      onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
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
  ) : null;
  const background = { backgroundColor: theme.colors.canvas };

  if (!scroll)
    return (
      // The bottom safe area sits under the keyboard while it is up, so it is not lifted.
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={insets.bottom}
        style={[styles.root, background]}
      >
        {glow ? <Glow from={theme.glow[0]} /> : null}
        <View style={[styles.content, styles.fill, padding]}>{children}</View>
        {footerView}
      </KeyboardAvoidingView>
    );
  return (
    <View style={[styles.root, background]}>
      {glow ? <Glow from={theme.glow[0]} /> : null}
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.content, padding]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={footerOverlap + KEYBOARD_GAP}
        extraKeyboardSpace={footerOverlap}
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
      </KeyboardAwareScrollView>
      {footerView ? (
        // Opened: the keyboard already covers the safe area, so drop that padding.
        <KeyboardStickyView offset={{ opened: insets.bottom }}>{footerView}</KeyboardStickyView>
      ) : null}
    </View>
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
