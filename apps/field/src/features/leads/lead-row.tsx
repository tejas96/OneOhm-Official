import type { Lead } from '@oneohm/api-contracts';
import { Card, StatusPill, Text, type Tone, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { LEADS } from '@/copy/sales';
import { relativeDate } from '@/lib/dates';

const STAGE_TONE: Readonly<Record<Lead['stage'], Tone>> = {
  new: 'review',
  contacted: 'neutral',
  survey_scheduled: 'onTrack',
  quoted: 'waiting',
  won: 'done',
  lost: 'neutral',
};

/** One lead: who, where, its stage and the next follow-up (overdue in red, never silent). */
export function LeadRow({ lead }: { readonly lead: Lead }) {
  const theme = useTheme();
  const next = lead.nextActionOn ? LEADS.next(relativeDate(lead.nextActionOn)) : LEADS.noNext;
  return (
    <Card
      onPress={() => router.push(`/leads/${lead.id}`)}
      accessibilityLabel={lead.name}
      style={styles.card}
    >
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="titleMd" numberOfLines={1}>
            {lead.name}
          </Text>
          <Text variant="bodySm" tone="secondary" numberOfLines={1}>
            {lead.city}
            {lead.estimatedWp ? ` · ${LEADS.kw((lead.estimatedWp / 1000).toFixed(1))}` : ''}
          </Text>
        </View>
        <ChevronRight size={18} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.bottom}>
        <StatusPill tone={STAGE_TONE[lead.stage]} label={LEADS.stage[lead.stage]} size="sm" />
        <Text
          variant="label"
          color={lead.overdue ? theme.status.overdue.fg : theme.colors.textSecondary}
        >
          {lead.overdue ? LEADS.overdue : next}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, paddingVertical: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, gap: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
