import type { LeadDetail } from '@oneohm/api-contracts';
import {
  Button,
  ChoiceChips,
  Field,
  Sheet,
  Text,
  type UploadableFile,
  useTheme,
} from '@oneohm/mobile-ui';
import { Camera, FilePlus, Images } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useToast } from '@/components/toast';
import { LEAD_PAPERS } from '@/copy/capture';
import { COMMON } from '@/copy/common';
import { pickDocuments } from '@/features/tasks/evidence/pick-documents';
import { type PhotoSource, pickPhotos } from '@/features/tasks/evidence/pick-photos';
import { useUploadQueue } from '@/features/uploads/upload-queue';
import { businessToday } from '@/lib/dates';
import { useBusy } from '@/lib/use-busy';
import { PAPER_CATEGORIES, type PaperCategory, paperName } from './paper-name';

/**
 * Add a bill or a paper for a lead (PRD 4.5): say what it is, then photograph it or
 * pick a PDF. It is kept on the phone and uploads by itself, like task evidence, onto
 * the lead's customer and site.
 */
export function LeadPaperSheet({
  lead,
  open,
  onClose,
}: {
  readonly lead: LeadDetail;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const queue = useUploadQueue();
  const toast = useToast();
  const [category, setCategory] = useState<PaperCategory>('electricity_bill');
  const [notice, setNotice] = useState<string | null>(null);
  const picker = useBusy();

  const keep = async (files: readonly UploadableFile[], tooLarge: readonly string[] = []) => {
    if (tooLarge.length > 0) setNotice(LEAD_PAPERS.tooLarge(tooLarge.join(', ')));
    if (files.length === 0) return;
    const label = LEAD_PAPERS.categories[category];
    const day = businessToday();
    await queue.add(
      files.map((file, index) => ({
        leadId: lead.id,
        customerId: lead.customerId ?? undefined,
        propertyId: lead.propertyId ?? undefined,
        kind: 'document' as const,
        category,
        name: paperName(label, day, file, index, files.length),
        type: file.type,
        file,
      })),
    );
    toast(LEAD_PAPERS.added(files.length));
    if (tooLarge.length === 0) onClose();
  };
  const photograph = (source: PhotoSource) =>
    picker.run(async () => {
      setNotice(null);
      const picked = await pickPhotos(source);
      if (picked === 'denied') {
        setNotice(source === 'camera' ? LEAD_PAPERS.cameraDenied : LEAD_PAPERS.libraryDenied);
        return;
      }
      await keep(picked.map((photo) => photo.file));
    });
  const pickFile = () =>
    picker.run(async () => {
      setNotice(null);
      const picked = await pickDocuments();
      await keep(picked.files, picked.tooLarge);
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={LEAD_PAPERS.sheetTitle}
      description={LEAD_PAPERS.sheetDescription}
      closeLabel={COMMON.close}
    >
      <Field label={LEAD_PAPERS.kind}>
        <ChoiceChips
          label={LEAD_PAPERS.kind}
          choices={PAPER_CATEGORIES.map((value) => ({
            value,
            label: LEAD_PAPERS.categories[value],
          }))}
          value={category}
          onChange={setCategory}
        />
      </Field>
      <View style={styles.row}>
        <Button
          label={LEAD_PAPERS.takePhoto}
          variant="secondary"
          icon={<Camera size={16} color={theme.colors.textPrimary} />}
          disabled={picker.busy}
          onPress={() => void photograph('camera')}
          style={styles.flex}
        />
        <Button
          label={LEAD_PAPERS.choosePhoto}
          variant="secondary"
          icon={<Images size={16} color={theme.colors.textPrimary} />}
          disabled={picker.busy}
          onPress={() => void photograph('library')}
          style={styles.flex}
        />
      </View>
      <Button
        label={LEAD_PAPERS.chooseFile}
        variant="secondary"
        icon={<FilePlus size={16} color={theme.colors.textPrimary} />}
        accessibilityHint={LEAD_PAPERS.chooseFileHint}
        disabled={picker.busy}
        onPress={() => void pickFile()}
        fullWidth
      />
      {notice ? (
        <Text variant="bodySm" color={theme.status.atRisk.fg} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
