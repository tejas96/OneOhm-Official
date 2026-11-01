'use client';

import { Card, CardHeader } from '@oneohm/design-system/web';
import type { ReactNode } from 'react';
import { NUM } from '../parts/report-body';

export const TABLE = 'px-2 pb-3 max-md:px-4';

export function TableCard({
  title,
  body,
  empty,
  children,
}: {
  readonly title: string;
  readonly body: string;
  readonly empty: string | null;
  readonly children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={body} />
      {empty === null ? children : <p className="px-5 pb-5 type-body-sm text-ink-faint">{empty}</p>}
    </Card>
  );
}

/** A figure with a small line under it. */
export function Figure({
  value,
  detail,
}: {
  readonly value: ReactNode;
  readonly detail?: ReactNode;
}) {
  return (
    <span className="flex flex-col items-end whitespace-nowrap">
      <span className={`${NUM} text-ink`}>{value}</span>
      {detail && <span className="type-body-sm text-ink-faint">{detail}</span>}
    </span>
  );
}
