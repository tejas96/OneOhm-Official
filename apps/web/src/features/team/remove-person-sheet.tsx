'use client';

import type { Person } from '@oneohm/api-contracts';
import { Button, Sheet, Skeleton, SkeletonGroup, useToast } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { FormError } from '@/components/form-error';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { handedOverCount, handOverCandidates, presetTarget } from './departure';
import { OpenWorkList, SettlementList, SoleHolderWarnings } from './departure-lists';
import { type HandoverDraft, HandoverFields } from './handover-fields';
import { useDeparture, useHeldPerson } from './use-departure';
import { PEOPLE_KEY, ROLES_KEY } from './use-team';

const freshDraft = (): HandoverDraft => ({
  targetId: undefined,
  lastWorkingDay: todayIn(),
  tellCustomers: true,
});

/**
 * Remove from team (spec Flow 5): what they have open, who it goes to, what is still owed
 * to them, then one button. The server moves everything in one step.
 */
export function RemovePersonSheet({
  person,
  people,
  onClose,
}: {
  readonly person: Person | null;
  readonly people: readonly Person[];
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.remove');
  const shown = useHeldPerson(person);
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const departure = useDeparture(shown?.id ?? null);
  const [draft, setDraft] = useState(freshDraft);
  const today = todayIn();
  const personId = shown?.id;
  const candidates = useMemo(
    () => (personId ? handOverCandidates(people, personId) : []),
    [people, personId],
  );
  const suggestedId = departure.data?.suggestedTargetId ?? null;
  const { reset } = form;

  // A fresh start each time the sheet opens, even for the same person.
  const openedId = person?.id;
  useEffect(() => {
    if (!openedId) return;
    setDraft(freshDraft());
    reset();
  }, [openedId, reset]);

  // Until the admin picks someone, the picker shows their manager (the suggested person).
  const targetId = draft.targetId ?? presetTarget(candidates, suggestedId);
  const target = candidates.find((entry) => entry.id === targetId);
  const ready =
    departure.data !== undefined &&
    target !== undefined &&
    draft.lastWorkingDay !== '' &&
    draft.lastWorkingDay <= today;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shown || !target || !departure.data || !ready) return;
    const moved = handedOverCount(departure.data.counts);
    await form.run(
      () =>
        expectStatus(
          api.people.removePerson({
            params: { id: shown.id },
            body: {
              handToUserId: target.id,
              lastWorkingDay: draft.lastWorkingDay,
              tellCustomers: draft.tellCustomers,
            },
          }),
          200,
        ),
      async (removed) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: PEOPLE_KEY }),
          queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
        ]);
        toast({
          title: t('removed', { name: removed.fullName, count: moved, target: target.fullName }),
          tone: 'success',
        });
        onClose();
      },
    );
  };

  const name = shown?.fullName ?? '';
  return (
    <Sheet
      open={person !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('title', { name })}
      description={t('description')}
      width="lg"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="danger"
            pending={form.pending}
            disabled={!ready}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        aria-busy={departure.isPending}
        className="flex flex-col gap-7 px-5 py-6 sm:px-6"
      >
        {departure.isPending && (
          <SkeletonGroup label={t('loading', { name })}>
            <Skeleton className="h-32 w-full rounded-lg" />
          </SkeletonGroup>
        )}
        {departure.isError && (
          <LoadError error={departure.error} onRetry={() => departure.refetch()} />
        )}
        {departure.data && (
          <>
            <OpenWorkList counts={departure.data.counts} />
            <div className="border-t border-hairline pt-6">
              <HandoverFields
                draft={{ ...draft, targetId }}
                onChange={setDraft}
                candidates={candidates}
                today={today}
                errors={form.fieldErrors}
              />
            </div>
            <SoleHolderWarnings capabilities={departure.data.soleHolderOf} />
            <SettlementList name={name} settlement={departure.data.settlement} />
          </>
        )}
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
