import type { QuotationDetail } from '@oneohm/api-contracts';
import { Button, Card, formatInr, StatusPill, Text, type Tone, useTheme } from '@oneohm/mobile-ui';
import { Download, FileText, Share2, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { QUOTE } from '@/copy/quote';
import { shortDate } from '@/lib/dates';
import { type FileAction, openProtectedFile } from '@/lib/open-file';
import type { SaveQuote } from './use-save-quote';

function statusOf(quotation: QuotationDetail): { tone: Tone; label: string } {
  if (quotation.discountPendingApproval) {
    return { tone: 'atRisk', label: QUOTE.saved.status.approval };
  }
  const tones: Readonly<Record<QuotationDetail['status'], Tone>> = {
    draft: 'neutral',
    sent: 'onTrack',
    accepted: 'done',
    rejected: 'overdue',
    superseded: 'neutral',
  };
  return { tone: tones[quotation.status], label: QUOTE.saved.status[quotation.status] };
}

/** The discount waits for someone with the approval right, on the web app. */
function ApprovalNotice({ quote }: { readonly quote: SaveQuote }) {
  const theme = useTheme();
  const tone = theme.status.atRisk;
  return (
    <View style={[styles.notice, { backgroundColor: tone.tint }]} accessibilityRole="alert">
      <View style={styles.row}>
        <ShieldCheck size={16} color={tone.fg} />
        <Text variant="titleMd" color={tone.fg} style={styles.flex}>
          {QUOTE.saved.approvalTitle}
        </Text>
      </View>
      <Text variant="bodySm" color={tone.fg}>
        {QUOTE.saved.approvalBody}
      </Text>
      <Button
        label={QUOTE.saved.checkAgain}
        variant="secondary"
        size="sm"
        pending={quote.refreshing}
        onPress={quote.refresh}
      />
    </View>
  );
}

/** The saved quotation: its number and status, the PDF to open or share, approval. */
export function SavedQuoteCard({ quote }: { readonly quote: SaveQuote }) {
  const theme = useTheme();
  const [busy, setBusy] = useState<FileAction | null>(null);
  const [failed, setFailed] = useState(false);
  const quotation = quote.quotation;
  if (!quotation) return null;
  const status = statusOf(quotation);
  const pdf = async (action: FileAction) => {
    setBusy(action);
    setFailed(false);
    try {
      await openProtectedFile(
        `/v1/quotations/${quotation.id}/pdf?disposition=${action === 'open' ? 'inline' : 'attachment'}`,
        `${quotation.number}-r${quotation.revision}.pdf`,
        'application/pdf',
        action,
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };
  const ShareIcon = Platform.OS === 'web' ? Download : Share2;
  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Text variant="overline" tone="tertiary">
          {QUOTE.saved.overline}
        </Text>
        <Text variant="titleMd">{QUOTE.saved.title(quotation.number, quotation.revision)}</Text>
        <View style={styles.row}>
          <StatusPill tone={status.tone} label={status.label} size="sm" />
          <Text variant="label" tone="secondary">
            {QUOTE.saved.validUntil(shortDate(quotation.validUntil))}
          </Text>
        </View>
      </View>
      <View style={styles.between}>
        <Text variant="bodySm" tone="secondary">
          {QUOTE.saved.customerPays}
        </Text>
        <Text variant="titleMd">{formatInr(quotation.effectivePaise)}</Text>
      </View>
      {quotation.discountPendingApproval ? <ApprovalNotice quote={quote} /> : null}
      {quote.changed ? (
        <Text variant="bodySm" color={theme.status.atRisk.fg}>
          {QUOTE.save.changed}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label={QUOTE.saved.openPdf}
          variant="secondary"
          icon={<FileText size={16} color={theme.colors.textPrimary} />}
          pending={busy === 'open'}
          onPress={() => void pdf('open')}
          style={styles.flex}
        />
        <Button
          label={Platform.OS === 'web' ? QUOTE.saved.downloadPdf : QUOTE.saved.sharePdf}
          variant="secondary"
          icon={<ShareIcon size={16} color={theme.colors.textPrimary} />}
          pending={busy === 'share'}
          onPress={() => void pdf('share')}
          style={styles.flex}
        />
      </View>
      {failed ? (
        <Text variant="bodySm" color={theme.status.overdue.fg}>
          {QUOTE.saved.pdfFailed}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  heading: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  between: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  notice: { borderRadius: 12, padding: 12, gap: 8 },
  flex: { flex: 1 },
});
