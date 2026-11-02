'use client';

import type { Role } from '@oneohm/api-contracts';
import {
  Button,
  Field,
  Input,
  SegmentedControl,
  Sheet,
  Switch,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { type Capability, ROLE_KINDS, type RoleKind } from '@oneohm/domain';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ROLES_KEY } from '@/features/team/use-team';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { CapabilityChecklist } from './capability-checklist';

/** `role` null with `open` true creates a new role. */
export function RoleEditorSheet({
  open,
  role,
  onClose,
}: {
  readonly open: boolean;
  readonly role: Role | null;
  readonly onClose: () => void;
}) {
  const settingsT = useTranslations('settings');
  const t = useTranslations('settings.roles');
  const editorT = useTranslations('settings.roles.editor');
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<RoleKind>('staff');
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [archived, setArchived] = useState(false);
  const { reset } = form;
  const locked = role?.system ?? false;

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setKind(role?.kind ?? 'staff');
    setCapabilities(role ? [...role.capabilities] : []);
    setArchived(role?.archived ?? false);
    reset();
  }, [open, role, reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.run(
      () =>
        role
          ? expectStatus(
              api.people.updateRole({
                params: { id: role.id },
                body: locked
                  ? { name, description }
                  : { name, description, capabilities, archived },
              }),
              200,
            )
          : expectStatus(
              api.people.createRole({ body: { name, description, kind, capabilities } }),
              201,
            ),
      async (saved) => {
        await queryClient.invalidateQueries({ queryKey: ROLES_KEY });
        toast({
          title: role
            ? editorT('updated', { name: saved.name })
            : editorT('created', { name: saved.name }),
          tone: 'success',
        });
        onClose();
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={role ? editorT('editTitle') : editorT('createTitle')}
      description={role ? role.name : undefined}
      width="lg"
      autoFocusField={!role}
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {role ? settingsT('save') : editorT('create')}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      >
        {locked && (
          <p className="flex items-start gap-2.5 rounded-lg bg-accent-soft px-4 py-3 type-body-sm text-on-accent-soft">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {editorT('protectedNote')}
          </p>
        )}
        <Field label={editorT('name')} error={form.fieldErrors.name} required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={editorT('description')} error={form.fieldErrors.description}>
          <Textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field
          label={editorT('kind')}
          hint={role ? editorT('kindLocked') : editorT('kindHint')}
          error={form.fieldErrors.kind}
        >
          <SegmentedControl
            value={kind}
            onValueChange={(next) => {
              if (!role) setKind(next);
            }}
            options={ROLE_KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }))}
            label={editorT('kind')}
            className={role ? 'pointer-events-none opacity-60' : ''}
          />
        </Field>
        <CapabilityChecklist value={capabilities} onChange={setCapabilities} disabled={locked} />
        {role && !locked && (
          <div className="border-t border-hairline pt-4">
            <Switch
              checked={archived}
              onCheckedChange={setArchived}
              label={editorT('archive')}
              description={editorT('archiveHint')}
            />
          </div>
        )}
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
