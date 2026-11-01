import { BellButton } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ALERTS } from '@/copy/alerts';
import { useInbox } from './use-inbox';

/** The bell on Today, with the unread count; opens the alerts inbox. */
export function Bell() {
  const inbox = useInbox();
  const unread = inbox.data?.unread ?? 0;
  return (
    <BellButton
      unread={unread}
      label={ALERTS.bell(unread)}
      onPress={() => router.push('/alerts')}
    />
  );
}
