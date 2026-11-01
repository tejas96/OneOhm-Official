import { useTheme } from '@oneohm/mobile-ui';
import { Stack } from 'expo-router';
import { PushAlerts } from '@/features/alerts/push-alerts';

/** Signed-in routes: the tabs, then task, lead and alert screens pushed on top. */
export default function SignedInLayout() {
  const theme = useTheme();
  return (
    <>
      <PushAlerts />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="tasks/[id]" />
        <Stack.Screen name="leads/[id]" />
        <Stack.Screen name="leads/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="leave/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="alerts" />
      </Stack>
    </>
  );
}
