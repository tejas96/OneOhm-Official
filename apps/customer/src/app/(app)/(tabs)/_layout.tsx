import { fontFaceFor, useTheme } from '@oneohm/mobile-ui';
import { Tabs } from 'expo-router';
import { CircleUserRound, FileText, House, IndianRupee, LifeBuoy } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMMON } from '@/copy/common';

/** Home first; payments, papers and help one tap away. */
export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.textPrimary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarLabelStyle: { fontFamily: fontFaceFor('ui', 500), fontSize: 11, lineHeight: 16 },
        tabBarStyle: {
          backgroundColor: theme.colors.surfaceRaised,
          borderTopColor: theme.colors.borderSubtle,
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom + 4,
        },
        sceneStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: COMMON.tabs.home,
          tabBarIcon: ({ color }) => <House size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: COMMON.tabs.payments,
          tabBarIcon: ({ color }) => <IndianRupee size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: COMMON.tabs.documents,
          tabBarIcon: ({ color }) => <FileText size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: COMMON.tabs.support,
          tabBarIcon: ({ color }) => <LifeBuoy size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: COMMON.tabs.profile,
          tabBarIcon: ({ color }) => <CircleUserRound size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
