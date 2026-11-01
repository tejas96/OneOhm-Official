'use client';

import type { QuotationDetail } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, FilePen, FolderPlus, Send, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { isOpen } from '../quotation-status';
import { CreateProjectDialog } from './create-project-dialog';
import { RejectDialog } from './reject-dialog';

type Step = 'approve' | 'send' | 'accept';

/** Each quotation shows only the next steps its status and the person's role allow. */
export function QuotationActions({ quotation }: { readonly quotation: QuotationDetail }) {
  const t = useTranslations('quotations.actions');
  const toast = useToast();
  const queryClient = useQueryClient();
  const canCreate = useCan('quotations.create');
  const canApprove = useCan('quotations.approve_discount');
  const canStartProject = useCan('projects.create');
  const [rejecting, setRejecting] = useState(false);
  const [starting, setStarting] = useState(false);
  const params = { params: { id: quotation.id } };

  const step = useMutation({
    mutationFn: (which: Step) => {
      if (which === 'approve') return expectStatus(api.quotations.approveDiscount(params), 200);
      if (which === 'send') return expectStatus(api.quotations.sendQuotation(params), 200);
      return expectStatus(api.quotations.acceptQuotation(params), 200);
    },
    onSuccess: async (updated, which) => {
      queryClient.setQueryData(['quotation', quotation.id], updated);
      await queryClient.invalidateQueries({ queryKey: ['quotations'] });
      toast({ tone: 'success', title: t(`done.${which}`), reference: updated.number });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  const busy = (which: Step) => step.isPending && step.variables === which;
  const open = isOpen(quotation.status);
  const pending = quotation.discountPendingApproval;

  return (
    <>
      {/* PDF download: the quotation PDF endpoint (reports work) is wired in here at merge. */}
      {pending && canApprove && (
        <Button
          variant="primary"
          leadingIcon={<ShieldCheck />}
          pending={busy('approve')}
          disabled={step.isPending}
          onClick={() => step.mutate('approve')}
        >
          {t('approve')}
        </Button>
      )}
      {open && canCreate && (
        <>
          <Button asChild variant="quiet" leadingIcon={<FilePen />}>
            <Link href={`/quotations/new?from=${quotation.id}`}>{t('revise')}</Link>
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<X />}
            disabled={step.isPending}
            onClick={() => setRejecting(true)}
          >
            {t('reject')}
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Send />}
            pending={busy('send')}
            disabled={step.isPending || pending}
            onClick={() => step.mutate('send')}
          >
            {quotation.status === 'sent' ? t('sendAgain') : t('send')}
          </Button>
          <Button
            variant={pending ? 'secondary' : 'primary'}
            leadingIcon={<Check />}
            pending={busy('accept')}
            disabled={step.isPending || pending}
            onClick={() => step.mutate('accept')}
          >
            {t('accept')}
          </Button>
        </>
      )}
      {quotation.status === 'accepted' && !quotation.projectId && canStartProject && (
        <Button variant="primary" leadingIcon={<FolderPlus />} onClick={() => setStarting(true)}>
          {t('createProject')}
        </Button>
      )}
      {quotation.projectId && (
        <Button asChild variant="primary" trailingIcon={<ArrowRight />}>
          <Link href={`/projects/${quotation.projectId}`}>{t('openProject')}</Link>
        </Button>
      )}
      <RejectDialog quotation={quotation} open={rejecting} onOpenChange={setRejecting} />
      <CreateProjectDialog quotation={quotation} open={starting} onOpenChange={setStarting} />
    </>
  );
}
