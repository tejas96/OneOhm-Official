'use client';

import { Field, Input } from '@oneohm/design-system/web';
import { normaliseReferralCode } from '@oneohm/domain';
import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';

/**
 * A customer's referral code for a new lead (PRD 5.6). Checked when the person leaves
 * the field, so the referrer's name shows before the lead is saved.
 */
export function ReferralCodeField({ error }: { readonly error?: string | undefined }) {
  const t = useTranslations('leads.create');
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState('');
  const owner = useQuery({
    queryKey: ['referral-code', checked],
    queryFn: () => expectStatus(api.referrals.lookupCode({ params: { code: checked } }), 200),
    enabled: checked.length >= 6,
    retry: false,
    staleTime: 60_000,
  });
  const unknown = owner.error instanceof ApiError && owner.error.status === 404;
  const hint = owner.data
    ? t('referredBy', { name: owner.data.name })
    : unknown
      ? null
      : t('referralCodeHint');
  return (
    <Field
      label={t('referralCode')}
      hint={hint}
      error={error ?? (unknown ? t('referralCodeUnknown') : undefined)}
    >
      <Input
        name="referralCode"
        value={code}
        autoComplete="off"
        className="font-mono uppercase"
        leading={owner.data ? <Gift aria-hidden className="size-4 text-accent" /> : undefined}
        onChange={(event) => setCode(event.target.value)}
        onBlur={() => setChecked(normaliseReferralCode(code))}
      />
    </Field>
  );
}
