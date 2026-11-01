import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { FileText, ImageIcon, LoaderCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { DOCUMENTS } from '@/copy/money';
import { openProtectedFile } from '@/lib/open-file';

export interface OpenableFile {
  readonly path: string;
  readonly fileName: string;
  readonly mimeType: string;
}

/** A document line: tap to open it in the phone's viewer. */
export function FileRow({
  title,
  meta,
  file,
  first,
}: {
  readonly title: string;
  readonly meta: string;
  readonly file: OpenableFile;
  readonly first: boolean;
}) {
  const theme = useTheme();
  const [opening, setOpening] = useState(false);
  const Icon = file.mimeType.startsWith('image/') ? ImageIcon : FileText;
  const open = async () => {
    setOpening(true);
    try {
      await openProtectedFile(file.path, file.fileName, file.mimeType);
    } catch {
      if (Platform.OS === 'web') globalThis.alert?.(DOCUMENTS.openFailed);
      else Alert.alert(DOCUMENTS.openFailed);
    } finally {
      setOpening(false);
    }
  };
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${DOCUMENTS.open} ${title}`}
      accessibilityState={{ busy: opening }}
      disabled={opening}
      onPress={() => void open()}
      style={[
        styles.row,
        !first && {
          borderTopColor: theme.colors.borderSubtle,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
        {opening ? (
          <LoaderCircle size={18} color={theme.colors.onAccentSoft} />
        ) : (
          <Icon size={18} color={theme.colors.onAccentSoft} />
        )}
      </View>
      <View style={styles.fill}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="label" tone="tertiary" numberOfLines={1}>
          {opening ? DOCUMENTS.opening : meta}
        </Text>
      </View>
      <Text variant="label" tone="accent">
        {DOCUMENTS.open}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, gap: 2 },
});
