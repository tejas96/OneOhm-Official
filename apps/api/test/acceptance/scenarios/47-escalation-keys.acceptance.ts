import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { STAFF } from '../support/team';

// Alert keys now name their recipient; migration 0065 carries the old keys over.
describe('Escalation alert keys', () => {
  afterAll(closeDb);

  it('existing alert keys are carried over to the new format', async () => {
    const task = '11111111-1111-4111-8111-111111111111';
    const admin = await Session.admin();
    const [manager] = await rows<{ id: string }>('SELECT id FROM users WHERE phone_e164 = $1', [
      STAFF.execution.phone,
    ]);
    const manager1 = manager?.id ?? '';
    const holder = admin.userId;
    const old = [
      [manager1, `escalate:${task}:manager`],
      [manager1, `stuck:${task}:2026-01-02`],
      [manager1, `leave-block:${task}:2026-02-01`],
      [holder, `escalate:${task}:manager:${holder}`],
      [holder, `stuck:${task}:2026-01-02:${holder}`],
      [holder, `leave-block:${task}:2026-02-01:${holder}`],
      [holder, `escalate:${task}:owners:${holder}`],
    ] as const;
    for (const [userId, key] of old)
      await rows(
        "INSERT INTO notifications (user_id, kind, title, body, dedupe_key) VALUES ($1, 'task_late', 't', 'b', $2)",
        [userId, key],
      );
    const file = join(
      process.cwd(),
      '../../../../packages/database/migrations/0065_escalation_key_recipient.sql',
    );
    for (const statement of readFileSync(file, 'utf8').split('--> statement-breakpoint'))
      await rows(statement);
    const keys = (
      await rows<{ dedupe_key: string }>(
        'SELECT dedupe_key FROM notifications WHERE dedupe_key LIKE $1 ORDER BY dedupe_key',
        [`%${task}%`],
      )
    ).map((row) => row.dedupe_key);
    expect(keys).toEqual(
      [
        `escalate:${task}:manager:${manager1}`,
        `stuck:${task}:2026-01-02:${manager1}`,
        `leave-block:${task}:2026-02-01:${manager1}`,
        `escalate:${task}:manager:holders:${holder}`,
        `stuck:${task}:2026-01-02:holders:${holder}`,
        `leave-block:${task}:2026-02-01:holders:${holder}`,
        `escalate:${task}:owners:${holder}`,
      ].sort(),
    );
  });
});
