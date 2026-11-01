import type { LeadDetail } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  describeError,
  ErrorState,
  LoadingState,
  Screen,
  StatusPill,
  Text,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Calculator, MapPinPlus, MessageCircle, Phone } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { ScreenHeader, SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { LEAD, LEAD_SITE, LEADS } from '@/copy/sales';
import { relativeDate, shortDate, shortMoment } from '@/lib/dates';
import { useCan } from '@/session/session-provider';
import { FollowUpSheet } from './follow-up-sheet';
import { LeadConnection } from './lead-connection';
import { LeadPapers } from './lead-papers';
import { LeadQuotes } from './lead-quotes';
import { LeadSiteSheet } from './lead-site-sheet';
import { LostLeadCard } from './lost-lead-card';

/** One lead: reach them in a tap, see the history, log the follow-up. */
export function LeadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['lead', id],
    queryFn: () => unwrap(api.crm.getLead({ params: { id } })),
  });
  if (query.isPending)
    return (
      <Screen>
        <LoadingState label={COMMON.loading} />
      </Screen>
    );
  if (query.isError) {
    return (
      <Screen>
        <ScreenHeader title={LEADS.title} />
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }
  return <LeadDetailView lead={query.data} />;
}

function LeadDetailView({ lead }: { readonly lead: LeadDetail }) {
  const theme = useTheme();
  const canQuote = useCan('quotations.create');
  const canAddSite = useCan('quotations.create', 'customers.manage');
  const [logging, setLogging] = useState(false);
  const [addingSite, setAddingSite] = useState(false);
  const needsSite = !lead.propertyId && lead.stage !== 'won' && lead.stage !== 'lost';
  const digits = lead.phone.replace(/\D/g, '');
  const details = [
    { label: LEAD.city, value: lead.city },
    { label: LEAD.source, value: LEAD.sources[lead.source] },
    {
      label: LEAD.size,
      value: lead.estimatedWp ? LEADS.kw((lead.estimatedWp / 1000).toFixed(1)) : '—',
    },
    { label: LEAD.owner, value: lead.owner?.fullName ?? '—' },
  ];
  return (
    <Screen
      footer={<Button label={LEAD.log} size="lg" fullWidth onPress={() => setLogging(true)} />}
    >
      <ScreenHeader overline={lead.phone} title={lead.name} />
      <View style={styles.row}>
        <StatusPill tone={lead.overdue ? 'overdue' : 'neutral'} label={LEADS.stage[lead.stage]} />
        {lead.revisitDue ? <StatusPill tone="atRisk" label={LEAD.revisitDue} /> : null}
        <Text
          variant="label"
          color={lead.overdue ? theme.status.overdue.fg : theme.colors.textSecondary}
        >
          {followUpLine(lead)}
        </Text>
      </View>
      {lead.nextActionNote ? (
        <Text variant="body" tone="secondary">
          {lead.nextActionNote}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label={LEAD.call}
          variant="secondary"
          style={styles.flex}
          icon={<Phone size={16} color={theme.colors.textPrimary} />}
          onPress={() => void Linking.openURL(`tel:${lead.phone}`)}
        />
        <Button
          label={LEAD.whatsapp}
          variant="secondary"
          style={styles.flex}
          icon={<MessageCircle size={16} color={theme.colors.textPrimary} />}
          onPress={() => void Linking.openURL(`https://wa.me/${digits}`)}
        />
      </View>
      {lead.stage === 'lost' ? <LostLeadCard lead={lead} /> : null}
      {canAddSite && needsSite ? (
        <View style={styles.site}>
          <Text variant="bodySm" tone="secondary">
            {LEAD_SITE.needed}
          </Text>
          <Button
            label={LEAD_SITE.add}
            variant="secondary"
            icon={<MapPinPlus size={16} color={theme.colors.textPrimary} />}
            onPress={() => setAddingSite(true)}
          />
        </View>
      ) : null}
      {canQuote ? (
        <Button
          label={LEAD.quote}
          icon={<Calculator size={16} color={theme.colors.onAccent} />}
          onPress={() => router.push({ pathname: '/quote', params: { leadId: lead.id } })}
        />
      ) : null}
      <Card style={styles.details}>
        {details.map((item) => (
          <View key={item.label} style={styles.detail}>
            <Text variant="label" tone="tertiary">
              {item.label}
            </Text>
            <Text variant="body" numberOfLines={1}>
              {item.value}
            </Text>
          </View>
        ))}
      </Card>
      <LeadConnection lead={lead} />
      <LeadPapers lead={lead} />
      <LeadQuotes quotations={lead.quotations} />
      <SectionTitle title={LEAD.history} count={lead.activities.length} />
      {lead.activities.length === 0 ? (
        <Text variant="bodySm" tone="tertiary">
          {LEAD.noHistory}
        </Text>
      ) : null}
      <View style={styles.timeline}>
        {lead.activities.map((activity) => (
          <View key={activity.id} style={styles.event}>
            <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
            <View style={styles.flex}>
              <Text variant="label" tone="tertiary">
                {LEAD.activity[activity.kind]} · {shortMoment(activity.createdAt)}
                {activity.user ? ` · ${activity.user.fullName}` : ''}
              </Text>
              <Text variant="body">{activity.note}</Text>
            </View>
          </View>
        ))}
      </View>
      <FollowUpSheet lead={lead} open={logging} onClose={() => setLogging(false)} />
      {canAddSite && needsSite ? (
        <LeadSiteSheet lead={lead} open={addingSite} onClose={() => setAddingSite(false)} />
      ) : null}
    </Screen>
  );
}

/** The follow-up line under the stage: overdue, the next date, or when to try again. */
function followUpLine(lead: LeadDetail): string {
  if (lead.stage === 'lost') return lead.revisitOn ? LEAD.revisitOn(shortDate(lead.revisitOn)) : '';
  if (lead.overdue) return LEADS.overdue;
  return lead.nextActionOn ? LEADS.next(relativeDate(lead.nextActionOn)) : LEADS.noNext;
}

const styles = StyleSheet.create({
  site: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  flex: { flex: 1 },
  details: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  detail: { width: '50%', gap: 2, paddingRight: 8 },
  timeline: { gap: 14 },
  event: { flexDirection: 'row', gap: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
});
