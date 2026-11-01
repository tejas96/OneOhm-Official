import type { AlertData } from '@oneohm/mobile-ui';
import { router } from 'expo-router';

/** Opens the screen an alert is about: a task, leave, or Today for the rest. */
export function openAlert(subject: {
  readonly type?: string | undefined;
  readonly id?: string | undefined;
}) {
  if (subject.type === 'task' && subject.id) {
    router.push({ pathname: '/tasks/[id]', params: { id: subject.id } });
    return;
  }
  if (subject.type === 'leave') {
    router.push('/leave');
    return;
  }
  router.push('/');
}

/** The same, from the data a push alert carries. */
export function openPushedAlert(data: AlertData) {
  openAlert({ type: data.subjectType, id: data.subjectId });
}
