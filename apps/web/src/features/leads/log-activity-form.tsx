'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  Field,
  Input,
  SegmentedControl,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { MapPin, MessageCircle, NotebookPen, PhoneCall } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ApiError, describeError } from '@/lib/api/api-error';
import { isOpenLead } from './lead-labels';
import { useLogActivity, useUpdateLead } from './use-lead-mutations';

type Kind = 'call' | 'visit' | 'whatsapp' | 'note';
const KINDS = [
  { value: 'call', icon: <PhoneCall /> },
  { value: 'visit', icon: <MapPin /> },
  { value: 'whatsapp', icon: <MessageCircle /> },
  { value: 'note', icon: <NotebookPen /> },
] as const;

/** Log a call, visit, WhatsApp or note, and set the next follow-up in the same step. */
export function LogActivityForm({ lead }: { readonly lead: LeadDetail }) {
  const t = useTranslations('leads.log');
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('call');
  const [note, setNote] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const log = useLogActivity(lead.id);
  const update = useUpdateLead(lead.id);
  const open = isOpenLead(lead);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const nextOn = String(data.get('nextActionOn') ?? '');
    const nextNote = String(data.get('nextActionNote') ?? '').trim();
    setError(null);
    try {
      await log.mutateAsync({ kind, note: note.trim() });
      if (open && nextOn && (nextOn !== lead.nextActionOn || nextNote)) {
        await update.mutateAsync({ nextActionOn: nextOn, nextActionNote: nextNote || null });
      }
      setNote('');
      form.reset();
      toast({ tone: 'success', title: t('saved') });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError(0, describeError(caught), undefined, {}),
      );
    }
  };

  return (
    <Card className="rounded-[28px] p-5 shadow-e1">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-title-md text-ink">{t('title')}</h2>
          <SegmentedControl
            label={t('kindLabel')}
            size="sm"
            value={kind}
            onValueChange={setKind}
            options={KINDS.map((option) => ({
              value: option.value,
              icon: option.icon,
              label: t(`kind.${option.value}`),
              compactLabel: true,
            }))}
          />
        </div>
        <Field label={t('noteLabel')} hideLabel error={error?.fieldErrors.note}>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder={t(`placeholder.${kind}`)}
          />
        </Field>
        {open && (
          <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
            <Field label={t('nextOn')} error={error?.fieldErrors.nextActionOn}>
              <Input
                key={lead.nextActionOn ?? 'none'}
                name="nextActionOn"
                type="date"
                min={todayIn()}
                defaultValue={lead.nextActionOn ?? ''}
              />
            </Field>
            <Field label={t('nextNote')} error={error?.fieldErrors.nextActionNote}>
              <Input name="nextActionNote" placeholder={t('nextNotePlaceholder')} />
            </Field>
          </div>
        )}
        {error && !Object.keys(error.fieldErrors).length && (
          <p role="alert" className="type-body-sm text-overdue">
            {error.message}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!note.trim()}
            pending={log.isPending || update.isPending}
          >
            {t('submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
