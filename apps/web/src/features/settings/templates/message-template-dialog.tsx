'use client';

import type { MessageTemplate } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  Input,
  Switch,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { messageFieldsFor, renderTemplate, templateExtras } from '@oneohm/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { SAMPLE, sampleFor, TEMPLATE_KEYS } from './use-templates';

interface Draft {
  metaName: string;
  language: string;
  /** The Marathi and Hindi templates' names; empty sends English (PRD 6.2 language). */
  metaNameMr: string;
  metaNameHi: string;
  fields: string;
  preview: string;
  active: boolean;
  extrasApproved: boolean;
}

/** Edit how one message maps onto its approved WhatsApp template. */
export function MessageTemplateDialog({
  template,
  name,
  onClose,
}: {
  readonly template: MessageTemplate | null;
  readonly name: string;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.messageTemplates.dialog');
  const settingsT = useTranslations('settings');
  const formId = useId();
  const toast = useToast();
  const client = useQueryClient();
  const form = useApiForm();
  const { reset } = form;
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!template) return;
    setDraft({
      ...template,
      metaNameMr: template.metaNameMr ?? '',
      metaNameHi: template.metaNameHi ?? '',
      fields: template.fields.join(', '),
    });
    reset();
  }, [template, reset]);

  if (!template || !draft) return null;
  const fields = draft.fields
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = {
      metaName: draft.metaName,
      language: draft.language,
      metaNameMr: draft.metaNameMr.trim() || null,
      metaNameHi: draft.metaNameHi.trim() || null,
      fields,
      preview: draft.preview,
      active: draft.active,
      extrasApproved: draft.extrasApproved,
    };
    await form.run(
      () =>
        expectStatus(
          api.templates.updateMessageTemplate({ params: { key: template.key }, body }),
          200,
        ),
      async () => {
        await client.invalidateQueries({ queryKey: TEMPLATE_KEYS.messages });
        toast({ title: t('saved', { name }), tone: 'success' });
        onClose();
      },
    );
  };

  const errors = form.fieldErrors;
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('title', { name })}
      size="lg"
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {settingsT('save')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Field label={t('metaName')} error={errors.metaName} required>
            <Input
              value={draft.metaName}
              onChange={(e) => set('metaName', e.target.value)}
              className="font-mono"
            />
          </Field>
          <Field label={t('language')} hint={t('languageHint')} error={errors.language} required>
            <Input
              value={draft.language}
              onChange={(e) => set('language', e.target.value)}
              className="font-mono"
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('metaNameMr')} error={errors.metaNameMr}>
              <Input
                value={draft.metaNameMr}
                onChange={(e) => set('metaNameMr', e.target.value)}
                className="font-mono"
              />
            </Field>
            <Field label={t('metaNameHi')} error={errors.metaNameHi}>
              <Input
                value={draft.metaNameHi}
                onChange={(e) => set('metaNameHi', e.target.value)}
                className="font-mono"
              />
            </Field>
          </div>
          <p className="type-body-sm text-ink-muted">{t('localHint')}</p>
        </div>
        <Field label={t('preview')} hint={t('previewHint')} error={errors.preview} required>
          <Textarea
            value={draft.preview}
            rows={3}
            onChange={(e) => set('preview', e.target.value)}
          />
        </Field>
        <Field
          label={t('fields')}
          hint={t('fieldsHint', {
            available: (messageFieldsFor(template.key) ?? Object.keys(SAMPLE)).join(', '),
          })}
          error={errors.fields}
          required
        >
          <Input
            value={draft.fields}
            onChange={(e) => set('fields', e.target.value)}
            className="font-mono"
          />
        </Field>
        <div className="flex flex-col gap-1.5 rounded-lg bg-sunken px-4 py-3">
          <p className="type-label text-ink-faint">{t('sample')}</p>
          <p className="type-body-sm text-ink">
            {renderTemplate(draft.preview, fields, sampleFor(template.key))}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Switch
            checked={draft.active}
            onCheckedChange={(value) => set('active', value)}
            label={t('active')}
          />
          <p className="type-body-sm text-ink-muted">{t('activeHint')}</p>
        </div>
        {templateExtras(template.key) && (
          <div className="flex flex-col gap-1">
            <Switch
              checked={draft.extrasApproved}
              onCheckedChange={(value) => set('extrasApproved', value)}
              label={t('extrasApproved')}
            />
            <p className="type-body-sm text-ink-muted">{t('extrasApprovedHint')}</p>
          </div>
        )}
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
