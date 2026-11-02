'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  SegmentedControl,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { addDays, todayIn } from '@oneohm/shared';
import { MapPin, MessageCircle, NotebookPen, PhoneCall } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ApiError, describeError } from '@/lib/api/api-error';
import { type CheckKey, followUpProblem } from '@/lib/forms/checks';
import { useCurrentUser } from '@/providers/current-user';
import { isOpenLead } from './lead-labels';
import { useLogActivity, useUpdateLead } from './use-lead-mutations';

type Kind = 'call' | 'visit' | 'whatsapp' | 'note';
const KINDS = [
  { value: 'call', icon: <PhoneCall /> },
  { value: 'visit', icon: <MapPin /> },
  { value: 'whatsapp', icon: <MessageCircle /> },
  { value: 'note', icon: <NotebookPen /> },
] as const;

interface FollowUp {
  readonly nextActionOn: string;
  readonly nextActionTime: string | null;
  readonly nextActionNote: string | null;
}

function readFollowUp(data: FormData): FollowUp {
  return {
    nextActionOn: String(data.get('nextActionOn') ?? ''),
    nextActionTime: String(data.get('nextActionTime') ?? '') || null,
    nextActionNote: String(data.get('nextActionNote') ?? '').trim() || null,
  };
}

/** What to check before saving, and whether the follow-up moves at all. */
function planActivity(
  note: string,
  next: FollowUp,
  lead: LeadDetail,
  open: boolean,
): { readonly problems: Record<string, CheckKey>; readonly followUp: FollowUp | null } {
  const problems: Record<string, CheckKey> = {};
  if (!note.trim()) problems.note = 'required';
  if (!open || !next.nextActionOn) return { problems, followUp: null };
  const problem = followUpProblem(next.nextActionOn, next.nextActionTime);
  if (problem) problems[problem.field === 'date' ? 'nextActionOn' : 'nextActionTime'] = problem.key;
  const changed =
    next.nextActionOn !== lead.nextActionOn || next.nextActionTime !== lead.nextActionTime;
  return { problems, followUp: changed || next.nextActionNote ? next : null };
}

/** Log a call, visit, WhatsApp or note, and set the next follow-up in the same step. */
export function LogActivityForm({ lead }: { readonly lead: LeadDetail }) {
  const t = useTranslations('leads.log');
  const checkT = useTranslations('checks');
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('call');
  const [note, setNote] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // On a reseller's lead, staff notes stay with staff unless shared (PRD 4.8).
  const [staffOnly, setStaffOnly] = useState(true);
  const log = useLogActivity(lead.id);
  const update = useUpdateLead(lead.id);
  const open = isOpenLead(lead);
  const canKeepFromReseller = useCurrentUser().kind !== 'reseller';
  const today = todayIn();
  // An overdue follow-up should move on: offer tomorrow instead of a day already gone.
  const defaultNextOn =
    lead.nextActionOn && lead.nextActionOn < today ? addDays(today, 1) : (lead.nextActionOn ?? '');
  const fieldError = (key: string) => checks[key] ?? error?.fieldErrors[key];

  /** Moves the follow-up first: if it is refused nothing is saved, so a retry cannot log twice. */
  const save = async (followUp: FollowUp | null) => {
    if (followUp) await update.mutateAsync(followUp);
    await log.mutateAsync({
      kind,
      note: note.trim(),
      ...(lead.fromReseller && canKeepFromReseller ? { internal: staffOnly } : {}),
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const plan = planActivity(note, readFollowUp(new FormData(form)), lead, open);
    setError(null);
    setChecks(
      Object.fromEntries(Object.entries(plan.problems).map(([field, key]) => [field, checkT(key)])),
    );
    if (Object.keys(plan.problems).length > 0) return;
    setBusy(true);
    try {
      await save(plan.followUp);
      setNote('');
      form.reset();
      toast({ tone: 'success', title: t('saved') });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError(0, describeError(caught), undefined, {}),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-[28px] p-5 shadow-e1">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
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
        <Field label={t('noteLabel')} hideLabel required error={fieldError('note')}>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder={t(`placeholder.${kind}`)}
          />
        </Field>
        {open && (
          <div className="grid gap-3 sm:grid-cols-[11rem_8rem_1fr]">
            <Field label={t('nextOn')} error={fieldError('nextActionOn')}>
              <Input
                key={defaultNextOn || 'none'}
                name="nextActionOn"
                type="date"
                min={today}
                defaultValue={defaultNextOn}
              />
            </Field>
            <Field label={t('nextTime')} error={fieldError('nextActionTime')}>
              <Input
                key={`${lead.nextActionOn}-${lead.nextActionTime ?? 'none'}`}
                name="nextActionTime"
                type="time"
                step={300}
                defaultValue={lead.nextActionTime ?? ''}
              />
            </Field>
            <Field label={t('nextNote')} error={fieldError('nextActionNote')}>
              <Input name="nextActionNote" placeholder={t('nextNotePlaceholder')} />
            </Field>
          </div>
        )}
        {error && (
          <p role="alert" className="type-body-sm text-overdue">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {lead.fromReseller && canKeepFromReseller ? (
            <Checkbox
              checked={staffOnly}
              onCheckedChange={setStaffOnly}
              label={t('staffOnly')}
              description={t('staffOnlyHint')}
            />
          ) : (
            <span />
          )}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            pending={busy || log.isPending || update.isPending}
          >
            {t('submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
