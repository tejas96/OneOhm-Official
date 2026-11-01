import { ChoiceChips, Screen, Text } from '@oneohm/mobile-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CREW } from '@/copy/crew';
import { Bell } from '@/features/alerts/bell';
import { FeedbackSection } from './feedback-section';
import { MaterialSection } from './material-section';
import { PaymentsSection } from './payments-section';
import { CREW_KEYS } from './use-crew';
import { WorkOrdersSection } from './work-orders-section';

const SECTIONS = ['orders', 'material', 'payments', 'feedback'] as const;
type Section = (typeof SECTIONS)[number];
const isSection = (value: unknown): value is Section =>
  typeof value === 'string' && (SECTIONS as readonly string[]).includes(value);

/**
 * The crew's own work (PRD 4.9): work orders, material with the crew, payments to its
 * contractor and feedback, one section at a time. No project prices or margins.
 */
export function CrewScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(
    isSection(params.section) ? params.section : 'orders',
  );
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await client.invalidateQueries({ queryKey: CREW_KEYS.all });
        setRefreshing(false);
      }}
    >
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text variant="overline" tone="tertiary">
            {CREW.overline}
          </Text>
          <Bell />
        </View>
        <Text variant="displayLg">{CREW.title}</Text>
      </View>
      <ChoiceChips
        kind="segmented"
        label={CREW.sections.label}
        choices={SECTIONS.map((value) => ({ value, label: CREW.sections[value] }))}
        value={section}
        onChange={setSection}
      />
      {section === 'orders' ? <WorkOrdersSection /> : null}
      {section === 'material' ? <MaterialSection /> : null}
      {section === 'payments' ? <PaymentsSection /> : null}
      {section === 'feedback' ? <FeedbackSection /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 2, paddingTop: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
