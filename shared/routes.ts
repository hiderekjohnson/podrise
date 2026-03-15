import { z } from 'zod';
import { insertUserSchema, quickSubscribeSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

const userResponseSchema = z.object({
  id: z.number(),
  email: z.string(),
  podcasts: z.array(z.string()),
  industries: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  topicFrequencies: z.record(z.string(), z.string()).nullable().optional(),
  deliveryTime: z.string(),
  deliveryTimezone: z.string(),
  plan: z.string().optional(),
  stripeCustomerId: z.string().nullable().optional(),
  stripeSubscriptionId: z.string().nullable().optional(),
  vacationUntil: z.string().nullable().optional(),
  emailVerified: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
  createdAt: z.string().nullable(),
});

export const api = {
  auth: {
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: {
        200: userResponseSchema,
        401: errorSchemas.unauthorized,
      },
    },
    register: {
      method: 'POST' as const,
      path: '/api/auth/register' as const,
      input: insertUserSchema,
      responses: {
        201: userResponseSchema,
        400: errorSchemas.validation,
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/auth/login' as const,
      input: z.object({ email: z.string().email() }),
      responses: {
        200: userResponseSchema,
        404: errorSchemas.notFound,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
  users: {
    update: {
      method: 'POST' as const,
      path: '/api/users/update' as const,
      input: z.object({
        email: z.string().email().optional(),
        podcasts: z.array(z.string()).min(1, "Select at least one podcast").optional(),
        industries: z.array(z.string()).optional(),
        interests: z.array(z.string()).optional(),
        roles: z.array(z.string()).optional(),
        topicFrequencies: z.record(z.string(), z.enum(["daily", "weekly"])).optional(),
        deliveryTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        deliveryTimezone: z.string().optional(),
        vacationUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format").nullable().optional(),
      }),
      responses: {
        200: userResponseSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  subscriptions: {
    quickSubscribe: {
      method: 'POST' as const,
      path: '/api/subscriptions/quick-subscribe' as const,
      input: quickSubscribeSchema,
      responses: {
        200: z.object({ message: z.string(), user: userResponseSchema, isNew: z.boolean() }),
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

export type UserResponse = z.infer<typeof userResponseSchema>;
