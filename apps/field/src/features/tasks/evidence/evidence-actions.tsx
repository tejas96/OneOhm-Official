import { Button, useTheme } from '@oneohm/mobile-ui';
import { Camera, FilePlus, Images } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { TASK } from '@/copy/tasks';
import { MediaActions } from '@/features/media/media-actions';
import { pickDocuments } from './pick-documents';
import { type PhotoSource, pickPhotos } from './pick-photos';
import type { Evidence } from './use-evidence';

/**
 * The ways to add evidence to an open task: photos, then a short video or a voice note
 * on site work (PRD 4.2), then a document when the task asks for one.
 */
export function EvidenceActions({
  evidence,
  wantsPhoto,
  wantsDocument,
  onSite,
  locate,
  onNotice,
}: {
  readonly evidence: Evidence;
  readonly wantsPhoto: boolean;
  readonly wantsDocument: boolean;
  readonly onSite: boolean;
  /** Location may be read now (consent given, working hours). */
  readonly locate: boolean;
  readonly onNotice: (notice: string | null) => void;
}) {
  const theme = useTheme();
  const choose = async (source: PhotoSource) => {
    onNotice(null);
    const picked = await pickPhotos(source, locate);
    if (picked === 'denied') {
      onNotice(source === 'camera' ? TASK.evidence.cameraDenied : TASK.evidence.libraryDenied);
      return;
    }
    await evidence.addPhotos(picked);
  };
  const attach = async () => {
    onNotice(null);
    const picked = await pickDocuments();
    if (picked.tooLarge.length > 0) onNotice(TASK.evidence.tooLarge(picked.tooLarge.join(', ')));
    await evidence.addDocuments(picked.files);
  };
  return (
    <View style={styles.actions}>
      {wantsPhoto || !wantsDocument ? (
        <View style={styles.row}>
          <Button
            label={TASK.evidence.takePhoto}
            variant="secondary"
            icon={<Camera size={16} color={theme.colors.textPrimary} />}
            onPress={() => void choose('camera')}
            style={styles.flex}
          />
          <Button
            label={TASK.evidence.choose}
            variant="secondary"
            icon={<Images size={16} color={theme.colors.textPrimary} />}
            onPress={() => void choose('library')}
            style={styles.flex}
          />
        </View>
      ) : null}
      {onSite || wantsPhoto ? (
        <MediaActions
          locate={locate}
          onVideo={evidence.addVideo}
          onVoice={evidence.addVoice}
          onNotice={onNotice}
        />
      ) : null}
      {wantsDocument ? (
        <Button
          label={TASK.evidence.addDocument}
          variant="secondary"
          icon={<FilePlus size={16} color={theme.colors.textPrimary} />}
          onPress={() => void attach()}
          fullWidth
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
