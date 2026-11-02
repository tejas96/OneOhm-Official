'use client';

import type { CustodyHolding, CustodyProject } from '@oneohm/api-contracts';
import { Button, Field, Input, Select, Sheet, Textarea, useToast } from '@oneohm/design-system/web';
import { parseSerials } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { formatQuantity, useLocations, useRefreshInventory } from '../use-inventory';
import type { DrawMode } from './custody-card';
import { settled } from './use-custody';

interface Draft {
  readonly quantity: string;
  readonly serials: string;
}
const keyOf = (holding: CustodyHolding) => `${holding.productId}|${holding.lineKey ?? ''}`;

/** Usage or a return, drawn from what one contractor holds on this project. */
export function DrawSheet({
  group,
  mode,
  onClose,
}: {
  readonly group: CustodyProject | null;
  readonly mode: DrawMode;
  readonly onClose: () => void;
}) {
  const t = useTranslations('inventory.custody.drawForm');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const form = useApiForm();
  const locations = useLocations();
  const active = useMemo(
    () => (locations.data ?? []).filter((location) => location.active),
    [locations.data],
  );
  const [locationId, setLocationId] = useState<string | undefined>();
  const [occurredOn, setOccurredOn] = useState(todayIn());
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [submitted, setSubmitted] = useState<readonly string[]>([]);
  const { reset } = form;
  const holdings = (group?.holdings ?? []).filter((holding) => !settled(holding));
  const returning = mode === 'return';

  useEffect(() => {
    if (!group) return;
    setOccurredOn(todayIn());
    setNote('');
    setDrafts({});
    setSubmitted([]);
    reset();
  }, [group, reset]);
  useEffect(() => {
    if (!locationId) setLocationId((active.find((row) => row.code === 'MAIN') ?? active[0])?.id);
  }, [active, locationId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!group) return;
    const lines = holdings.flatMap((holding) => {
      const draft = drafts[keyOf(holding)];
      if (!draft || draft.quantity.trim() === '') return [];
      return [
        {
          key: keyOf(holding),
          productId: holding.productId,
          lineKey: holding.lineKey,
          quantity: Number(draft.quantity.replace(/,/g, '')),
          serials: returning && holding.serialised ? parseSerials(draft.serials) : [],
        },
      ];
    });
    if (lines.length === 0) {
      toast({ tone: 'error', title: t('nothing') });
      return;
    }
    setSubmitted(lines.map((line) => line.key));
    const body = {
      contractorId: group.contractor.id,
      occurredOn,
      note,
      lines: lines.map(({ key: _key, ...line }) => line),
    };
    const params = { id: group.project.id };
    await form.run(
      () =>
        returning
          ? expectStatus(
              api.inventory.custody.recordReturn({
                params,
                body: { ...body, locationId: locationId ?? null },
              }),
              201,
            )
          : expectStatus(api.inventory.custody.recordUse({ params, body }), 201),
      async (saved) => {
        await refresh(group.project.id);
        toast({
          tone: 'success',
          title: t(returning ? 'savedReturn' : 'savedUse', { number: saved.number }),
        });
        onClose();
      },
    );
  };

  const lineError = (holding: CustodyHolding) => {
    const index = submitted.indexOf(keyOf(holding));
    if (index < 0) return undefined;
    return Object.entries(form.fieldErrors).find(([path]) =>
      path.startsWith(`lines.${index}`),
    )?.[1];
  };
  const update = (holding: CustodyHolding, patch: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [keyOf(holding)]: { quantity: '', serials: '', ...current[keyOf(holding)], ...patch },
    }));
  const vars = { contractor: group?.contractor.name ?? '', project: group?.project.code ?? '' };

  return (
    <Sheet
      open={group !== null}
      onOpenChange={(next) => !next && onClose()}
      title={t(returning ? 'returnTitle' : 'useTitle')}
      description={t(returning ? 'returnDescription' : 'useDescription', vars)}
      width="md"
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t(returning ? 'saveReturn' : 'saveUse')}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      >
        <FormError message={form.error} />
        <div className="grid gap-5 sm:grid-cols-2">
          {returning && (
            <Field label={t('location')} required>
              <Select
                value={locationId}
                onValueChange={setLocationId}
                options={active.map((row) => ({ value: row.id, label: row.name }))}
              />
            </Field>
          )}
          <Field label={t('date')} required error={form.fieldErrors.occurredOn}>
            <Input
              type="date"
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </Field>
        </div>
        {holdings.length === 0 ? (
          <p className="type-body-sm text-ink-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
            {holdings.map((holding) => {
              const draft = drafts[keyOf(holding)];
              return (
                <li key={keyOf(holding)} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="type-body-sm font-medium text-ink">{holding.name}</span>
                      <span className="type-label text-ink-faint">
                        {t('held', {
                          balance: formatQuantity(holding.balance),
                          unit: holding.unit,
                        })}
                      </span>
                    </div>
                    <Input
                      aria-label={`${t('quantity')}: ${holding.name}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={draft?.quantity ?? ''}
                      onChange={(event) => update(holding, { quantity: event.target.value })}
                      className="w-28 shrink-0 font-mono tabular-nums"
                    />
                  </div>
                  {returning && holding.serialised && (
                    <Field
                      label={t('serials')}
                      hint={t('serialsHint', { serials: holding.serials.join(', ') || '—' })}
                    >
                      <Textarea
                        rows={2}
                        value={draft?.serials ?? ''}
                        onChange={(event) => update(holding, { serials: event.target.value })}
                        className="font-mono uppercase"
                      />
                    </Field>
                  )}
                  {lineError(holding) && (
                    <p className="type-label text-at-risk">{lineError(holding)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Field label={t('note')} error={form.fieldErrors.note}>
          <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}
