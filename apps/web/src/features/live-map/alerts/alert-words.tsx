'use client';

import type { DutyAlert } from '@oneohm/api-contracts';
import {
  CalendarX,
  CircleDashed,
  CircleQuestionMark,
  MessageSquareX,
  Receipt,
  ShieldAlert,
  ShieldQuestionMark,
  Timer,
  UserRoundX,
  Wallet,
  WifiOff,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { agoParts } from './alert-format';

const ICON = {
  not_checked_in: UserRoundX,
  fake_gps: ShieldAlert,
  route_gap: WifiOff,
  unknown_stop: CircleQuestionMark,
  visit_open_long: Timer,
  visit_missed: CalendarX,
  visit_doubtful: ShieldQuestionMark,
  job_left_unfinished: CircleDashed,
  claim_waiting: Receipt,
  claim_unpaid: Wallet,
  visit_customer_no: MessageSquareX,
} as const;

export function AlertIcon({ kind }: { readonly kind: DutyAlert['kind'] }) {
  const Icon = ICON[kind];
  return <Icon aria-hidden />;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const number = (value: unknown) => (typeof value === 'number' ? value : 0);

/** An alert in plain words: the title, where or what it is about, and how long ago. */
export function useAlertWords() {
  const t = useTranslations('liveMap.alerts');
  const words = useTranslations('liveMap.words');
  const proof = useTranslations('siteActivity.proof');
  const reasonWords = (list: string) =>
    list
      .split(',')
      .filter(Boolean)
      .map((reason) => proof(`reasons.${reason}` as 'reasons.short_visit'))
      .join(', ');
  return {
    title: (alert: DutyAlert): string => {
      const { detail } = alert;
      switch (alert.kind) {
        case 'route_gap':
        case 'unknown_stop':
          return t(`kind.${alert.kind}`, { minutes: number(detail.minutes) });
        case 'visit_open_long':
          return t('kind.visit_open_long', { hours: number(detail.hours) });
        default:
          return t(`kind.${alert.kind}`);
      }
    },
    where: (alert: DutyAlert): string => {
      const { detail } = alert;
      const job = text(detail.label) || alert.subject.label || '';
      switch (alert.kind) {
        case 'unknown_stop':
          return t('where.between', { from: text(detail.from), to: text(detail.to) });
        case 'route_gap':
          return words(`gapReason.${text(detail.reason) || 'unknown'}` as 'gapReason.unknown');
        case 'visit_missed':
          return t('where.planned', {
            place: text(detail.customerName) || job,
            time: text(detail.plannedStart),
          });
        case 'visit_doubtful':
          return [job, reasonWords(text(detail.reasons))].filter(Boolean).join(': ');
        case 'visit_customer_no':
          return t('where.customerNo', {
            customer: text(detail.customerName),
            home: text(detail.home),
          });
        case 'claim_waiting':
        case 'claim_unpaid':
          return t('where.amount', { amount: number(detail.amountPaise) / 100 });
        default:
          return job;
      }
    },
    ago: (iso: string, now: number): string => {
      const { unit, n } = agoParts(iso, now);
      return t(`ago.${unit}`, { n });
    },
  };
}
