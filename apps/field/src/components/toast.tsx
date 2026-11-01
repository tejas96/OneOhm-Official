import {
  canShowIllustrations,
  Illustration,
  type IllustrationName,
  Text,
  useReducedMotion,
  useTheme,
} from '@oneohm/mobile-ui';
import * as Haptics from 'expo-haptics';
import { CircleCheck } from 'lucide-react-native';
import { createContext, type ReactNode, use, useCallback, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ToastOptions {
  /** A small illustration in place of the tick, for moments worth marking. */
  readonly illustration?: IllustrationName;
}

type ShowToast = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ShowToast>(() => undefined);

/** A short confirmation at the top of the screen, with a success tap on the phone. */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const [illustration, setIllustration] = useState<IllustrationName | null>(null);
  const shown = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (next: string, options?: ToastOptions) => {
      setMessage(next);
      setIllustration(options?.illustration ?? null);
      if (Platform.OS !== 'web')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (timer.current) clearTimeout(timer.current);
      // Reduced motion: the toast simply appears and disappears.
      if (reduced) shown.setValue(1);
      else
        Animated.spring(shown, {
          toValue: 1,
          useNativeDriver: Platform.OS !== 'web',
          stiffness: 380,
          damping: 32,
        }).start();
      timer.current = setTimeout(() => {
        Animated.timing(shown, {
          toValue: 0,
          duration: reduced ? 0 : 180,
          useNativeDriver: Platform.OS !== 'web',
        }).start(() => setMessage(null));
      }, 2400);
    },
    [shown, reduced],
  );

  return (
    <ToastContext value={show}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.wrap,
            {
              top: insets.top + 8,
              opacity: shown,
              transform: [
                { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
              ],
            },
          ]}
        >
          <View style={[styles.toast, { backgroundColor: theme.colors.textPrimary }]}>
            {illustration && canShowIllustrations() ? (
              // The toast is inverted (dark on a light theme), so are its colours.
              <Illustration
                name={illustration}
                size={28}
                scheme={theme.scheme === 'dark' ? 'light' : 'dark'}
                style={styles.art}
              />
            ) : (
              <CircleCheck size={18} color={theme.colors.energy} />
            )}
            <Text variant="bodySm" color={theme.colors.canvas}>
              {message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext>
  );
}

export function useToast(): ShowToast {
  return use(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  art: { marginVertical: -4, marginLeft: -6 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
});
