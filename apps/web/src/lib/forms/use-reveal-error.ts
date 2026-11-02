'use client';

import { type RefObject, useEffect } from 'react';

/**
 * After a failed save, brings the problem into view: the first field marked invalid
 * (focused, so typing fixes it), else the form's alert. In a long dialog the person is
 * often scrolled to the button, far from the message.
 */
export function useRevealError(form: RefObject<HTMLFormElement | null>, error: unknown): void {
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      const root = form.current;
      if (!root) return;
      const field = root.querySelector<HTMLElement>('[aria-invalid="true"]');
      const target = field ?? root.querySelector<HTMLElement>('[role="alert"]');
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [form, error]);
}
