import { geotagFields } from './geotag-fields';
import { paperKeys } from './paper-keys';
import type { QueuedUpload } from './queue-logic';

/** A video on a weak signal can take minutes; everything else keeps the usual limit. */
const VIDEO_TIMEOUT_MS = 10 * 60_000;

/**
 * Where a queued file goes and with which form fields: a service visit's own route, or
 * the documents route for a task, a lead, or a customer and site.
 */
export function uploadRequestOf(item: QueuedUpload, baseUrl: string) {
  const root = `${baseUrl.replace(/\/+$/, '')}/v1`;
  const timeoutMs = item.kind === 'video' ? VIDEO_TIMEOUT_MS : undefined;
  if (item.serviceRequestId) {
    return {
      url: `${root}/service-visits/${item.serviceRequestId}/files`,
      fields: { name: item.name, ...geotagFields(item.geotag) },
      timeoutMs,
    };
  }
  return {
    url: `${root}/documents`,
    fields: {
      category: item.category,
      taskId: item.taskId,
      leadId: item.leadId,
      customerId: item.customerId,
      propertyId: item.propertyId,
      name: item.name,
      ...geotagFields(item.geotag),
    },
    timeoutMs,
  };
}

/** The queries to refresh once a file has arrived. */
export function refreshedBy(item: QueuedUpload): readonly (readonly string[])[] {
  if (item.serviceRequestId) return [['site', 'service']];
  if (item.leadId) return [paperKeys.lead(item.leadId)];
  if (!item.taskId) return [paperKeys.customer(item.customerId ?? '')];
  return [
    ['tasks', 'one', item.taskId ?? ''],
    ['tasks', 'mine'],
  ];
}
