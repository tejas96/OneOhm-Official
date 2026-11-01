import type { DocumentRecord, LeadDetail } from '@oneohm/api-contracts';
import { Button, Card, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { FilePlus, FileText, ImageIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { SectionTitle } from '@/components/screen-header';
import { LEAD_PAPERS } from '@/copy/capture';
import { PendingTile } from '@/features/tasks/evidence/evidence-tiles';
import { paperKeys } from '@/features/uploads/paper-keys';
import { useUploadQueue } from '@/features/uploads/upload-queue';
import { shortMoment } from '@/lib/dates';
import { useCan } from '@/session/session-provider';
import { LeadPaperSheet } from './lead-paper-sheet';

const categoryLabel = (category: string): string =>
  (LEAD_PAPERS.categories as Readonly<Record<string, string>>)[category] ??
  LEAD_PAPERS.otherCategory;

/**
 * The lead's bills and papers (PRD 4.5), kept on its customer and site once the site
 * is added: what has arrived, what is still on this phone, and a way to add more.
 */
export function LeadPapers({ lead }: { readonly lead: LeadDetail }) {
  return lead.customerId ? <Papers lead={lead} /> : null;
}

function Papers({ lead }: { readonly lead: LeadDetail }) {
  const theme = useTheme();
  const canAdd = useCan('leads.manage', 'documents.upload', 'documents.manage');
  const queue = useUploadQueue();
  const [adding, setAdding] = useState(false);
  const files = useQuery({
    queryKey: paperKeys.lead(lead.id),
    queryFn: () => unwrap(api.documents.listDocuments({ query: { leadId: lead.id } })),
  });
  const pending = queue.items.filter((item) => item.leadId === lead.id);
  const arrived = files.data ?? [];
  return (
    <View style={styles.block}>
      <SectionTitle title={LEAD_PAPERS.title} count={arrived.length + pending.length} />
      {pending.length > 0 ? (
        <View style={styles.tiles}>
          {pending.map((item) => (
            <PendingTile
              key={item.id}
              item={item}
              progress={queue.progress[item.id]}
              onRetry={() => queue.retry(item.id)}
              onDiscard={() => queue.discard(item.id)}
            />
          ))}
        </View>
      ) : null}
      {files.isError ? (
        <Text variant="bodySm" tone="tertiary">
          {LEAD_PAPERS.loadError}
        </Text>
      ) : null}
      {files.data && arrived.length === 0 && pending.length === 0 ? (
        <Text variant="bodySm" tone="tertiary">
          {LEAD_PAPERS.empty}
        </Text>
      ) : null}
      {arrived.length > 0 ? (
        <Card style={styles.list}>
          {arrived.map((file) => (
            <PaperRow key={file.id} file={file} />
          ))}
        </Card>
      ) : null}
      {canAdd ? (
        <Button
          label={LEAD_PAPERS.add}
          variant="secondary"
          icon={<FilePlus size={16} color={theme.colors.textPrimary} />}
          onPress={() => setAdding(true)}
        />
      ) : null}
      {canAdd ? (
        <LeadPaperSheet
          key={`paper-${adding}`}
          lead={lead}
          open={adding}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </View>
  );
}

function PaperRow({ file }: { readonly file: DocumentRecord }) {
  const theme = useTheme();
  const Icon = file.contentType.startsWith('image/') ? ImageIcon : FileText;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${file.name}, ${categoryLabel(file.category)}`}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.surfaceSunken }]}>
        <Icon size={16} color={theme.colors.textSecondary} />
      </View>
      <View style={styles.flex}>
        <Text variant="body" numberOfLines={1}>
          {file.name}
        </Text>
        <Text variant="label" tone="tertiary">
          {LEAD_PAPERS.addedOn(categoryLabel(file.category), shortMoment(file.createdAt))}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
});
