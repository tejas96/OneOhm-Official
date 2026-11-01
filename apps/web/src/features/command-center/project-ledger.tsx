'use client';

import type { ProjectSummary } from '@oneohm/api-contracts';
import { EmptyState } from '@oneohm/design-system/web';
import { SunMedium } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ProjectColumnsHeader, ProjectRow } from '../projects/project-journey';
import { SectionHeading } from './section-heading';

/** Every live project on one page, each journey drawn as a metro line. */
export function ProjectLedger({
  projects,
  total,
}: {
  readonly projects: readonly ProjectSummary[];
  readonly total: number;
}) {
  const t = useTranslations('commandCenter.projects');
  return (
    <section id="projects" aria-label={t('title')} className="flex flex-col gap-5">
      <SectionHeading
        index="01"
        title={t('title')}
        action={
          <Link href="/projects" className="type-body-sm font-medium text-accent hover:underline">
            {t('all', { count: total })}
          </Link>
        }
      />
      {projects.length === 0 ? (
        <EmptyState icon={<SunMedium />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <>
          <ProjectColumnsHeader project={t('project')} statusNext={t('statusNext')} />
          <ul className="flex flex-col divide-y divide-hairline">
            {projects.map((project, index) => (
              <ProjectRow key={project.id} project={project} index={index} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
