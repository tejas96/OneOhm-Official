'use client';

import {
  Button,
  Dialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import {
  LEAD_SOURCES,
  type LeadSource,
  SUBSIDY_CATEGORIES,
  type SubsidyCategory,
} from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { LeadCreateAlert } from './lead-create-alert';
import { leadProblems } from './lead-create-checks';
import { kwToWp, leadKeys } from './lead-labels';
import { PhoneMatchNotice } from './phone-match-notice';
import { ReferralCodeField } from './referral-code-field';
import { useLeadOwnerOptions } from './use-lead-owners';

const ME = 'me';

/** New lead: who, how to reach them, and when to follow up. Duplicates are caught by phone. */
export function LeadCreateDialog({
  open,
  onOpenChange,
  initial,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Starting values, e.g. from a WhatsApp chat with an unknown number. */
  readonly initial?: { readonly name: string; readonly phone: string; readonly source: LeadSource };
}) {
  const t = useTranslations('leads.create');
  const sourceT = useTranslations('leads.source');
  const categoryT = useTranslations('leads.category');
  const checkT = useTranslations('checks');
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canAssign = useCan('people.view', 'people.manage', 'tasks.assign', 'projects.manage');
  const [source, setSource] = useState<LeadSource>(initial?.source ?? 'manual');
  const [phone, setPhone] = useState(initial?.phone.replace(/^\+91/, '') ?? '');
  const [category, setCategory] = useState<SubsidyCategory>('individual');
  const [owner, setOwner] = useState<string>(ME);
  const [error, setError] = useState<ApiError | null>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const owners = useLeadOwnerOptions(open && canAssign);
  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.crm.createLead>[0]['body']) =>
      expectStatus(api.crm.createLead({ body }), 201),
    onSuccess: async (lead) => {
      await queryClient.invalidateQueries({ queryKey: leadKeys.all });
      toast({ tone: 'success', title: t('created', { name: lead.name }) });
      setPhone('');
      onOpenChange(false);
      router.push(`/leads/${lead.id}`);
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught : new ApiError(0, describeError(caught), undefined, {}),
      ),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    if (create.isPending) return;
    setError(null);
    const estimatedWp = kwToWp(text('estimatedKw'));
    const found = leadProblems({
      name: text('name'),
      phone,
      city: text('city'),
      nextActionOn: text('nextActionOn'),
      nextActionTime: text('nextActionTime'),
      badKw: Boolean(text('estimatedKw')) && estimatedWp === null,
    });
    const messages = Object.fromEntries(
      Object.entries(found).map(([field, key]) =>
        key === 'minChars' ? [field, checkT('minChars', { count: 2 })] : [field, checkT(key)],
      ),
    );
    setChecks(messages);
    if (Object.keys(found).length > 0) return;
    create.mutate({
      name: text('name'),
      phone,
      email: text('email') || null,
      city: text('city'),
      source,
      subsidyCategory: category,
      estimatedWp,
      ...(owner === ME ? {} : { ownerUserId: owner }),
      nextActionOn: text('nextActionOn'),
      nextActionTime: text('nextActionTime') || null,
      nextActionNote: text('nextActionNote') || null,
      notes: text('notes') || null,
      referralCode: text('referralCode') || null,
    });
  };

  const fieldError = (name: string) => checks[name] ?? error?.fieldErrors[name];
  const duplicateId = error?.code?.startsWith('duplicate_lead:') ? error.code.slice(15) : null;
  const ownerOptions = [{ value: ME, label: t('ownerMe') }, ...owners];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setChecks({});
        }
        onOpenChange(next);
      }}
      title={t('title')}
      description={t('description')}
      size="lg"
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="lead-create" variant="primary" pending={create.isPending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form
        id="lead-create"
        onSubmit={submit}
        className="grid gap-4 py-1 sm:grid-cols-2"
        noValidate
      >
        {error && <LeadCreateAlert message={error.message} duplicateId={duplicateId} />}
        <Field label={t('name')} required error={fieldError('name')}>
          <Input name="name" autoComplete="name" defaultValue={initial?.name} />
        </Field>
        <Field label={t('phone')} hint={t('phoneHint')} required error={fieldError('phone')}>
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        <PhoneMatchNotice phone={phone} />
        <Field label={t('city')} required error={fieldError('city')}>
          <Input name="city" autoComplete="address-level2" />
        </Field>
        <Field label={t('email')} error={fieldError('email')}>
          <Input name="email" type="email" autoComplete="email" />
        </Field>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="type-label text-ink-muted">{t('category')}</span>
          <SegmentedControl
            label={t('category')}
            size="sm"
            value={category}
            onValueChange={setCategory}
            options={SUBSIDY_CATEGORIES.map((value) => ({ value, label: categoryT(value) }))}
            className="self-start"
          />
          {fieldError('subsidyCategory') && (
            <p className="type-body-sm text-overdue">{fieldError('subsidyCategory')}</p>
          )}
        </div>
        <Field label={t('source')} error={fieldError('source')}>
          <Select
            value={source}
            onValueChange={setSource}
            options={LEAD_SOURCES.map((value) => ({ value, label: sourceT(value) }))}
          />
        </Field>
        <ReferralCodeField error={fieldError('referralCode')} />
        <Field label={t('estimatedKw')} hint={t('estimatedHint')} error={fieldError('estimatedWp')}>
          <Input name="estimatedKw" inputMode="decimal" />
        </Field>
        {canAssign && (
          <Field label={t('owner')} error={fieldError('ownerUserId')}>
            <Select value={owner} onValueChange={setOwner} options={ownerOptions} />
          </Field>
        )}
        <Field label={t('nextActionOn')} required error={fieldError('nextActionOn')}>
          <Input
            name="nextActionOn"
            type="date"
            min={todayIn()}
            defaultValue={addDays(todayIn(), 1)}
          />
        </Field>
        <Field label={t('nextActionTime')} error={fieldError('nextActionTime')}>
          <Input name="nextActionTime" type="time" step={300} />
        </Field>
        <Field label={t('nextActionNote')} error={fieldError('nextActionNote')}>
          <Input name="nextActionNote" placeholder={t('nextActionPlaceholder')} />
        </Field>
        <Field label={t('notes')} className="sm:col-span-2" error={fieldError('notes')}>
          <Textarea name="notes" rows={3} />
        </Field>
      </form>
    </Dialog>
  );
}
