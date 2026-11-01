import { redirect } from 'next/navigation';

/** Reports open on Sales, keeping any filters in the address. */
export default async function ReportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const search = params.toString();
  redirect(search ? `/reports/sales?${search}` : '/reports/sales');
}
