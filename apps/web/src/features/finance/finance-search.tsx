'use client';

import { cn, Input } from '@oneohm/design-system/web';
import { Search } from 'lucide-react';

/** A finance list's search box; the words live in the address (see useSearchParam). */
export function FinanceSearch({
  value,
  onChange,
  label,
  className,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <div className={cn('min-w-0 flex-1 lg:max-w-sm', className)}>
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
        leading={<Search aria-hidden />}
      />
    </div>
  );
}

/**
 * Codes as written and without their dashes or slashes, as the server also matches them
 * ("ohinv2026" finds OH/INV/2026-27/0001). For the page-side check of a server search.
 */
export function withBareCodes(codes: readonly (string | null | undefined)[]): string[] {
  return codes.flatMap((code) => (code ? [code, code.replace(/[-/]/g, '')] : []));
}
