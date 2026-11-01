import { Card, Screen, Text, useTheme } from '@oneohm/mobile-ui';
import { useLocalSearchParams } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QUOTE } from '@/copy/quote';
import { type QuoteForm, QuoteInputs } from './quote-inputs';
import type { QuoteSite } from './quote-options';
import { QuoteLines, QuotePreviewBlock } from './quote-preview';
import { SiteSheet } from './site-sheet';
import { useQuotePreview } from './use-quote-input';
import { useQuoteSite } from './use-quote-site';

const INITIAL: QuoteForm = {
  sizeKw: '',
  dcr: true,
  panelId: null,
  inverterId: null,
  structure: 'rcc_elevated',
  // A quick quote prices from defaults straight away (PRD 3.5); sales adjusts on site.
  floors: '1',
  households: '',
  distanceKm: '0',
  discount: '',
};

/** Live price → subsidy → what the customer pays, from the same engine the office uses. */
export function QuoteScreen() {
  const params = useLocalSearchParams<{ leadId?: string }>();
  const { site, setSite } = useQuoteSite(params.leadId);
  const [picking, setPicking] = useState(false);
  const [form, setForm] = useState<QuoteForm>(INITIAL);
  const set = <K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!site) return;
    setForm((current) => ({
      ...current,
      floors: site.floors === null ? current.floors : String(site.floors),
      households: site.households === null ? current.households : String(site.households),
    }));
  }, [site]);

  const { panels, inverters, suggestedInverterId, ready, preview } = useQuotePreview(site, form);

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="displayLg">{QUOTE.title}</Text>
        <Text variant="bodySm" tone="secondary">
          {QUOTE.description}
        </Text>
      </View>
      <SiteCard site={site} onPress={() => setPicking(true)} />
      <QuotePreviewBlock
        data={preview.data}
        ready={ready}
        fetching={preview.isFetching}
        error={preview.error}
        dcr={form.dcr}
      />
      <QuoteInputs
        form={form}
        set={set}
        panels={panels}
        inverters={inverters}
        suggestedInverterId={suggestedInverterId}
        society={site?.subsidyCategory === 'society'}
      />
      {preview.data && ready ? <QuoteLines lines={preview.data.lines} /> : null}
      <SiteSheet open={picking} onClose={() => setPicking(false)} onPick={setSite} />
    </Screen>
  );
}

function SiteCard({
  site,
  onPress,
}: {
  readonly site: QuoteSite | null;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={QUOTE.pickSite} style={styles.site}>
      <View style={[styles.pin, { backgroundColor: theme.colors.accentSoft }]}>
        <MapPin size={18} color={theme.colors.onAccentSoft} />
      </View>
      <View style={styles.flex}>
        <Text variant="label" tone="tertiary">
          {QUOTE.site}
        </Text>
        <Text variant="titleMd" numberOfLines={1}>
          {site?.title ?? QUOTE.pickSite}
        </Text>
        {site ? (
          <Text variant="bodySm" tone="secondary" numberOfLines={1}>
            {site.subtitle}
          </Text>
        ) : null}
      </View>
      {site ? (
        <Text variant="label" tone="accent">
          {QUOTE.changeSite}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingTop: 8 },
  site: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  pin: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
