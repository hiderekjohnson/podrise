import { z } from 'zod';
import { insertSubscriptionSchema, subscriptions } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  subscriptions: {
    create: {
      method: 'POST' as const,
      path: '/api/subscriptions' as const,
      input: insertSubscriptionSchema,
      responses: {
        201: z.custom<typeof subscriptions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type SubscriptionInput = z.infer<typeof api.subscriptions.create.input>;
export type SubscriptionResponse = z.infer<typeof api.subscriptions.create.responses[201]>;
