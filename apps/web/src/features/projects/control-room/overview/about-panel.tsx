'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Badge, Card, CardHeader } from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCan } from '@/providers/current-user';

const OPTIONS = ['loan', 'battery', 'groundMount', 'subsidy'] as const;

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="type-body-sm text-ink-faint">{label}</dt>
      <dd className="type-body-sm text-ink">{children}</dd>
    </div>
  );
}

/** The site, the system and the quotation it came from, with what the scope includes. */
export function AboutPanel({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projects.overview.about');
  const roomT = useTranslations('projects.room');
  const canSeeQuotation = useCan('quotations.view');
  const options = OPTIONS.filter((key) => project[key]);

  return (
    <Card>
      <CardHeader title={t('title')} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <dl className="flex flex-col gap-3">
          <Fact label={t('site')}>{project.address}</Fact>
          <Fact label={t('system')}>
            <span className="font-mono text-[0.8125rem] tabular-nums">
              {formatKwp(project.capacityWp)}
            </span>{' '}
            · {project.discom}
          </Fact>
          <Fact label={t('quotation')}>
            {canSeeQuotation ? (
              <Link
                href={`/quotations/${project.quotation.id}`}
                className="font-mono text-[0.8125rem] text-accent hover:underline"
              >
                {project.quotation.number}
              </Link>
            ) : (
              <span className="font-mono text-[0.8125rem]">{project.quotation.number}</span>
            )}
          </Fact>
        </dl>
        {options.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {options.map((key) => (
              <Badge key={key} variant="soft">
                {key === 'loan' && project.lenderName
                  ? roomT('options.loanWith', { lender: project.lenderName })
                  : roomT(`options.${key}`)}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
