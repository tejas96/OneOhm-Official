import { unwrap, usePushAlerts } from '@oneohm/mobile-ui';
import { useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { openPushedAlert } from './open-alert';

/** Signs this phone up for alerts and opens the screen a tapped alert is about. */
export function PushAlerts() {
  const client = useQueryClient();
  usePushAlerts({
    register: (token, platform) =>
      unwrap(api.notifications.addDevice({ body: { token, platform } })),
    onReceive: () => void client.invalidateQueries({ queryKey: keys.inbox }),
    onOpen: openPushedAlert,
  });
  return null;
}
