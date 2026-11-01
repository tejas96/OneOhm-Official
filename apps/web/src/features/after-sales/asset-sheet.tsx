'use client';

import type { InstalledAsset } from '@oneohm/api-contracts';
import { Button, Field, Input, Sheet, Textarea, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRefreshAfterSales } from './use-project-after-sales';

const splitSerials = (text: string) =>
  text
    .split(/[\n,;]+/)
    .map((serial) => serial.trim())
    .filter(Boolean);

/** Correct an installed item's make, model and serial numbers. */
export function AssetSheet({
  projectId,
  asset,
  onClose,
}: {
  readonly projectId: string;
  readonly asset: InstalledAsset | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('afterSales.project');
  const settingsT = useTranslations('settings');
  const formId = useId();
  const toast = useToast();
  const form = useApiForm();
  const refresh = useRefreshAfterSales(projectId);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [serials, setSerials] = useState('');
  const { reset } = form;

  useEffect(() => {
    if (!asset) return;
    setMake(asset.make ?? '');
    setModel(asset.model);
    setSerials(asset.serialNumbers.join('\n'));
    reset();
  }, [asset, reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!asset) return;
    const saved = await form.run(() =>
      expectStatus(
        api.afterSales.updateAsset({
          params: { id: asset.id },
          body: { make: make.trim() || null, model, serialNumbers: splitSerials(serials) },
        }),
        200,
      ),
    );
    if (!saved) return;
    await refresh();
    toast({ tone: 'success', title: t('asset.saved') });
    onClose();
  };

  const kind = asset ? t(`kinds.${asset.kind}`) : '';
  return (
    <Sheet
      open={asset !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('asset.title', { item: kind })}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {settingsT('save')}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-5 px-5 py-6 sm:px-6"
      >
        <Field label={t('asset.make')} error={form.fieldErrors.make}>
          <Input value={make} onChange={(event) => setMake(event.target.value)} />
        </Field>
        <Field label={t('asset.model')} error={form.fieldErrors.model} required>
          <Input value={model} onChange={(event) => setModel(event.target.value)} />
        </Field>
        <Field
          label={t('asset.serials')}
          hint={t('asset.serialsHint')}
          error={form.fieldErrors.serialNumbers}
        >
          <Textarea
            value={serials}
            onChange={(event) => setSerials(event.target.value)}
            rows={6}
            className="font-mono"
          />
        </Field>
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
