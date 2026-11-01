import { Text, useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';

/** A sentence from OneOhm that did not belong to one field (duplicate, network, …). */
export function FormAlert({ message }: { readonly message: string | null }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View style={[styles.alert, { backgroundColor: theme.status.overdue.tint }]} accessibilityRole="alert">
      <Text variant="bodySm" color={theme.status.overdue.fg}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ alert: { padding: 14, borderRadius: 14 } });
