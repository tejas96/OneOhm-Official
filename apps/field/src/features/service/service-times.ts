import type { ServiceJob } from '@oneohm/api-contracts';
import type { Tone } from '@oneohm/mobile-ui';
import { SERVICE } from '@/copy/service';
import { shortDate, shortMoment } from '@/lib/dates';

type Sla = NonNullable<ServiceJob['sla']['response']>;

const TONE: Readonly<Record<Sla, Tone>> = {
  on_track: 'onTrack',
  due_soon: 'atRisk',
  breached: 'overdue',
  met: 'done',
  missed: 'blocked',
};

export const slaTone = (state: Sla): Tone => TONE[state];

/** The promise that matters next: the visit day, the reply while unanswered, else the fix. */
export function nextPromise(job: ServiceJob): {
  label: string;
  when: string;
  state: Sla | null;
} | null {
  const visitDay = job.scheduledFor ?? job.visitOn;
  if (visitDay) {
    return {
      label: SERVICE.visitDay,
      when: shortDate(visitDay),
      state: job.sla.resolution,
    };
  }
  if (!job.respondedAt && job.responseDueAt) {
    return {
      label: SERVICE.replyBy,
      when: shortMoment(job.responseDueAt),
      state: job.sla.response,
    };
  }
  if (job.resolutionDueAt) {
    return {
      label: SERVICE.fixBy,
      when: shortMoment(job.resolutionDueAt),
      state: job.sla.resolution,
    };
  }
  return null;
}

export const placeLine = (job: ServiceJob) =>
  [job.customer.name, job.place?.city].filter(Boolean).join(' · ');
