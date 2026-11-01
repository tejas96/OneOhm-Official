import { unwrap, usePushAlerts } from '@oneohm/mobile-ui';
import { useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { openPushedAlert } from './open-alert';

/** Signs this phone up for updates and opens the tab a tapped update is about. */
export function PushAlerts() {
  const client = useQueryClient();
  usePushAlerts({
    register: (token, platform) =>
      unwrap(api.notifications.customerAddDevice({ body: { token, platform } })),
    onReceive: () => void client.invalidateQueries({ queryKey: keys.inbox }),
    onOpen: openPushedAlert,
  });
  return null;
}
