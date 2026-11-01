import { FONT_ASSETS, ThemeProvider, useTheme } from '@oneohm/mobile-ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '@/api/api';
import { ToastProvider } from '@/components/toast';
import { SessionProvider, useSession } from '@/session/session-provider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider>
              <ToastProvider>
                {/* Text is measured with the real faces only: render once fonts are in. */}
                {fontsLoaded || fontError !== null ? <RootNavigator /> : null}
              </ToastProvider>
            </SessionProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Routes follow the session; the splash stays up until the saved session is checked. */
function RootNavigator() {
  const { state } = useSession();
  const theme = useTheme();
  const settled = state.status !== 'restoring';
  useEffect(() => {
    if (settled) void SplashScreen.hideAsync();
  }, [settled]);
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Stack.Protected guard={state.status === 'signedIn'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={state.status === 'signedOut' || state.status === 'restoring'}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={state.status === 'unreachable'}>
          <Stack.Screen name="reconnect" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
