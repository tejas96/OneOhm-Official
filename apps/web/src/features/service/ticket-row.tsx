'use client';

import type { ServiceTicket } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  listItemEnter,
  type PillTone,
  StatusPill,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Phone, Play } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { formatPhone } from '@/lib/format/contact';
import { useCan } from '@/providers/current-user';

const TONE: Readonly<Record<ServiceTicket['status'], PillTone>> = {
  open: 'atRisk',
  in_progress: 'review',
  resolved: 'done',
};

type Patch = { status?: ServiceTicket['status']; resolutionNote?: string | null };

export function TicketRow({
  ticket,
  index,
}: {
  readonly ticket: ServiceTicket;
  readonly index: number;
}) {
  const t = useTranslations('service');
  const format = useFormatter();
  const now = useNow();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCan('service.manage');
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const update = useMutation({
    mutationFn: (body: Patch) =>
      expectStatus(api.serviceDesk.updateTicket({ params: { id: ticket.id }, body }), 200),
    onSuccess: async (_, body) => {
      setResolving(false);
      await queryClient.invalidateQueries({ queryKey: ['service-requests'] });
      toast({ tone: 'success', title: t(`done.${body.status ?? 'open'}`) });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });

  return (
    <motion.li
      {...listItemEnter(index)}
      className="flex flex-col gap-3 py-5 md:flex-row md:items-start md:gap-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill size="sm" tone={TONE[ticket.status]} label={t(`status.${ticket.status}`)} />
          <span className="type-title-md text-ink">{t(`category.${ticket.category}`)}</span>
          {ticket.project && (
            <Link
              href={`/projects/${ticket.project.id}`}
              className="font-mono text-[0.75rem] text-ink-faint hover:text-accent"
            >
              {ticket.project.code}
            </Link>
          )}
        </div>
        <p className="type-body text-ink-muted">{ticket.description}</p>
        {ticket.photos.length > 0 && (
          <ul
            className="flex flex-wrap gap-2"
            aria-label={t('photos', { count: ticket.photos.length })}
          >
            {ticket.photos.map((photo) => (
              <li key={photo.id}>
                <a
                  href={`/api/v1/documents/${photo.id}/file?disposition=inline`}
                  target="_blank"
                  rel="noopener"
                  className="block size-16 overflow-hidden rounded-lg ring-1 ring-hairline hover:ring-accent"
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
        )}
        {ticket.resolutionNote && (
          <p className="type-body-sm text-on-track">
            {t('resolution', { note: ticket.resolutionNote })}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-3 type-body-sm text-ink-faint">
          <Link
            href={`/customers/${ticket.customer.id}`}
            className="font-medium text-ink hover:text-accent"
          >
            {ticket.customer.name}
          </Link>
          <a
            href={`tel:${ticket.customer.phone}`}
            className="inline-flex items-center gap-1 hover:text-accent"
          >
            <Phone aria-hidden className="size-3.5" />
            {formatPhone(ticket.customer.phone)}
          </a>
          <span>{format.relativeTime(new Date(ticket.createdAt), now)}</span>
        </p>
      </div>
      {canManage && ticket.status !== 'resolved' && (
        <div className="flex shrink-0 gap-2">
          {ticket.status === 'open' && (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Play />}
              pending={update.isPending && !resolving}
              onClick={() => update.mutate({ status: 'in_progress' })}
            >
              {t('start')}
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<CircleCheck />}
            onClick={() => setResolving(true)}
          >
            {t('resolve')}
          </Button>
        </div>
      )}
      <Dialog
        open={resolving}
        onOpenChange={setResolving}
        title={t('resolveTitle')}
        description={t('resolveBody', { name: ticket.customer.name })}
        footer={
          <Button
            variant="primary"
            pending={update.isPending}
            disabled={note.trim().length < 3}
            onClick={() => update.mutate({ status: 'resolved', resolutionNote: note.trim() })}
          >
            {t('resolve')}
          </Button>
        }
      >
        <Field label={t('resolutionLabel')}>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        </Field>
      </Dialog>
    </motion.li>
  );
}
