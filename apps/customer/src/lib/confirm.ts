import { Alert, Platform } from 'react-native';

/**
 * Asks before something that cannot be undone. On the phone a native alert with Cancel
 * and the action; on the web (where Alert has no buttons) the browser's confirm box.
 */
export function confirmAction({
  title,
  message,
  confirm,
  cancel,
  onConfirm,
}: {
  readonly title: string;
  readonly message: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancel, style: 'cancel' },
    { text: confirm, style: 'destructive', onPress: onConfirm },
  ]);
}
