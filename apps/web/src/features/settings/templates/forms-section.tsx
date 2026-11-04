'use client';

import type { WhatsappForm } from '@oneohm/api-contracts';
import { Badge, Button, Field, Input, useToast } from '@oneohm/design-system/web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { SettingsSection } from '../settings-section';

const KEY = ['settings', 'whatsapp-forms'] as const;

/** One form: its name and version, whether it is published, and a place to paste its flow id. */
function FormRow({ form }: { readonly form: WhatsappForm }) {
  const t = useTranslations('settings.forms');
  const toast = useToast();
  const client = useQueryClient();
  const api_ = useApiForm();
  const [flowId, setFlowId] = useState(form.flowId ?? '');
  const dirty = flowId.trim() !== (form.flowId ?? '');
  const save = () =>
    api_.run(
      () =>
        expectStatus(api.whatsapp.saveForm({ params: { key: form.key }, body: { flowId } }), 200),
      async () => {
        await client.invalidateQueries({ queryKey: KEY });
        toast({ title: t('saved'), reference: form.name, tone: 'success' });
      },
    );
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="type-body-md text-ink">{form.name}</span>
        <span className="type-body-sm text-ink-faint">
          {t('version', { version: form.version })}
        </span>
        <Badge variant="outline">{form.flowId ? t('published') : t('notPublished')}</Badge>
      </div>
      <Field label={t('flowId')} hint={t('flowIdHint')} error={api_.fieldErrors.flowId}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="sm:max-w-64">
            <Input
              value={flowId}
              inputMode="numeric"
              onChange={(event) => setFlowId(event.target.value)}
              placeholder={t('flowIdPlaceholder')}
            />
          </div>
          <Button variant="primary" onClick={save} pending={api_.pending} disabled={!dirty}>
            {t('save')}
          </Button>
        </div>
      </Field>
      <FormError message={api_.error} />
    </li>
  );
}

/**
 * Settings → WhatsApp messages → Forms: the forms we send in chats (Send a paper), each with its
 * version and whether it is published. A form with no flow id is "not available" and the
 * chat asks for the photo instead. Publishing is done with the `forms:publish` script; an
 * owner who publishes by hand pastes the flow id here.
 */
export function FormsSection() {
  const t = useTranslations('settings.forms');
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => expectStatus(api.whatsapp.forms(), 200),
  });
  return (
    <SettingsSection title={t('title')} description={t('help')}>
      {query.isPending && <ListSkeleton label={t('loading')} rows={1} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && (
        <ul className="flex flex-col divide-y divide-hairline">
          {query.data.map((form) => (
            <FormRow key={`${form.key}:${form.flowId ?? ''}`} form={form} />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
