import type { LeadQuotation } from '@oneohm/api-contracts';
import { Card, formatInr, StatusPill, Text, type Tone, useTheme } from '@oneohm/mobile-ui';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { LEAD_QUOTES } from '@/copy/sales';
import { shortMoment } from '@/lib/dates';
import { openProtectedFile } from '@/lib/open-file';

const TONE: Readonly<Record<LeadQuotation['status'], Tone>> = {
  draft: 'neutral',
  sent: 'onTrack',
  accepted: 'done',
  rejected: 'overdue',
  superseded: 'neutral',
};

function statusOf(quotation: LeadQuotation): { tone: Tone; label: string } {
  if (quotation.discountPendingApproval) {
    return { tone: 'atRisk', label: LEAD_QUOTES.status.approval };
  }
  return { tone: TONE[quotation.status], label: LEAD_QUOTES.status[quotation.status] };
}

/** The lead's quotations with where each stands; a tap opens its PDF (PRD 4.5). */
export function LeadQuotes({ quotations }: { readonly quotations: readonly LeadQuotation[] }) {
  const theme = useTheme();
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const open = async (quotation: LeadQuotation) => {
    setOpening(quotation.id);
    setFailed(false);
    try {
      await openProtectedFile(
        `/v1/quotations/${quotation.id}/pdf?disposition=inline`,
        `${quotation.number}-r${quotation.revision}.pdf`,
        'application/pdf',
        'open',
      );
    } catch {
      setFailed(true);
    } finally {
      setOpening(null);
    }
  };
  return (
    <View style={styles.block}>
      <SectionTitle title={LEAD_QUOTES.title} count={quotations.length} />
      {quotations.length === 0 ? (
        <Text variant="bodySm" tone="tertiary">
          {LEAD_QUOTES.none}
        </Text>
      ) : null}
      {quotations.map((quotation) => {
        const status = statusOf(quotation);
        return (
          <Card
            key={quotation.id}
            onPress={() => void open(quotation)}
            accessibilityLabel={LEAD_QUOTES.open(quotation.number)}
            style={styles.row}
          >
            <View style={styles.flex}>
              <Text variant="titleMd" numberOfLines={1}>
                {LEAD_QUOTES.revision(quotation.number, quotation.revision)}
              </Text>
              <View style={styles.meta}>
                <StatusPill tone={status.tone} label={status.label} size="sm" />
                <Text variant="label" tone="secondary">
                  {formatInr(quotation.effectivePaise)} · {shortMoment(quotation.createdAt)}
                </Text>
              </View>
            </View>
            {opening === quotation.id ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <ChevronRight size={18} color={theme.colors.textTertiary} />
            )}
          </Card>
        );
      })}
      {failed ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {LEAD_QUOTES.pdfFailed}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  flex: { flex: 1, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
