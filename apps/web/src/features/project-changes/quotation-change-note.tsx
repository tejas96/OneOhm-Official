'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Scaling } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';

/**
 * On a revision that carries a project change (PRD 3.15): what accepting it does, with the
 * way back to the project. Nothing shows on other quotations.
 */
export function QuotationChangeNote({ quotationId }: { readonly quotationId: string }) {
  const t = useTranslations('scopeChanges.quotation');
  const kindT = useTranslations('scopeChanges.kinds');
  const query = useQuery({
    queryKey: ['quotation', quotationId, 'project-change'],
    queryFn: () =>
      expectStatus(api.projectChanges.quotationProjectChange({ params: { id: quotationId } }), 200),
  });
  const change = query.data?.change;
  if (!change) return null;
  const open = change.status === 'approved';
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-hairline bg-sunken/60 px-4 py-3">
      <p className="flex items-center gap-2 type-body text-ink">
        <Scaling aria-hidden className="size-4 shrink-0 text-ink-faint" />
        {t('carries', {
          number: change.number,
          project: change.projectCode,
          kinds: change.kinds.map((kind) => kindT(kind)).join(', '),
        })}
      </p>
      <p className="type-body-sm text-ink-muted">
        {open ? t('whenAccepted') : t(`closed.${change.status}`)}
      </p>
      <Link
        href={`/projects/${change.projectId}`}
        className="inline-flex items-center gap-1 self-start type-body-sm text-accent hover:underline"
      >
        {t('openProject')}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
