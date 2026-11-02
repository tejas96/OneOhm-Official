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
import { useQuery } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useDiscoms } from '../settings/use-settings';
import { RaiseOptionDetails } from './raise-option-details';
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
  initialType,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly propertyId?: string;
  readonly projectId?: string;
  /** The type a suggestion picked; the person can still change it. */
  readonly initialType?: string;
}) {
  const t = useTranslations('discom.raise');
  const fieldT = useTranslations('discom.fields');
  const formId = useId();
  const toast = useToast();
  const router = useRouter();
  const refresh = useRefreshDiscom();
  const form = useApiForm();
  const [type, setType] = useState<string>(initialType ?? 'consumer_name_change');
  const [discomId, setDiscomId] = useState<string | null>(null);
  const discoms = useDiscoms();
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
  const options = useQuery({
    queryKey: ['change-requests', 'options', sitePropertyId, projectId, discomId],
    queryFn: () =>
      expectStatus(
        api.changeRequestTypes.changeRequestOptions({
          query: {
            ...(sitePropertyId ? { propertyId: sitePropertyId } : {}),
            ...(projectId ? { projectId } : {}),
            ...(discomId ? { discomId } : {}),
          },
        }),
        200,
      ),
    enabled: open && Boolean(sitePropertyId || projectId),
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () =>
        expectStatus(
          api.discom.createChangeRequest({
            body: {
              type: definition?.key ?? type,
              values,
              note: note.trim() || null,
              ...(discomId ? { discomId } : {}),
              ...(sitePropertyId ? { propertyId: sitePropertyId } : {}),
              projectId: projectId ?? site?.projectId ?? null,
            },
          }),
          201,
        ),
      async (created) => {
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
      },
    );
  };

  const choices = options.data?.options ?? [];
  const definition = choices.find((option) => option.key === type) ?? choices[0];
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
                      {t('suggested', { type: suggestion.title })}
                    </span>{' '}
                    <span className="text-ink-muted">{suggestion.reason}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {options.data?.askDiscom && (
          <Field label={t('discom')} hint={t('discomHint')} error={form.fieldErrors.discomId}>
            <Select
              value={discomId ?? options.data.discom?.id}
              onValueChange={setDiscomId}
              placeholder={t('choose')}
              options={(discoms.data ?? [])
                .filter((discom) => discom.active)
                .map((discom) => ({ value: discom.id, label: `${discom.code} · ${discom.name}` }))}
            />
          </Field>
        )}
        {definition && (
          <Field label={t('type')} error={form.fieldErrors.type}>
            <Select
              value={definition.key}
              onValueChange={(next) => {
                setType(next);
                setValues({});
              }}
              options={choices.map((option) => ({
                value: option.key,
                label: option.title,
                description: option.description,
              }))}
            />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {definition?.fields.map((field) => (
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
                  options={(field.options ?? []).map((option) => ({
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
        {definition && (
          <RaiseOptionDetails option={definition} error={form.fieldErrors.documents} />
        )}
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
