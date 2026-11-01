import { fontFaceFor, useTheme } from '@oneohm/mobile-ui';
import { Tabs } from 'expo-router';
import {
  Calculator,
  CalendarDays,
  CircleUserRound,
  HardHat,
  ReceiptIndianRupee,
  Sun,
  Target,
  Users,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMMON } from '@/copy/common';
import { useIsCrew } from '@/features/crew/use-crew';
import { useCan } from '@/session/session-provider';

/**
 * Today for everyone; Leads and Quote only for people who sell (sales, marketing,
 * resellers). Crews see their work and nothing else.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sells = useCan('leads.manage', 'leads.view_own', 'leads.view_all');
  const quotes = useCan('quotations.create');
  const takesLeave = useCan('leave.request');
  const crew = useIsCrew();
  const earns = useCan('commission.view_own');
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
          title: COMMON.tabs.today,
          tabBarIcon: ({ color }) => <Sun size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="work"
        options={{
          title: COMMON.tabs.work,
          href: crew ? '/work' : null,
          tabBarIcon: ({ color }) => <HardHat size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          title: COMMON.tabs.leads,
          href: sells ? '/leads' : null,
          tabBarIcon: ({ color }) => <Target size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="quote"
        options={{
          title: COMMON.tabs.quote,
          href: quotes ? '/quote' : null,
          tabBarIcon: ({ color }) => <Calculator size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: COMMON.tabs.customers,
          href: earns ? '/customers' : null,
          tabBarIcon: ({ color }) => <Users size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: COMMON.tabs.earnings,
          href: earns ? '/earnings' : null,
          tabBarIcon: ({ color }) => <ReceiptIndianRupee size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: COMMON.tabs.leave,
          href: takesLeave ? '/leave' : null,
          tabBarIcon: ({ color }) => <CalendarDays size={22} color={color} />,
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
