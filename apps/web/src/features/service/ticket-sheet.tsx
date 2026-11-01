'use client';

import type { ServiceTicket } from '@oneohm/api-contracts';
import { Sheet, StatusPill } from '@oneohm/design-system/web';
import { Phone, Star } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatPhone } from '@/lib/format/contact';
import { SlaCell } from './sla-pill';
import { TicketWork } from './ticket-work';
import { STATUS_TONE } from './tickets-table';
import { useAgo } from './use-ago';

const LONG = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
} as const;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <h3 className="type-overline text-ink-faint uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="type-body-sm text-ink-faint">{label}</dt>
      <dd className="type-body-sm text-ink">{children}</dd>
    </div>
  );
}

function Levels({ ticket }: { readonly ticket: ServiceTicket }) {
  const t = useTranslations('service.sheet');
  const format = useFormatter();
  const at = (value: string | null) => (value ? format.dateTime(new Date(value), LONG) : '—');
  return (
    <Section title={t('levels')}>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact label={t('responseDue')}>
          <span className="flex flex-col gap-1.5">
            <span className="tabular-nums">{at(ticket.responseDueAt)}</span>
            <SlaCell
              state={ticket.sla.response}
              dueAt={ticket.responseDueAt}
              doneAt={ticket.respondedAt ?? ticket.resolvedAt}
            />
          </span>
        </Fact>
        <Fact label={t('resolutionDue')}>
          <span className="flex flex-col gap-1.5">
            <span className="tabular-nums">{at(ticket.resolutionDueAt)}</span>
            <SlaCell
              state={ticket.sla.resolution}
              dueAt={ticket.resolutionDueAt}
              doneAt={ticket.resolvedAt}
            />
          </span>
        </Fact>
      </dl>
      <p className="type-body-sm text-ink-faint">{t('levelsHint')}</p>
    </Section>
  );
}

function Rating({ ticket }: { readonly ticket: ServiceTicket }) {
  const t = useTranslations('service.sheet');
  if (ticket.status !== 'resolved') return null;
  return (
    <Section title={t('ratingTitle')}>
      {ticket.rating ? (
        <div className="flex flex-col gap-1.5">
          <p
            className="flex items-center gap-1"
            role="img"
            aria-label={t('ratingValue', { rating: ticket.rating.rating })}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                aria-hidden
                className={
                  value <= (ticket.rating?.rating ?? 0)
                    ? 'size-4 fill-energy text-energy'
                    : 'size-4 text-ink-faint'
                }
              />
            ))}
          </p>
          <p className="type-body-sm text-ink-muted">{ticket.rating.comment ?? t('noComment')}</p>
        </div>
      ) : (
        <p className="type-body-sm text-ink-faint">{t('noRating')}</p>
      )}
    </Section>
  );
}

/** One request: what the customer said, its promised times, its rating, and the work. */
export function TicketSheet({
  ticket,
  onClose,
}: {
  readonly ticket: ServiceTicket | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('service');
  const format = useFormatter();
  const ago = useAgo();
  return (
    <Sheet
      open={ticket !== null}
      onOpenChange={(open) => !open && onClose()}
      title={ticket?.categoryLabel ?? ''}
      description={ticket ? t('sheet.raised', { time: ago(ticket.createdAt) }) : undefined}
      header={
        ticket && (
          <div className="flex">
            <StatusPill
              size="sm"
              tone={STATUS_TONE[ticket.status]}
              label={t(`status.${ticket.status}`)}
            />
          </div>
        )
      }
      width="lg"
    >
      {ticket && (
        <div className="flex flex-col gap-6 px-5 py-6 sm:px-6">
          <p className="type-body text-ink">{ticket.description}</p>
          <Section title={t('sheet.details')}>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Fact label={t('sheet.customer')}>
                <Link
                  href={`/customers/${ticket.customer.id}`}
                  className="font-medium hover:text-accent"
                >
                  {ticket.customer.name}
                </Link>
                <a
                  href={`tel:${ticket.customer.phone}`}
                  className="mt-0.5 flex items-center gap-1 text-ink-faint hover:text-accent"
                >
                  <Phone aria-hidden className="size-3.5" />
                  {formatPhone(ticket.customer.phone)}
                </a>
              </Fact>
              {ticket.project && (
                <Fact label={t('sheet.project')}>
                  <Link
                    href={`/projects/${ticket.project.id}`}
                    className="font-mono text-accent hover:underline"
                  >
                    {ticket.project.code}
                  </Link>
                </Fact>
              )}
              {ticket.scheduledFor && (
                <Fact label={t('sheet.visit')}>
                  {format.dateTime(new Date(ticket.scheduledFor), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </Fact>
              )}
            </dl>
          </Section>
          {ticket.photos.length > 0 && (
            <Section title={t('sheet.photosTitle')}>
              <ul className="flex flex-wrap gap-2">
                {ticket.photos.map((photo) => (
                  <li key={photo.id}>
                    <a
                      href={`/api/v1/documents/${photo.id}/file?disposition=inline`}
                      target="_blank"
                      rel="noopener"
                      className="block size-20 overflow-hidden rounded-lg ring-1 ring-hairline hover:ring-accent"
                    >
                      {/* biome-ignore lint/performance/noImgElement: streamed from the API after its access check, not Next's image loader. */}
                      <img
                        src={`/api/v1/documents/${photo.id}/file?disposition=inline`}
                        alt={photo.name}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Levels ticket={ticket} />
          {ticket.resolutionNote && (
            <p className="type-body-sm text-on-track">
              {t('resolution', { note: ticket.resolutionNote })}
            </p>
          )}
          <Rating ticket={ticket} />
          <TicketWork key={ticket.id} ticket={ticket} />
        </div>
      )}
    </Sheet>
  );
}
