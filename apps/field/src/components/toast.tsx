import { Text, useTheme } from '@oneohm/mobile-ui';
import * as Haptics from 'expo-haptics';
import { CircleCheck } from 'lucide-react-native';
import { createContext, type ReactNode, use, useCallback, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ToastContext = createContext<(message: string) => void>(() => undefined);

/** A short confirmation at the top of the screen, with a success tap on the phone. */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const shown = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (next: string) => {
      setMessage(next);
      if (Platform.OS !== 'web')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (timer.current) clearTimeout(timer.current);
      Animated.spring(shown, {
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
        stiffness: 380,
        damping: 32,
      }).start();
      timer.current = setTimeout(() => {
        Animated.timing(shown, {
          toValue: 0,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }).start(() => setMessage(null));
      }, 2400);
    },
    [shown],
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
            <CircleCheck size={18} color={theme.colors.energy} />
            <Text variant="bodySm" color={theme.colors.canvas}>
              {message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext>
  );
}

export function useToast(): (message: string) => void {
  return use(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
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
