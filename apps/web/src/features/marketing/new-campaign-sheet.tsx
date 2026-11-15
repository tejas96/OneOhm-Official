'use client';

import type { CampaignDefaults, CampaignDetail } from '@oneohm/api-contracts';
import { Button, Sheet } from '@oneohm/design-system/web';
import { paidProviders } from '@oneohm/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { launchProblem, toInput } from './compose-checks';
import { LaunchProgress } from './launch-progress';
import { sendStepOf } from './launch-steps';
import { NewCampaignForm } from './new-campaign-form';
import { marketingKeys, useCampaignDefaults } from './use-marketing';
import { useNewCampaign } from './use-new-campaign';

/** The words under a disabled Launch button: the one thing still missing. */
function useProblemWords() {
  const t = useTranslations('marketing');
  return (problem: ReturnType<typeof launchProblem>): string | null => {
    if (!problem) return null;
    return problem.kind === 'budget' ? problem.words : t(`problem.${problem.kind}`);
  };
}

function Body({
  defaults,
  onOpenCampaign,
}: {
  readonly defaults: CampaignDefaults;
  readonly onOpenCampaign: (id: string) => void;
}) {
  const t = useTranslations('marketing');
  const state = useNewCampaign(defaults);
  const queryClient = useQueryClient();
  const wordsOf = useProblemWords();
  const [phase, setPhase] = useState<'editing' | 'launching'>('editing');
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { draft } = state;
  const problem = launchProblem(draft, new Date());

  const launch = useMutation({
    mutationFn: () => expectStatus(api.marketing.launch({ body: toInput(draft) }), 201),
    onSuccess: (made) => {
      setDetail(made);
      queryClient.setQueryData(marketingKeys.campaign(made.id), made);
    },
    onError: (caught) => setError(describeError(caught)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: marketingKeys.overview }),
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      expectStatus(api.marketing.runAgain({ params: { id }, body: {} }), 200),
    onSuccess: (next) => {
      setDetail(next);
      queryClient.setQueryData(marketingKeys.campaign(next.id), next);
      void queryClient.invalidateQueries({ queryKey: marketingKeys.overview });
    },
  });

  const start = () => {
    setError(null);
    setDetail(null);
    setPhase('launching');
    launch.mutate();
  };

  if (phase === 'launching') {
    const send = sendStepOf(draft.goal, draft.channels);
    const places = paidProviders(draft.goal, draft.channels)
      .map((provider) => t(`provider.${provider}`))
      .join(' + ');
    const labels = [
      t('launch.steps.photo'),
      t('launch.steps.making'),
      t(`launch.steps.${send}`, { places }),
      t('launch.steps.live'),
    ];
    return (
      <LaunchProgress
        labels={labels}
        detail={detail}
        error={error}
        retrying={retry.isPending}
        onRetry={() => detail && retry.mutate(detail.id)}
        onOpen={onOpenCampaign}
        onBack={() => setPhase('editing')}
      />
    );
  }
  return (
    <>
      <NewCampaignForm defaults={defaults} state={state} />
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-hairline bg-raised px-5 py-4 sm:px-6">
        <Button
          variant="primary"
          size="lg"
          leadingIcon={<Rocket />}
          disabled={problem !== null}
          onClick={start}
        >
          {t('launch.button')}
        </Button>
        {problem && <p className="text-center type-body-sm text-ink-muted">{wordsOf(problem)}</p>}
      </div>
    </>
  );
}

/** New campaign: one full-height sheet, one screen, one Launch button. */
export function NewCampaignSheet({
  open,
  onClose,
  onOpenCampaign,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onOpenCampaign: (id: string) => void;
}) {
  const t = useTranslations('marketing');
  const defaults = useCampaignDefaults(open);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('newCampaign')}
      width="lg"
    >
      {defaults.isError ? (
        <div className="p-5">
          <LoadError error={defaults.error} onRetry={() => defaults.refetch()} />
        </div>
      ) : defaults.data ? (
        <Body defaults={defaults.data} onOpenCampaign={onOpenCampaign} />
      ) : (
        <p className="p-6 type-body text-ink-muted">{t('loading')}</p>
      )}
    </Sheet>
  );
}
