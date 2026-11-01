'use client';

import type { ProjectCustody, StockRow } from '@oneohm/api-contracts';
import { Button, Field, Input, Select, Sheet, Textarea, useToast } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { uploadSlipPhoto } from '@/lib/api/upload';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useLocations, useRefreshInventory, useStock } from '../use-inventory';
import { type IssueDraft, IssueLines, optionsFor } from './issue-lines';

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1 && word !== 'test'),
  );

/** The stock item whose name shares most words with the quotation line. */
function closest(description: string, options: readonly StockRow[]) {
  const wanted = words(description);
  const score = (item: StockRow) => [...words(item.name)].filter((word) => wanted.has(word)).length;
  return [...options].sort((a, b) => score(b) - score(a))[0];
}

/** First draft per line: the quoted item, else what was issued before, else the closest name. */
function firstDrafts(custody: ProjectCustody, stock: readonly StockRow[]) {
  const drafts: Record<string, IssueDraft> = {};
  for (const row of custody.rows) {
    if (!row.lineKey) continue;
    const options = optionsFor(row, stock);
    const pick =
      options.find((option) => option.productId === row.quoteProductId) ??
      options.find((option) => row.productIds.includes(option.productId)) ??
      closest(row.description, options);
    drafts[row.lineKey] = { productId: pick?.productId, quantity: '' };
  }
  return drafts;
}

/** Material out of the store into a contractor's hands, line by line from the quotation. */
export function IssueSheet({
  custody,
  open,
  onOpenChange,
}: {
  readonly custody: ProjectCustody;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('inventory.custody.issueForm');
  const formId = useId();
  const toast = useToast();
  const refresh = useRefreshInventory();
  const form = useApiForm();
  const stock = useStock();
  const locations = useLocations();
  const active = useMemo(
    () => (locations.data ?? []).filter((location) => location.active),
    [locations.data],
  );
  const [contractorId, setContractorId] = useState<string | undefined>();
  const [locationId, setLocationId] = useState<string | undefined>();
  const [occurredOn, setOccurredOn] = useState(todayIn());
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<Record<string, IssueDraft>>({});
  const [submitted, setSubmitted] = useState<readonly { key: string }[]>([]);
  const { reset } = form;
  const rows = custody.rows.filter((row) => row.lineKey !== null);

  useEffect(() => {
    if (!open) return;
    setContractorId(custody.contractors[0]?.id);
    setOccurredOn(todayIn());
    setNote('');
    setPhoto(null);
    setSubmitted([]);
    reset();
  }, [open, custody.contractors, reset]);
  useEffect(() => {
    if (open) setDrafts(firstDrafts(custody, stock.data ?? []));
  }, [open, custody, stock.data]);
  useEffect(() => {
    if (open && !locationId)
      setLocationId((active.find((row) => row.code === 'MAIN') ?? active[0])?.id);
  }, [open, active, locationId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contractorId || !locationId) return;
    const chosen = rows.flatMap((row) => {
      const draft = drafts[row.lineKey ?? ''];
      const quantity = Number(draft?.quantity.replace(/,/g, '') ?? '');
      return draft?.productId && draft.quantity.trim() !== ''
        ? [{ key: row.lineKey ?? '', productId: draft.productId, quantity }]
        : [];
    });
    if (chosen.length === 0) {
      form.reset();
      toast({ tone: 'error', title: t('nothing') });
      return;
    }
    setSubmitted(chosen);
    const saved = await form.run(() =>
      expectStatus(
        api.inventory.custody.issue({
          params: { id: custody.projectId },
          body: {
            contractorId,
            locationId,
            occurredOn,
            note,
            lines: chosen.map(({ key, productId, quantity }) => ({
              productId,
              lineKey: key,
              quantity,
            })),
          },
        }),
        201,
      ),
    );
    if (!saved) return;
    if (photo) {
      try {
        await uploadSlipPhoto(saved.id, photo);
      } catch (error) {
        toast({ tone: 'error', title: t('photoFailed', { reason: describeError(error) }) });
      }
    }
    await refresh(custody.projectId);
    toast({ tone: 'success', title: t('saved', { number: saved.number }) });
    onOpenChange(false);
  };

  const contractor = custody.contractors.find((row) => row.id === contractorId);
  const lineErrors = errorsByLine(form.fieldErrors, submitted);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description', {
        contractor: contractor?.name ?? '—',
        project: custody.projectCode,
      })}
      width="lg"
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('save')}
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
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t('contractor')} required>
            <Select
              value={contractorId}
              onValueChange={setContractorId}
              options={custody.contractors.map((row) => ({
                value: row.id,
                label: row.name,
                description: row.workOrderNumber,
              }))}
            />
          </Field>
          <Field label={t('location')} required>
            <Select
              value={locationId}
              onValueChange={setLocationId}
              options={active.map((row) => ({ value: row.id, label: row.name }))}
            />
          </Field>
          <Field label={t('date')} required error={form.fieldErrors.occurredOn}>
            <Input
              type="date"
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <p className="type-label font-medium text-ink">{t('lines')}</p>
          <p className="type-label text-ink-faint">{t('linesHint')}</p>
          <IssueLines
            rows={rows}
            stock={stock.data ?? []}
            locationId={locationId ?? ''}
            drafts={drafts}
            errors={lineErrors}
            onChange={(key, draft) => setDrafts((current) => ({ ...current, [key]: draft }))}
          />
        </div>
        <Field label={t('note')} error={form.fieldErrors.note}>
          <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <Field label={t('photo')} hint={t('photoHint')}>
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
        </Field>
      </form>
    </Sheet>
  );
}

/** API errors come per submitted line (`lines.2.quantity`); show them on that line. */
function errorsByLine(
  fieldErrors: Readonly<Record<string, string>>,
  chosen: readonly { key: string }[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, message] of Object.entries(fieldErrors)) {
    const index = /^lines\.(\d+)/.exec(path)?.[1];
    const key = index === undefined ? undefined : chosen[Number(index)]?.key;
    if (key) result[key] = message;
  }
  return result;
}
