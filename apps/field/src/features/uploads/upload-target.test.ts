import { describe, expect, it } from 'vitest';
import { parseQueue, type QueuedUpload, screenOf } from './queue-logic';
import { refreshedBy, uploadRequestOf } from './upload-target';

const base: QueuedUpload = {
  id: 'up-1',
  userId: 'sunil',
  kind: 'voice',
  category: 'voice_note',
  name: 'Voice note 1 Nov.m4a',
  type: 'audio/mp4',
  uri: 'file:///documents/pending-evidence/up-1.m4a',
  geotag: null,
  attempts: 0,
  error: null,
  autoRetry: false,
  retryAt: null,
  createdAt: 1_800_000_000_000,
};
const onService = { ...base, serviceRequestId: 'req-1' };
const onTask = { ...base, taskId: 'task-1' };

describe('service visit uploads', () => {
  it('goes to the visit route without a category, or to documents for a task', () => {
    const service = uploadRequestOf(onService, 'http://api.test/');
    expect(service.url).toBe('http://api.test/v1/service-visits/req-1/files');
    expect(service.fields).toEqual({ name: 'Voice note 1 Nov.m4a' });
    const task = uploadRequestOf(onTask, 'http://api.test');
    expect(task.url).toBe('http://api.test/v1/documents');
    expect(task.fields).toMatchObject({ category: 'voice_note', taskId: 'task-1' });
  });

  it('gives videos longer to upload on a weak signal', () => {
    expect(uploadRequestOf({ ...onTask, kind: 'video' }, 'x').timeoutMs).toBe(600_000);
    expect(uploadRequestOf(onTask, 'x').timeoutMs).toBeUndefined();
  });

  it('refreshes and opens the screen the file belongs to', () => {
    expect(refreshedBy(onService)).toEqual([['site', 'service']]);
    expect(refreshedBy(onTask)).toEqual([
      ['tasks', 'one', 'task-1'],
      ['tasks', 'mine'],
    ]);
    expect(screenOf(onService)).toBe('/service/req-1');
    expect(screenOf(onTask)).toBe('/tasks/task-1');
  });

  it('sends a lead’s or a customer’s paper to documents with its links', () => {
    const paper = { ...base, kind: 'document' as const, category: 'electricity_bill' };
    const lead = { ...paper, leadId: 'lead-1', customerId: 'cust-1', propertyId: 'site-1' };
    const request = uploadRequestOf(lead, 'http://api.test');
    expect(request.url).toBe('http://api.test/v1/documents');
    expect(request.fields).toMatchObject({
      category: 'electricity_bill',
      leadId: 'lead-1',
      customerId: 'cust-1',
      propertyId: 'site-1',
    });
    expect(request.fields).not.toHaveProperty('taskId', expect.anything());
    expect(refreshedBy(lead)).toEqual([['documents', 'lead', 'lead-1']]);
    expect(refreshedBy({ ...paper, customerId: 'cust-1' })).toEqual([
      ['documents', 'customer', 'cust-1'],
    ]);
  });

  it('keeps saved voice notes and videos, and drops a file with nowhere to go', () => {
    const saved = parseQueue([onService, { ...onTask, kind: 'video', type: 'video/mp4' }, base]);
    expect(saved.map((item) => item.kind)).toEqual(['voice', 'video']);
    expect(saved[0]?.serviceRequestId).toBe('req-1');
  });
});
