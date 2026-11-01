import type { AlertData } from '@oneohm/mobile-ui';
import { router } from 'expo-router';

/** Opens the screen an alert is about: a task, a service visit, leave, or Today for the rest. */
export function openAlert(subject: {
  readonly type?: string | undefined;
  readonly id?: string | undefined;
}) {
  if (subject.type === 'task' && subject.id) {
    router.push({ pathname: '/tasks/[id]', params: { id: subject.id } });
    return;
  }
  if (subject.type === 'service_request' && subject.id) {
    router.push({ pathname: '/service/[id]', params: { id: subject.id } });
    return;
  }
  if (subject.type === 'lead' && subject.id) {
    router.push({ pathname: '/leads/[id]', params: { id: subject.id } });
    return;
  }
  if (subject.type === 'leave') {
    router.push('/leave');
    return;
  }
  // Points, recognition and bonuses (PRD 4.7).
  if (subject.type === 'points') {
    router.push('/rewards');
    return;
  }
  router.push('/');
}

/** The same, from the data a push alert carries. */
export function openPushedAlert(data: AlertData) {
  openAlert({ type: data.subjectType, id: data.subjectId });
}
