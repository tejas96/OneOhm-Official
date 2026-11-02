import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { describeError, fieldErrorsOf } from '../api/api-error';
import { Button } from '../components/button';
import { Field, Input } from '../components/field';
import { Text } from '../components/text';
import { useTheme } from '../theme/theme';
import { CodeBoxes } from './code-boxes';

export interface OtpSignInCopy {
  readonly title: string;
  readonly description: string;
  readonly phoneLabel: string;
  readonly phoneHint: string;
  /** Shown when the number is not 10 digits. */
  readonly phoneInvalid: string;
  readonly sendCode: string;
  readonly codeTitle: string;
  /** Receives the number the code went to. */
  readonly codeSentTo: (phone: string) => string;
  readonly codeLabel: string;
  readonly verify: string;
  readonly changeNumber: string;
  readonly resend: string;
  readonly resendIn: (seconds: number) => string;
}

export interface OtpSignInProps {
  readonly copy: OtpSignInCopy;
  /** Sends the code; resolves when the API accepted the request. */
  readonly requestCode: (phone: string) => Promise<void>;
  /** Checks the code and stores the session; the app navigates on success. */
  readonly verifyCode: (phone: string, code: string) => Promise<void>;
}

const RESEND_SECONDS = 30;

/** Phone number, then a 6-digit code. Shared by the field and customer apps. */
export function OtpSignIn({ copy, requestCode, verifyCode }: OtpSignInProps) {
  const theme = useTheme();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  // A ref, not state: the return key and the last code box can fire before a re-render.
  const busy = useRef(false);
  const run = async (job: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    setFieldError(undefined);
    try {
      await job();
    } catch (caught) {
      const fields = fieldErrorsOf(caught);
      const message = fields.phone ?? fields.code;
      if (message) setFieldError(message);
      else setError(describeError(caught));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const digits = phone.replace(/\D/g, '').slice(-10);
  const phoneReady = digits.length === 10;

  const send = () => {
    if (!phoneReady) {
      setFieldError(copy.phoneInvalid);
      return;
    }
    return run(async () => {
      await requestCode(phone);
      setStep('code');
      setCode('');
      setWait(RESEND_SECONDS);
    });
  };
  const verify = (value = code) => run(() => verifyCode(phone, value));

  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <Text variant="displayMd">{step === 'phone' ? copy.title : copy.codeTitle}</Text>
        <Text variant="body" tone="secondary">
          {step === 'phone'
            ? copy.description
            : copy.codeSentTo(`+91 ${phone.replace(/\D/g, '').slice(-10)}`)}
        </Text>
      </View>
      {step === 'phone' ? (
        <Field label={copy.phoneLabel} hint={copy.phoneHint} error={fieldError}>
          <Input
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={16}
            invalid={Boolean(fieldError)}
            onSubmitEditing={send}
            leading={
              <Text variant="titleMd" tone="secondary">
                +91
              </Text>
            }
            accessibilityLabel={copy.phoneLabel}
          />
        </Field>
      ) : (
        <Field label={copy.codeLabel} error={fieldError}>
          <CodeBoxes
            value={code}
            onChange={setCode}
            label={copy.codeLabel}
            invalid={Boolean(fieldError)}
            onFilled={(filled) => void verify(filled)}
          />
        </Field>
      )}
      {error ? (
        <View
          style={[styles.alert, { backgroundColor: theme.status.overdue.tint }]}
          accessibilityRole="alert"
        >
          <Text variant="bodySm" color={theme.status.overdue.fg}>
            {error}
          </Text>
        </View>
      ) : null}
      {step === 'phone' ? (
        <Button label={copy.sendCode} size="lg" pending={pending} onPress={send} fullWidth />
      ) : (
        <View style={styles.actions}>
          <Button
            label={copy.verify}
            size="lg"
            pending={pending}
            disabled={code.length !== 6}
            onPress={() => void verify()}
            fullWidth
          />
          <View style={styles.row}>
            <Button
              label={copy.changeNumber}
              variant="quiet"
              size="sm"
              disabled={pending}
              onPress={() => {
                setFieldError(undefined);
                setError(null);
                setStep('phone');
              }}
            />
            <Button
              label={wait > 0 ? copy.resendIn(wait) : copy.resend}
              variant="quiet"
              size="sm"
              disabled={wait > 0 || pending}
              onPress={send}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 20 },
  heading: { gap: 6 },
  alert: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  actions: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
