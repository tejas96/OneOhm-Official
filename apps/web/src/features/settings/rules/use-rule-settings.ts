'use client';

import { useToast } from '@oneohm/design-system/web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { useApiForm } from '@/lib/forms/use-api-form';

export const RULE_KEYS = {
  reminders: ['settings', 'reminders'],
  assignment: ['settings', 'assignment'],
  leadAssignment: ['settings', 'lead-assignment'],
  approvals: ['settings', 'approvals'],
  dashboard: ['settings', 'dashboard'],
  projectTypes: ['settings', 'project-types'],
  jobRuns: ['settings', 'job-runs'],
} as const;

/**
 * One Settings form for a rule set (PRD 7.2): loads the saved values, keeps a draft,
 * says when it differs, saves through the API and shows the server's field errors.
 */
export function useRuleSettings<T>(
  key: readonly string[],
  load: () => Promise<T>,
  save: (draft: T) => Promise<T>,
  reference: string,
) {
  const t = useTranslations('settings');
  const toast = useToast();
  const client = useQueryClient();
  const form = useApiForm();
  const query = useQuery({ queryKey: key, queryFn: load });
  const [draft, setDraft] = useState<T | null>(null);
  useEffect(() => {
    if (query.data && draft === null) setDraft(query.data);
  }, [query.data, draft]);

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(query.data);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    await form.run(
      () => save(draft),
      (saved) => {
        client.setQueryData(key, saved);
        setDraft(saved);
        toast({ title: t('saved'), reference, tone: 'success' });
      },
    );
  };
  const discard = () => {
    if (query.data) setDraft(query.data);
    form.reset();
  };
  const patch = (changes: Partial<T>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));
  return { query, draft, patch, dirty, submit, discard, form };
}
