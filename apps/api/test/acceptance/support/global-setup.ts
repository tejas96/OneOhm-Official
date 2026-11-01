import { Session } from './http';
import { ensureTeam } from './team';

/** Runs once before the scenarios: the standing team every scenario relies on. */
export default async function setup(): Promise<void> {
  const admin = await Session.admin();
  await ensureTeam(admin);
}
