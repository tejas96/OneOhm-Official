import { Button, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { NEW_LEAD } from '@/copy/sales';

/** Why a new lead was not saved; a duplicate offers to open the lead that already exists. */
export function NewLeadAlert({
  message,
  duplicateId,
}: {
  readonly message: string;
  readonly duplicateId: string | null;
}) {
  const theme = useTheme();
  return (
    <View
      style={[styles.alert, { backgroundColor: theme.status.overdue.tint }]}
      accessibilityRole="alert"
    >
      <Text variant="bodySm" color={theme.status.overdue.fg}>
        {message}
      </Text>
      {duplicateId ? (
        <Button
          label={NEW_LEAD.openExisting}
          variant="secondary"
          size="sm"
          onPress={() => router.replace(`/leads/${duplicateId}`)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  alert: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
});
