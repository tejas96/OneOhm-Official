'use client';

import type { Skill } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input, Textarea, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { SKILLS_KEY } from '@/features/team/skills/use-skills';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';

/** Add a skill, or rename one; its key stays the same so people and templates keep it. */
export function SkillDialog({
  open,
  skill,
  onClose,
}: {
  readonly open: boolean;
  /** null adds a new skill. */
  readonly skill: Skill | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.workforce.skills.dialog');
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setName(skill?.name ?? '');
    setDescription(skill?.description ?? '');
    reset();
  }, [open, skill, reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = { name: name.trim(), description: description.trim() };
    const saved = await form.run(() =>
      skill
        ? expectStatus(api.skills.updateSkill({ params: { key: skill.key }, body }), 200)
        : expectStatus(api.skills.createSkill({ body }), 201),
    );
    if (!saved) return;
    await queryClient.invalidateQueries({ queryKey: SKILLS_KEY });
    toast({ title: skill ? t('updated') : t('added'), reference: saved.name, tone: 'success' });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={skill ? t('editTitle', { name: skill.name }) : t('addTitle')}
      description={t('description')}
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {skill ? t('save') : t('add')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 pb-2">
        <Field label={t('name')} required error={form.fieldErrors.name}>
          <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t('about')} hint={t('aboutHint')} error={form.fieldErrors.description}>
          <Textarea
            value={description}
            rows={2}
            maxLength={200}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        {form.error && <p className="type-body-sm text-overdue">{form.error}</p>}
      </form>
    </Dialog>
  );
}
