import { Card, Input, LoadingState, Sheet, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { QUOTE } from '@/copy/quote';
import { useCan } from '@/session/session-provider';
import type { QuoteSite } from './quote-options';
import { siteFromLead, siteFromProperty } from './use-quote-site';

/** Pick the site: from the person's leads that have one, or (office staff) any customer. */
export function SiteSheet({
  open,
  onClose,
  onPick,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onPick: (site: QuoteSite) => void;
}) {
  const theme = useTheme();
  const canSeeCustomers = useCan('customers.view');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const leads = useQuery({
    queryKey: keys.leads,
    queryFn: () => unwrap(api.crm.listLeads({ query: { open: true } })),
    enabled: open,
  });
  const customers = useQuery({
    queryKey: ['customers', search],
    queryFn: () =>
      unwrap(api.crm.listCustomers({ query: search.trim() ? { search: search.trim() } : {} })),
    enabled: open && canSeeCustomers,
  });
  const customer = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => unwrap(api.crm.getCustomer({ params: { id: customerId ?? '' } })),
    enabled: Boolean(customerId),
  });
  const leadSites = (leads.data ?? []).flatMap((lead) => siteFromLead(lead) ?? []);
  const pick = (site: QuoteSite) => {
    onPick(site);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={QUOTE.siteSheet.title}
      description={QUOTE.siteSheet.description}
      closeLabel={COMMON.close}
    >
      {leads.isPending ? <LoadingState label={COMMON.loading} /> : null}
      {leadSites.length > 0 ? (
        <SectionTitle title={QUOTE.siteSheet.fromLeads} count={leadSites.length} />
      ) : null}
      {leadSites.map((site) => (
        <SiteRow key={site.propertyId} site={site} onPress={() => pick(site)} />
      ))}
      {canSeeCustomers ? (
        <View style={styles.block}>
          <SectionTitle title={QUOTE.siteSheet.fromCustomers} />
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder={QUOTE.siteSheet.search}
            accessibilityLabel={QUOTE.siteSheet.search}
            leading={<Search size={18} color={theme.colors.textTertiary} />}
          />
          {(customers.data ?? []).slice(0, 8).map((item) => (
            <View key={item.id} style={styles.block}>
              <Card
                tone={customerId === item.id ? 'sunken' : 'raised'}
                onPress={() => setCustomerId(item.id)}
                style={styles.row}
              >
                <Text variant="titleMd">{item.name}</Text>
                <Text variant="bodySm" tone="secondary">
                  {item.phone}
                </Text>
              </Card>
              {customerId === item.id
                ? (customer.data?.properties ?? []).map((property) => (
                    <SiteRow
                      key={property.id}
                      site={siteFromProperty(item.name, property)}
                      onPress={() => pick(siteFromProperty(item.name, property))}
                    />
                  ))
                : null}
            </View>
          ))}
        </View>
      ) : null}
      {!leads.isPending && leadSites.length === 0 && !canSeeCustomers ? (
        <Text variant="bodySm" tone="secondary">
          {QUOTE.siteSheet.none}
        </Text>
      ) : null}
    </Sheet>
  );
}

function SiteRow({ site, onPress }: { readonly site: QuoteSite; readonly onPress: () => void }) {
  return (
    <Card onPress={onPress} accessibilityLabel={site.title} style={styles.row}>
      <Text variant="titleMd" numberOfLines={1}>
        {site.title}
      </Text>
      <Text variant="bodySm" tone="secondary" numberOfLines={1}>
        {site.subtitle}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  row: { gap: 2, paddingVertical: 14 },
});
