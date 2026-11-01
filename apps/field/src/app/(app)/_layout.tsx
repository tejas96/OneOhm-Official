import { useTheme } from '@oneohm/mobile-ui';
import { Stack } from 'expo-router';

/** Signed-in routes: the tabs, then task and lead screens pushed on top. */
export default function SignedInLayout() {
  const theme = useTheme();
  return (
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
    </Stack>
  );
}
