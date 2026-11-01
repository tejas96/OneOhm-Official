import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/api/server-session';

/** Owners land on the command centre; everyone else on their day. */
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  redirect(user.capabilities.includes('dashboard.view_business') ? '/command-center' : '/today');
}
