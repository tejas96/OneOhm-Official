'use client';

import { Button, cn, Field, IconButton, Input } from '@oneohm/design-system/web';
import { ArrowRight, Eye, EyeOff, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { codeDigits } from './mobile-number';

const STEPS = [1, 2, 3] as const;

function StepHeader({
  step,
  title,
  children,
}: {
  readonly step: 1 | 2 | 3;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const t = useTranslations('signIn.setPassword');
  return (
    <header className="flex flex-col gap-2">
      <div className="mb-1 flex items-center gap-3">
        <span aria-hidden className="flex gap-1">
          {STEPS.map((each) => (
            <span
              key={each}
              className={cn(
                'h-1 w-6 rounded-full transition-colors',
                each <= step ? 'bg-accent' : 'bg-rule',
              )}
            />
          ))}
        </span>
        <span className="type-label text-ink-faint">{t('step', { step })}</span>
      </div>
      <h2 className="type-display-lg text-ink">{title}</h2>
      <div className="type-body text-ink-muted">{children}</div>
    </header>
  );
}

const submitWith = (action: () => void) => (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  action();
};

interface StepProps {
  readonly error: string | null;
  readonly pending: boolean;
  readonly onSubmit: () => void;
}

export function PhoneStep({
  phone,
  onPhone,
  error,
  pending,
  onSubmit,
}: StepProps & { readonly phone: string; readonly onPhone: (phone: string) => void }) {
  const t = useTranslations('signIn.setPassword.phone');
  return (
    <form className="flex flex-col gap-8" onSubmit={submitWith(onSubmit)} noValidate>
      <StepHeader step={1} title={t('title')}>
        {t('description')}
      </StepHeader>
      <div className="flex flex-col gap-5">
        <Field label={t('label')} error={error}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            autoFocus
            value={phone}
            onChange={(event) => onPhone(event.target.value)}
            placeholder={t('placeholder')}
            leading={<Smartphone />}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          pending={pending}
          trailingIcon={<ArrowRight />}
        >
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}

export function CodeStep({
  phoneLabel,
  code,
  onCode,
  error,
  pending,
  onSubmit,
  resendIn,
  resending,
  onResend,
  onChangeNumber,
  showNoPhone,
}: StepProps & {
  readonly phoneLabel: string;
  readonly code: string;
  readonly onCode: (code: string) => void;
  /** Seconds before another code may be asked for; 0 when it may be now. */
  readonly resendIn: number;
  readonly resending: boolean;
  readonly onResend: () => void;
  readonly onChangeNumber: () => void;
  /** After a minute with no code: old email-only accounts have no number to text. */
  readonly showNoPhone: boolean;
}) {
  const t = useTranslations('signIn.setPassword.code');
  return (
    <form className="flex flex-col gap-8" onSubmit={submitWith(onSubmit)} noValidate>
      <StepHeader step={2} title={t('title')}>
        <p>{t('sent')}</p>
        <p className="mt-1 flex items-center gap-2 type-body-sm">
          <span className="font-mono text-ink">{phoneLabel}</span>
          <button
            type="button"
            onClick={onChangeNumber}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {t('change')}
          </button>
        </p>
      </StepHeader>
      <div className="flex flex-col gap-5">
        <Field label={t('label')} error={error}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(event) => onCode(codeDigits(event.target.value))}
            placeholder="••••••"
            className="text-center font-mono text-xl tracking-[0.5em]"
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          pending={pending}
          trailingIcon={<ArrowRight />}
        >
          {t('submit')}
        </Button>
        <div
          className="flex min-h-11 flex-col items-center justify-center gap-1"
          aria-live="polite"
        >
          {resendIn > 0 ? (
            <p className="type-body-sm text-ink-faint tabular-nums">
              {t('resendIn', { seconds: resendIn })}
            </p>
          ) : (
            <Button variant="quiet" size="sm" pending={resending} onClick={onResend}>
              {t('resend')}
            </Button>
          )}
          {showNoPhone && (
            <p className="text-center type-body-sm text-ink-faint">
              <span className="font-medium text-ink-muted">{t('noCode')}</span> {t('noPhone')}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

export function PasswordStep({
  username,
  password,
  onPassword,
  error,
  pending,
  onSubmit,
}: StepProps & {
  /** Their number, so a password manager files the new password under it. */
  readonly username: string;
  readonly password: string;
  readonly onPassword: (password: string) => void;
}) {
  const t = useTranslations('signIn.setPassword.password');
  const [shown, setShown] = useState(false);
  return (
    <form className="flex flex-col gap-8" onSubmit={submitWith(onSubmit)} noValidate>
      <StepHeader step={3} title={t('title')}>
        {t('description')}
      </StepHeader>
      <div className="flex flex-col gap-5">
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={username}
          readOnly
          tabIndex={-1}
          aria-hidden
          className="sr-only"
        />
        <Field label={t('label')} hint={t('hint')} error={error}>
          <Input
            name="password"
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(event) => onPassword(event.target.value)}
            trailing={
              <IconButton
                size="sm"
                label={shown ? t('hide') : t('show')}
                onClick={() => setShown((now) => !now)}
              >
                {shown ? <EyeOff /> : <Eye />}
              </IconButton>
            }
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          pending={pending}
          trailingIcon={<ArrowRight />}
        >
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}
