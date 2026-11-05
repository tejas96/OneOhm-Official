'use client';

import { cn, Input } from '@oneohm/design-system/web';
import { Search } from 'lucide-react';

/** The search box the service screens share; its words live in `?q=` (useSearchParam). */
export function ServiceSearch({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly placeholder: string;
  readonly className?: string;
}) {
  return (
    <div className={cn('min-w-0 flex-1 lg:max-w-sm', className)}>
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        leading={<Search aria-hidden />}
      />
    </div>
  );
}
