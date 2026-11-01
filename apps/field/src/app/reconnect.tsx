import { Button, EmptyState, Screen, useTheme } from '@oneohm/mobile-ui';
import { WifiOff } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { useSession } from '@/session/session-provider';

/** The saved session could not be checked: offer a retry instead of signing out. */
export default function ReconnectScreen() {
  const theme = useTheme();
  const { retry, signOut } = useSession();
  return (
    <Screen scroll={false}>
      <View style={styles.centre}>
        <EmptyState
          icon={<WifiOff size={22} color={theme.colors.accent} />}
          title={COMMON.reconnect.title}
          description={COMMON.reconnect.body}
          action={{ label: COMMON.retry, onPress: retry }}
        />
        <Button label={COMMON.reconnect.signOut} variant="quiet" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ centre: { flex: 1, justifyContent: 'center', gap: 12 } });
