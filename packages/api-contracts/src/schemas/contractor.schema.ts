import { RATE_BASES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';
import { projectTypeSchema, taskStatusSchema } from './project.schema';

export const rateBasisSchema = z.enum(RATE_BASES);
export const workOrderStatusSchema = z.enum(['open', 'in_progress', 'completed', 'cancelled']);

export const contractorRateSchema = z.object({
  id: idSchema,
  basis: rateBasisSchema,
  taskKey: z.string().nullable(),
  projectType: projectTypeSchema.nullable(),
  label: z.string(),
  amountPaise: paiseSchema,
  active: z.boolean(),
});
export type ContractorRate = z.infer<typeof contractorRateSchema>;

export const contractorMemberSchema = z.object({
  userId: idSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  lead: z.boolean(),
  active: z.boolean(),
});

/** How a contractor performs: delivery, quality and what is still open (PRD 3.13). */
export const contractorPerformanceSchema = z.object({
  completedWorkOrders: z.number().int(),
  openWorkOrders: z.number().int(),
  /** Share of finished tasks completed by their due date; null before any finish. */
  onTimePercent: z.number().int().nullable(),
  reworkCount: z.number().int(),
  openTasks: z.number().int(),
  overdueTasks: z.number().int(),
  pendingPayablePaise: paiseSchema,
  paidPaise: paiseSchema,
});

export const contractorSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: z.enum(['company', 'individual']),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  active: z.boolean(),
  skills: z.array(z.string()),
  serviceAreas: z.array(z.string()),
  memberCount: z.number().int(),
  performance: contractorPerformanceSchema,
});
export type ContractorSummary = z.infer<typeof contractorSummarySchema>;

export const workOrderSummarySchema = z.object({
  id: idSchema,
  number: z.string(),
  status: workOrderStatusSchema,
  contractor: z.object({ id: idSchema, name: z.string() }),
  project: z.object({ id: idSchema, code: z.string(), name: z.string() }),
  dueDate: calendarDateSchema.nullable(),
  overdue: z.boolean(),
  taskCount: z.number().int(),
  tasksDone: z.number().int(),
  grossPaise: paiseSchema,
  netPayablePaise: paiseSchema,
  createdAt: instantSchema,
});
export type WorkOrderSummary = z.infer<typeof workOrderSummarySchema>;

export const contractorDetailSchema = contractorSummarySchema.extend({
  email: z.string().nullable(),
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  address: z.string().nullable(),
  bankAccountName: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  bankIfsc: z.string().nullable(),
  paymentTermsDays: z.number().int(),
  tdsBp: z.number().int(),
  retentionBp: z.number().int(),
  retentionDays: z.number().int(),
  notes: z.string().nullable(),
  members: z.array(contractorMemberSchema),
  rates: z.array(contractorRateSchema),
  workOrders: z.array(workOrderSummarySchema),
});
export type ContractorDetail = z.infer<typeof contractorDetailSchema>;

const payableRefSchema = z.object({
  id: idSchema,
  status: z.enum(['pending', 'approved', 'paid']),
  amountPaise: paiseSchema,
  dueOn: calendarDateSchema,
});

export const workOrderDetailSchema = workOrderSummarySchema.extend({
  scope: z.string().nullable(),
  startedAt: instantSchema.nullable(),
  completedAt: instantSchema.nullable(),
  cancelledReason: z.string().nullable(),
  lines: z.array(
    z.object({
      id: idSchema,
      basis: rateBasisSchema,
      description: z.string(),
      quantityMilli: z.number().int(),
      unitRatePaise: paiseSchema,
      amountPaise: paiseSchema,
      manual: z.boolean(),
    }),
  ),
  tasks: z.array(
    z.object({
      id: idSchema,
      title: z.string(),
      status: taskStatusSchema,
      dueDate: calendarDateSchema,
      overdue: z.boolean(),
      assignee: userRefSchema.nullable(),
      completedAt: instantSchema.nullable(),
    }),
  ),
  rework: z.array(
    z.object({
      id: idSchema,
      taskTitle: z.string().nullable(),
      note: z.string(),
      deductionPaise: paiseSchema,
      createdAt: instantSchema,
    }),
  ),
  advances: z.array(
    z.object({
      id: idSchema,
      amountPaise: paiseSchema,
      note: z.string().nullable(),
      createdAt: instantSchema,
      payableStatus: z.enum(['pending', 'approved', 'paid']),
    }),
  ),
  settlement: z.object({
    grossPaise: paiseSchema,
    reworkDeductionsPaise: paiseSchema,
    retentionPaise: paiseSchema,
    tdsPaise: paiseSchema,
    advancesPaise: paiseSchema,
    netPayablePaise: paiseSchema,
  }),
  payable: payableRefSchema.nullable(),
  retentionPayable: payableRefSchema.nullable(),
});
export type WorkOrderDetail = z.infer<typeof workOrderDetailSchema>;

export const crewCandidateSchema = z.object({
  userId: idSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  roleNames: z.array(z.string()),
  contractorId: idSchema.nullable(),
});
export type CrewCandidate = z.infer<typeof crewCandidateSchema>;
