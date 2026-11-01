import type { AlertData } from '@oneohm/mobile-ui';
import { router } from 'expo-router';

/** Opens the tab an update is about: payments, help, documents, or Home. */
export function openAlert(kind: string | undefined) {
  if (kind?.startsWith('payment_')) router.push('/payments');
  else if (kind === 'service_update') router.push('/help');
  else if (kind === 'quotation_sent') router.push('/documents');
  else router.push('/');
}

/** The same, from the data a push alert carries. */
export function openPushedAlert(data: AlertData) {
  openAlert(data.kind);
}
