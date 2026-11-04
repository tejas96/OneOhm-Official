import type { AlertData } from '@oneohm/mobile-ui';
import { type Href, router } from 'expo-router';
import { alertRoute } from './alert-route';

/** Opens the screen an alert is about (see alertRoute). */
export function openAlert(
  subject: { readonly type?: string | undefined; readonly id?: string | undefined },
  kind?: string,
) {
  router.push(alertRoute(subject, kind) as Href);
}

/** The same, from the data a push alert carries. */
export function openPushedAlert(data: AlertData) {
  openAlert({ type: data.subjectType, id: data.subjectId }, data.kind);
}
