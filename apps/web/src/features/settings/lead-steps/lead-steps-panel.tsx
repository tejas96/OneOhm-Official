'use client';

import type { LeadStepRecord } from '@oneohm/api-contracts';
import { Button, Dialog, IconButton, Switch } from '@oneohm/design-system/web';
import { OPEN_LEAD_STAGES } from '@oneohm/domain';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { SettingsSection } from '../settings-section';
import { StepDialog, type StepDraft } from './step-dialog';
import { useChangeLeadSteps, useLeadSteps } from './use-lead-steps';

/**
 * The sales pipeline (PRD 3.3): the owner names the steps a lead goes through. Each step
 * sits inside a fixed stage, which OneOhm's automation uses (a sent quotation moves the
 * lead to "Quoted"; an accepted one wins it).
 */
export function LeadStepsPanel() {
  const t = useTranslations('settings.leadSteps');
  const query = useLeadSteps();
  const change = useChangeLeadSteps();
  const [draft, setDraft] = useState<StepDraft | null>(null);
  // Switching off a step with open leads moves them to the stage's next step: confirm it.
  const [switchingOff, setSwitchingOff] = useState<LeadStepRecord | null>(null);
  const toggle = (step: LeadStepRecord, active: boolean) => {
    if (!active && step.leads > 0) setSwitchingOff(step);
    else change.mutate({ kind: 'update', key: step.key, body: { active } });
  };
  if (query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      {OPEN_LEAD_STAGES.map((stage) => {
        const steps = query.data.filter((step) => step.stage === stage);
        return (
          <SettingsSection
            key={stage}
            title={t(`stage.${stage}`)}
            description={t(`about.${stage}`)}
          >
            <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-raised">
              {steps.map((step, index) => (
                <StepRow
                  key={step.key}
                  step={step}
                  first={index === 0}
                  last={index === steps.length - 1}
                  busy={change.isPending}
                  onToggle={(active) => toggle(step, active)}
                  onMove={(move) =>
                    change.mutate({ kind: 'update', key: step.key, body: { move } })
                  }
                  onEdit={() => setDraft({ stage, step })}
                />
              ))}
            </ul>
            <Button
              size="sm"
              leadingIcon={<Plus />}
              className="self-start"
              onClick={() => setDraft({ stage, step: null })}
            >
              {t('add')}
            </Button>
          </SettingsSection>
        );
      })}
      <StepDialog draft={draft} onClose={() => setDraft(null)} />
      <Dialog
        open={switchingOff !== null}
        onOpenChange={(next) => !next && setSwitchingOff(null)}
        title={t('offTitle', { name: switchingOff?.name ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="quiet" onClick={() => setSwitchingOff(null)}>
              {t('offKeep')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (switchingOff) {
                  change.mutate({ kind: 'update', key: switchingOff.key, body: { active: false } });
                }
                setSwitchingOff(null);
              }}
            >
              {t('offConfirm')}
            </Button>
          </>
        }
      >
        {switchingOff && (
          <p className="type-body-sm text-ink-muted">
            {t('offBody', {
              count: switchingOff.leads,
              next:
                query.data.find(
                  (step) =>
                    step.stage === switchingOff.stage &&
                    step.active &&
                    step.key !== switchingOff.key,
                )?.name ?? t(`stage.${switchingOff.stage}`),
            })}
          </p>
        )}
      </Dialog>
    </div>
  );
}

function StepRow({
  step,
  first,
  last,
  busy,
  onToggle,
  onMove,
  onEdit,
}: {
  readonly step: LeadStepRecord;
  readonly first: boolean;
  readonly last: boolean;
  readonly busy: boolean;
  readonly onToggle: (active: boolean) => void;
  readonly onMove: (move: 'up' | 'down') => void;
  readonly onEdit: () => void;
}) {
  const t = useTranslations('settings.leadSteps');
  return (
    <li className="flex items-center gap-1 py-1 pr-2 pl-4">
      <Switch
        className="min-w-0 flex-1"
        checked={step.active}
        disabled={busy}
        onCheckedChange={onToggle}
        label={step.name}
        description={t('leads', { count: step.leads })}
      />
      <IconButton
        size="sm"
        label={t('up', { name: step.name })}
        disabled={first || busy}
        onClick={() => onMove('up')}
      >
        <ArrowUp aria-hidden />
      </IconButton>
      <IconButton
        size="sm"
        label={t('down', { name: step.name })}
        disabled={last || busy}
        onClick={() => onMove('down')}
      >
        <ArrowDown aria-hidden />
      </IconButton>
      <IconButton size="sm" label={t('edit', { name: step.name })} onClick={onEdit}>
        <Pencil aria-hidden />
      </IconButton>
    </li>
  );
}
