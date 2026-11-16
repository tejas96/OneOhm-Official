import type { LeaveReason } from '@oneohm/domain';
import { LEAVE_REASONS } from '@oneohm/domain';

/** What a local notice about a job carries, so a tap or a button finds its job. */
export interface JobNoticeData {
  readonly kind: 'site_entered' | 'site_left_ask';
  readonly subjectType: 'task' | 'service_request';
  readonly subjectId: string;
  readonly visitId?: string;
}

/** A notice that opens the Today screen: near two sites, or an arrival to enter by hand. */
export interface TodayNoticeData {
  readonly kind: 'site_near' | 'site_by_hand';
}

export type FenceNoticeData = JobNoticeData | TodayNoticeData;

/** The notification category of "Job not finished, why?" and its three buttons' ids. */
export const LEFT_CATEGORY = 'site-left';

/** The button id is the reason: the phone posts it as it is. */
export const asLeaveReason = (action: string): LeaveReason | null =>
  (LEAVE_REASONS as readonly string[]).includes(action) ? (action as LeaveReason) : null;

/** An event older than this is history by the time it is sent: no notice for it. */
export const NOTICE_FRESH_MS = 2 * 3_600_000;

export const noticeIsFresh = (eventAt: string, now = Date.now()): boolean =>
  now - new Date(eventAt).getTime() <= NOTICE_FRESH_MS;

/** What a tapped "Why?" button carries: the notice's id, its data and the reason chosen. */
export interface AnsweredReason {
  readonly id: string;
  readonly data: JobNoticeData & { readonly visitId: string };
  readonly reason: LeaveReason;
}

/** The reason a notification response answers, or null for any other response or a plain tap. */
export function reasonFrom(response: {
  readonly actionIdentifier: string;
  readonly notification: {
    readonly request: {
      readonly identifier: string;
      readonly content: { readonly data?: unknown };
    };
  };
}): AnsweredReason | null {
  const { identifier, content } = response.notification.request;
  const data = content.data as Partial<JobNoticeData> | null;
  const reason = asLeaveReason(response.actionIdentifier);
  if (!identifier || !reason || data?.kind !== 'site_left_ask' || !data.visitId) return null;
  return { id: identifier, data: data as AnsweredReason['data'], reason };
}

/** The job screen a notice is about. */
export const jobHref = (data: Pick<JobNoticeData, 'subjectType' | 'subjectId'>) => ({
  pathname: data.subjectType === 'service_request' ? '/service/[id]' : '/tasks/[id]',
  params: { id: data.subjectId },
});

/** Whether a notification response is a plain tap on a notice that opens the Today screen. */
export function opensToday(response: {
  readonly actionIdentifier: string;
  readonly notification: { readonly request: { readonly content: { readonly data?: unknown } } };
}): boolean {
  const data = response.notification.request.content.data as Partial<TodayNoticeData> | null;
  return (
    (data?.kind === 'site_near' || data?.kind === 'site_by_hand') &&
    asLeaveReason(response.actionIdentifier) === null
  );
}
