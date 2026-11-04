'use client';

import { ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { formatPhone } from '@/lib/format/contact';
import { toIndianMobile } from './mobile-number';
import { CodeStep, PasswordStep, PhoneStep } from './set-password-steps';
import { useSecondsSince } from './use-seconds-since';

type Step = 'phone' | 'code' | 'password';

/** Another code may be asked for this long after the last one. */
const RESEND_AFTER_SECONDS = 30;
/** With no code by now, the account may have no number on file. */
const NO_PHONE_HINT_AFTER_SECONDS = 60;

/**
 * First sign-in and forgot password, one step at a time: the mobile number, the texted
 * code, then the new password. Saving signs them in and takes them home.
 */
export function SetPasswordForm() {
  const t = useTranslations('signIn.setPassword');
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [firstSentAt, setFirstSentAt] = useState<number | null>(null);
  const [pending, setPending] = useState<'send' | 'resend' | 'save' | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sinceSent = useSecondsSince(sentAt);
  const sinceFirstSent = useSecondsSince(firstSentAt);
  const mobile = toIndianMobile(phone);

  const go = (next: Step) => {
    setFieldError(null);
    setError(null);
    setStep(next);
  };

  const failed = (caught: unknown, field: string) => {
    if (caught instanceof ApiError && caught.fieldErrors[field]) {
      setFieldError(caught.fieldErrors[field] ?? null);
    } else {
      setError(describeError(caught));
    }
  };

  const sendCode = async (again: boolean) => {
    if (!mobile) {
      setFieldError(t('phone.invalid'));
      return;
    }
    setPending(again ? 'resend' : 'send');
    setFieldError(null);
    setError(null);
    try {
      await expectStatus(api.auth.requestPasswordCode({ body: { phone: mobile } }), 202);
      const now = Date.now();
      setSentAt(now);
      if (!again) {
        setFirstSentAt(now);
        setCode('');
        setStep('code');
      }
    } catch (caught) {
      failed(caught, 'phone');
    } finally {
      setPending(null);
    }
  };

  const checkCode = () => {
    if (code.length !== 6) {
      setFieldError(t('code.invalid'));
      return;
    }
    go('password');
  };

  const save = async () => {
    if (!mobile) return;
    if (password.length < 8) {
      setFieldError(t('password.tooShort'));
      return;
    }
    setPending('save');
    setFieldError(null);
    setError(null);
    try {
      await expectStatus(api.auth.setPassword({ body: { phone: mobile, code, password } }), 200);
      router.replace('/');
      router.refresh();
    } catch (caught) {
      setPending(null);
      // A wrong or expired code is fixed on the code step; the password they chose is kept.
      if (caught instanceof ApiError && (caught.code === 'bad_code' || caught.fieldErrors.code)) {
        setCode('');
        setStep('code');
        setFieldError(caught.fieldErrors.code ?? caught.message);
        return;
      }
      failed(caught, 'password');
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <Link
        href="/sign-in"
        className="-ml-1 flex items-center gap-1.5 self-start rounded-md px-1 py-1 type-body-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {step === 'phone' && (
            <PhoneStep
              phone={phone}
              onPhone={setPhone}
              error={fieldError}
              pending={pending === 'send'}
              onSubmit={() => void sendCode(false)}
            />
          )}
          {step === 'code' && (
            <CodeStep
              phoneLabel={mobile ? formatPhone(mobile) : phone}
              code={code}
              onCode={setCode}
              error={fieldError}
              pending={false}
              onSubmit={checkCode}
              resendIn={Math.max(0, RESEND_AFTER_SECONDS - sinceSent)}
              resending={pending === 'resend'}
              onResend={() => void sendCode(true)}
              onChangeNumber={() => {
                setSentAt(null);
                setFirstSentAt(null);
                go('phone');
              }}
              showNoPhone={sinceFirstSent >= NO_PHONE_HINT_AFTER_SECONDS}
            />
          )}
          {step === 'password' && (
            <PasswordStep
              username={mobile ?? phone}
              password={password}
              onPassword={setPassword}
              error={fieldError}
              pending={pending === 'save'}
              onSubmit={() => void save()}
            />
          )}
        </motion.div>
      </AnimatePresence>
      <FormError message={error} />
    </div>
  );
}
