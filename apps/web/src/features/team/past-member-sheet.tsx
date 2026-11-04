'use client';

import type { Person } from '@oneohm/api-contracts';
import { Button, Sheet, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { FormError } from '@/components/form-error';
import { LoadError } from '@/components/query-state';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useCan } from '@/providers/current-user';
import { owesAnything, SettlementList } from './departure-lists';
import { useLeftDate } from './left-tag';
import { useDeparture, useHeldPerson, useRejoin } from './use-departure';

/**
 * A past member's page (spec Flow 5): when they left, what the company still owes them
 * (finance settles it from here), and Add back to team.
 */
export function PastMemberSheet({
  person,
  onClose,
}: {
  readonly person: Person | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.pastMember');
  // Finance opens this page to settle; only people managers bring someone back.
  const canManage = useCan('people.manage');
  const shown = useHeldPerson(person);
  const leftDate = useLeftDate();
  const departure = useDeparture(shown?.id ?? null);
  const rejoin = useRejoin();
  const form = useApiForm();
  const { reset } = form;
  const personId = shown?.id;

  const openedId = person?.id;
  useEffect(() => {
    if (openedId) reset();
  }, [openedId, reset]);

  const addBack = () => {
    if (!personId) return;
    return form.run(() => rejoin(personId), onClose);
  };

  const name = shown?.fullName ?? '';
  return (
    <Sheet
      open={person !== null}
      onOpenChange={(open) => !open && onClose()}
      title={name}
      description={shown?.leftOn ? t('leftOn', { date: leftDate(shown.leftOn) }) : t('leftNoDate')}
      width="lg"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('close')}
          </Button>
          {canManage && (
            <Button
              variant="primary"
              leadingIcon={<UserRoundPlus />}
              pending={form.pending}
              onClick={addBack}
            >
              {t('addBack')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-6 px-5 py-6 sm:px-6">
        {departure.isPending && (
          <SkeletonGroup label={t('loading', { name })}>
            <Skeleton className="h-24 w-full rounded-lg" />
          </SkeletonGroup>
        )}
        {departure.isError && (
          <LoadError error={departure.error} onRetry={() => departure.refetch()} />
        )}
        {departure.data &&
          (owesAnything(departure.data.settlement) ? (
            <SettlementList name={name} settlement={departure.data.settlement} />
          ) : (
            <p className="type-body-sm text-ink-muted">{t('nothingOwed', { name })}</p>
          ))}
        {canManage && (
          <p className="border-t border-hairline pt-6 type-body-sm text-ink-faint">
            {t('addBackHint')}
          </p>
        )}
        <FormError message={form.error} />
      </div>
    </Sheet>
  );
}
