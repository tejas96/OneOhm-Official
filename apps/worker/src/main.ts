import { createDatabaseConnection } from '@oneohm/database';
import { Client, Connection } from '@temporalio/client';
import { NativeConnection, Runtime, Worker } from '@temporalio/worker';
import { createActivities } from './activities';
import { createPushSender } from './channels/expo-push';
import { createSmsSender } from './channels/sms';
import { createWhatsAppSender } from './channels/whatsapp-cloud';
import { loadConfig } from './config';
import { OutboxRelay } from './relay/outbox-relay';
import { ensureDailyOperationsSchedule } from './schedules/daily-operations.schedule';
import { ensureServiceSlaSchedule } from './schedules/service-sla.schedule';
import { workflowSource } from './workflow-source';

/**
 * OneOhm background worker: the Temporal worker (message delivery with retries, the
 * daily reminders schedule) plus the outbox relay.
 *
 *   node --env-file=../../.env dist/main.js
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const log = (line: string) => console.info(`${new Date().toISOString()} ${line}`);
  Runtime.install({ shutdownSignals: [] });

  const database = createDatabaseConnection(config.DATABASE_URL, { max: 5 });
  const sender = createWhatsAppSender(config, log);
  const nativeConnection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection: nativeConnection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    activities: createActivities({
      db: database.db,
      sender,
      push: createPushSender(config, log),
      sms: createSmsSender(config, log),
      language: config.WHATSAPP_TEMPLATE_LANGUAGE,
      timeZone: config.BUSINESS_TIMEZONE,
    }),
    ...workflowSource(config.NODE_ENV),
  });

  const clientConnection = await Connection.connect({ address: config.TEMPORAL_ADDRESS });
  const client = new Client({ connection: clientConnection, namespace: config.TEMPORAL_NAMESPACE });
  await ensureDailyOperationsSchedule(client, {
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    timeZone: config.BUSINESS_TIMEZONE,
  });
  await ensureServiceSlaSchedule(client, {
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    timeZone: config.BUSINESS_TIMEZONE,
  });
  const relay = new OutboxRelay(
    database.db,
    client,
    config.TEMPORAL_TASK_QUEUE,
    config.OUTBOX_POLL_MS,
    log,
  );
  relay.start();
  log(
    `[worker] running · WhatsApp delivery: ${config.WHATSAPP_DELIVERY} · push: ${config.PUSH_DELIVERY}`,
  );

  let stopping = false;
  const shutdown = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    log(`[worker] stopping (${reason})`);
    await relay.stop();
    worker.shutdown();
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void shutdown(signal));
  }
  try {
    await worker.run();
  } finally {
    await relay.stop();
    await clientConnection.close();
    await nativeConnection.close();
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error('Worker failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
