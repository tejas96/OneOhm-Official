import { shortDate } from '@/lib/dates';

/** "12 Nov" for one day, "12 Nov – 14 Nov" for more. */
export function dateRange(request: { readonly fromDate: string; readonly toDate: string }): string {
  return request.fromDate === request.toDate
    ? shortDate(request.fromDate)
    : `${shortDate(request.fromDate)} – ${shortDate(request.toDate)}`;
}
