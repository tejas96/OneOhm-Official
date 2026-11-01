import { useTheme } from '@oneohm/mobile-ui';
import { Stack } from 'expo-router';
import { ProjectChoiceProvider } from '@/features/home/use-home';

/** Signed-in routes: the tabs, then refer, feedback and a new help request on top. */
export default function SignedInLayout() {
  const theme = useTheme();
  return (
    <ProjectChoiceProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="refer" />
        <Stack.Screen name="feedback/[projectId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="help/new" options={{ presentation: 'modal' }} />
      </Stack>
    </ProjectChoiceProvider>
  );
}
