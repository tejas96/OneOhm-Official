import type { LeadDetail } from '@oneohm/api-contracts';
import { Button, Card, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { LEAD_CONNECTION } from '@/copy/capture';
import { useDiscoms } from '@/features/discom/use-discoms';
import { useCan } from '@/session/session-provider';
import { LeadConnectionSheet, leadConnectionKey } from './lead-connection-sheet';

/** The lead's site with its consumer number and DISCOM, once the site is added. */
export function LeadConnection({ lead }: { readonly lead: LeadDetail }) {
  return lead.propertyId ? <SiteCard lead={lead} /> : null;
}

function SiteCard({ lead }: { readonly lead: LeadDetail }) {
  const theme = useTheme();
  const canEdit = useCan('leads.manage');
  const [editing, setEditing] = useState(false);
  const connection = useQuery({
    queryKey: leadConnectionKey(lead.id),
    queryFn: () => unwrap(api.siteConnection.leadConnection({ params: { id: lead.id } })),
  });
  const discoms = useDiscoms();
  if (connection.isError) {
    return (
      <Text variant="bodySm" tone="tertiary">
        {LEAD_CONNECTION.loadError}
      </Text>
    );
  }
  const site = connection.data;
  if (!site) return null;
  const discom = discoms.data?.find((item) => item.id === site.discomId);
  const facts = [
    { label: LEAD_CONNECTION.consumerNumber, value: site.consumerNumber },
    { label: LEAD_CONNECTION.discom, value: discom?.code ?? null },
  ];
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <MapPin size={16} color={theme.colors.textSecondary} />
        <Text variant="titleMd" style={styles.flex}>
          {LEAD_CONNECTION.title}
        </Text>
        {canEdit ? (
          <Button
            label={LEAD_CONNECTION.edit}
            size="sm"
            variant="quiet"
            accessibilityHint={LEAD_CONNECTION.editLabel}
            onPress={() => setEditing(true)}
          />
        ) : null}
      </View>
      <View style={styles.address}>
        <Text variant="body">{site.addressLine}</Text>
        <Text variant="bodySm" tone="secondary">
          {`${site.label} · ${site.city}`}
        </Text>
      </View>
      <View style={styles.facts}>
        {facts.map((fact) => (
          <View key={fact.label} style={styles.fact}>
            <Text variant="label" tone="tertiary">
              {fact.label}
            </Text>
            <Text variant="body" tone={fact.value ? 'primary' : 'tertiary'} numberOfLines={1}>
              {fact.value ?? LEAD_CONNECTION.notSet}
            </Text>
          </View>
        ))}
      </View>
      {canEdit && discoms.data ? (
        <LeadConnectionSheet
          key={`connection-${editing}`}
          lead={lead}
          site={site}
          discoms={discoms.data}
          open={editing}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  address: { gap: 2 },
  facts: { flexDirection: 'row' },
  fact: { width: '50%', gap: 2, paddingRight: 8 },
});
