'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';

/**
 * Under the budget: the site survey report once the survey is in (PRD 3.4), and
 * "Recheck price" when the survey is approved but its price check did not finish.
 */
export function BudgetActions({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projectTeam.budget');
  const toast = useToast();
  const client = useQueryClient();
  const canManage = useCan('projects.manage');
  const recheck = useMutation({
    mutationFn: () =>
      expectStatus(api.projectTeam.recheckBudget({ params: { id: project.id } }), 200),
    onSuccess: async (next) => {
      client.setQueryData(['project', project.id], next);
      await client.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: t('rechecked'), tone: 'success' });
    },
    onError: (error) => toast({ title: describeError(error), tone: 'error' }),
  });
  const { canRecheckBudget, surveyReport } = project.setup;
  if (!surveyReport && !(canRecheckBudget && canManage)) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3">
      {canRecheckBudget && canManage && (
        <p className="type-body-sm text-at-risk">{t('recheckHint')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {canRecheckBudget && canManage && (
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<RefreshCw />}
            pending={recheck.isPending}
            onClick={() => recheck.mutate()}
          >
            {t('recheck')}
          </Button>
        )}
        {surveyReport && (
          <Button asChild size="sm" variant="secondary" leadingIcon={<FileText />}>
            <a
              href={`/api/v1/projects/${project.id}/survey-report/pdf`}
              target="_blank"
              rel="noopener"
            >
              {t('surveyReport')}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
