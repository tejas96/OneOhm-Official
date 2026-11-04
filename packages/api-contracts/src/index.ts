import { commonErrorResponses } from './common/errors';

export * from './common/errors';
export * from './common/gst-rate';
export * from './common/paging';
export * from './common/primitives';
export * from './contracts';
export * from './schemas';

/** Shared router options: everything under /v1, with the common error answers. */
export const apiContractOptions = {
  pathPrefix: '/v1',
  strictStatusCodes: true,
  commonResponses: commonErrorResponses,
} as const;
