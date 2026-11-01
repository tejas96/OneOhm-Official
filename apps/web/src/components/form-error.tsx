import { CircleAlert } from 'lucide-react';

/** The server's sentence for a whole form, shown above its actions. */
export function FormError({ message }: { readonly message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-overdue-tint px-3 py-2.5 type-body-sm text-overdue"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
