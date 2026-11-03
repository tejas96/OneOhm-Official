import { RADIUS } from '@oneohm/design-system/tokens';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/theme';
import { Text } from './text';

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string | undefined;
  /** Accessible name for the tap-outside-to-close area. */
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

/**
 * A bottom sheet for one focused job (log a follow-up, mark waiting). While the keyboard
 * is up the whole sheet rides above it on both platforms, and its body scrolls if the
 * room left is short.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  closeLabel,
  children,
  footer,
}: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior="padding"
        keyboardVerticalOffset={insets.bottom}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              backgroundColor: theme.colors.surfaceRaised,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
          <View style={styles.header}>
            <Text variant="displayMd">{title}</Text>
            {description ? (
              <Text variant="bodySm" tone="secondary">
                {description}
              </Text>
            ) : null}
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    paddingTop: 10,
    maxHeight: '90%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  header: { paddingHorizontal: 20, gap: 4, paddingBottom: 12 },
  body: { paddingHorizontal: 20, gap: 16, paddingBottom: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
});
