'use client';

import { useCallback, useState } from 'react';
import { ApiError, describeError } from '@/lib/api/api-error';

export interface ApiFormState {
  readonly pending: boolean;
  /** The server's sentence for the whole form, or null. */
  readonly error: string | null;
  /** Messages keyed by field path (`dcCable.price`), as the API sends them. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** Runs a save; resolves to its result, or undefined when it failed (errors are shown). */
  readonly run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
  readonly reset: () => void;
}

/** Pending, form error and field errors for one form that saves through the API. */
export function useApiForm(): ApiFormState {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      return await action();
    } catch (caught) {
      setError(describeError(caught));
      if (caught instanceof ApiError) setFieldErrors({ ...caught.fieldErrors });
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  return { pending, error, fieldErrors, run, reset };
}
