'use client';

import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import {
  CHANGE_REQUEST_DEFINITIONS,
  CHANGE_REQUEST_TYPES,
  type ChangeRequestType,
} from '@oneohm/domain';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { type SiteChoice, SitePicker } from './site-picker';
import { useRefreshDiscom } from './use-discom';

/**
 * One step (PRD 3.15): pick the type and fill only its fields. Opened from a customer's
 * site or a project the site is known; from the DISCOM desk you pick it first.
 */
export function RaiseChangeRequestDialog({
  open,
  onOpenChange,
  propertyId,
  projectId,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly propertyId?: string;
  readonly projectId?: string;
}) {
  const t = useTranslations('discom.raise');
  const typeT = useTranslations('discom.types');
  const fieldT = useTranslations('discom.fields');
  const formId = useId();
  const toast = useToast();
  const router = useRouter();
  const refresh = useRefreshDiscom();
  const form = useApiForm();
  const [type, setType] = useState<ChangeRequestType>('consumer_name_change');
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [site, setSite] = useState<SiteChoice | null>(null);
  const fixed = Boolean(propertyId || projectId);
  const sitePropertyId = propertyId ?? site?.propertyId;
  const suggestions = useQuery({
    queryKey: ['change-requests', 'suggestions', sitePropertyId],
    queryFn: () =>
      expectStatus(
        api.discom.changeRequestSuggestions({ params: { id: sitePropertyId ?? '' } }),
        200,
      ),
    enabled: open && Boolean(sitePropertyId),
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await form.run(() =>
      expectStatus(
        api.discom.createChangeRequest({
          body: {
            type,
            values,
            note: note.trim() || null,
            ...(sitePropertyId ? { propertyId: sitePropertyId } : {}),
            projectId: projectId ?? site?.projectId ?? null,
          },
        }),
        201,
      ),
    );
    if (!created) return;
    await refresh();
    toast({
      tone: 'success',
      title: t('done', { number: created.number }),
      reference: created.number,
    });
    onOpenChange(false);
    setValues({});
    setNote('');
    router.push(`/discom/change-requests/${created.id}`);
  };

  const definition = CHANGE_REQUEST_DEFINITIONS[type];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
      size="lg"
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {!fixed && (
          <SitePicker value={site} onChange={setSite} error={form.fieldErrors.propertyId} />
        )}
        {(suggestions.data ?? []).length > 0 && (
          <ul className="flex flex-col gap-2">
            {suggestions.data?.map((suggestion) => (
              <li key={suggestion.type}>
                <button
                  type="button"
                  onClick={() => setType(suggestion.type)}
                  className="flex w-full items-start gap-2.5 rounded-lg bg-energy-soft px-3 py-2.5 text-left type-body-sm text-ink hover:ring-1 hover:ring-hairline"
                >
                  <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
                  <span>
                    <span className="font-medium">
                      {t('suggested', { type: typeT(suggestion.type) })}
                    </span>{' '}
                    <span className="text-ink-muted">{suggestion.reason}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Field label={t('type')} error={form.fieldErrors.type}>
          <Select
            value={type}
            onValueChange={(next) => {
              setType(next);
              setValues({});
            }}
            options={CHANGE_REQUEST_TYPES.map((value) => ({
              value,
              label: typeT(value),
              description: t(`purpose.${value}`),
            }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {definition.fields.map((field) => (
            <Field
              key={field.key}
              label={fieldT(field.key)}
              required={field.required}
              error={form.fieldErrors[field.key]}
            >
              {field.kind === 'select' ? (
                <Select
                  value={values[field.key]}
                  onValueChange={(value) => setValues({ ...values, [field.key]: value })}
                  placeholder={t('choose')}
                  options={field.options.map((option) => ({
                    value: option,
                    label: fieldT(`options.${option}`),
                  }))}
                />
              ) : (
                <Input
                  value={values[field.key] ?? ''}
                  inputMode={field.kind === 'kw' ? 'decimal' : undefined}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
        <Field label={t('note')}>
          <Textarea value={note} rows={2} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <p className="type-body-sm text-ink-muted">
          {t('steps', { count: definition.steps.length })}
          {definition.blocks.stages.length + definition.blocks.taskKeys.length > 0 &&
            ` ${t('blocks')}`}
        </p>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
