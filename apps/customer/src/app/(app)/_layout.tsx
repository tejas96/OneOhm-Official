import { useTheme } from '@oneohm/mobile-ui';
import { Stack } from 'expo-router';
import { PushAlerts } from '@/features/alerts/push-alerts';
import { ProjectChoiceProvider } from '@/features/home/use-home';

/** Signed-in routes: the tabs, then refer, feedback, a new help request and updates on top. */
export default function SignedInLayout() {
  const theme = useTheme();
  return (
    <ProjectChoiceProvider>
      <PushAlerts />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="refer" />
        <Stack.Screen name="family" />
        <Stack.Screen name="feedback/[projectId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="feedback/stage" options={{ presentation: 'modal' }} />
        <Stack.Screen name="help/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="help/warranty" />
        <Stack.Screen name="help/rate/[requestId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="alerts" />
      </Stack>
    </ProjectChoiceProvider>
  );
}
