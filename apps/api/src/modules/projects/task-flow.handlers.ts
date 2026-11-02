import type { TaskPriority } from '@oneohm/domain';
import type { Actor } from '../../common/auth/actor';
import type { TaskFlowService } from './task-flow.service';

/** Route handlers for the task-flow routes, spread into the tasks controller. */
export function taskFlowHandlers(flow: TaskFlowService, actor: Actor) {
  return {
    setTaskPriority: async ({
      params,
      body,
    }: {
      params: { id: string };
      body: { priority: TaskPriority };
    }) => ({
      status: 200 as const,
      body: await flow.setPriority(actor, params.id, body.priority),
    }),
    rescheduleTask: async ({ params, body }: { params: { id: string }; body: RescheduleBody }) => ({
      status: 200 as const,
      body: await flow.reschedule(actor, params.id, body),
    }),
    returnTask: async ({ params, body }: { params: { id: string }; body: { reason: string } }) => ({
      status: 200 as const,
      body: await flow.sendBack(actor, params.id, body.reason),
    }),
    postTaskUpdate: async ({
      params,
      body,
    }: {
      params: { id: string };
      body: { note: string };
    }) => ({
      status: 200 as const,
      body: await flow.postUpdate(actor, params.id, body.note),
    }),
    tickChecklist: async ({
      params,
      body,
    }: {
      params: { id: string };
      body: { key: string; done: boolean };
    }) => ({
      status: 200 as const,
      body: await flow.tick(actor, params.id, body.key, body.done),
    }),
    taskActivity: async ({ params }: { params: { id: string } }) => ({
      status: 200 as const,
      body: await flow.activity(actor, params.id),
    }),
  };
}

interface RescheduleBody {
  readonly dueDate: string;
  readonly reason: string;
}
