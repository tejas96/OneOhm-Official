import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  messageTemplateInputSchema,
  messageTemplateSchema,
  taskTemplateInputSchema,
  taskTemplateSchema,
} from '../schemas/template.schema';

const c = initContract();

/** Task templates with their notification rules, and WhatsApp templates (PRD 3.7, 6.2, 7.2). */
export const templatesContract = c.router({
  messageTemplates: {
    method: 'GET',
    path: '/settings/message-templates',
    responses: { 200: z.array(messageTemplateSchema) },
  },
  updateMessageTemplate: {
    method: 'PUT',
    path: '/settings/message-templates/:key',
    pathParams: z.object({ key: z.string() }),
    body: messageTemplateInputSchema,
    responses: { 200: messageTemplateSchema },
  },
  taskTemplates: {
    method: 'GET',
    path: '/settings/task-templates',
    responses: { 200: z.array(taskTemplateSchema) },
  },
  createTaskTemplate: {
    method: 'POST',
    path: '/settings/task-templates',
    body: taskTemplateInputSchema,
    responses: { 201: taskTemplateSchema },
  },
  updateTaskTemplate: {
    method: 'PUT',
    path: '/settings/task-templates/:id',
    pathParams: z.object({ id: idSchema }),
    body: taskTemplateInputSchema.omit({ key: true }),
    responses: { 200: taskTemplateSchema },
    summary: 'Changes apply to projects created from now on; open projects keep their tasks.',
  },
  moveTaskTemplate: {
    method: 'POST',
    path: '/settings/task-templates/:id/move',
    pathParams: z.object({ id: idSchema }),
    body: z.object({ direction: z.enum(['up', 'down']) }),
    responses: { 200: z.array(taskTemplateSchema) },
  },
});
