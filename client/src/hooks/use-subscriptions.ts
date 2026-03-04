import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useCreateSubscription() {
  return useMutation({
    mutationFn: async (data: typeof api.subscriptions.create.input._type) => {
      const validated = api.subscriptions.create.input.parse(data);
      
      const res = await fetch(api.subscriptions.create.path, {
        method: api.subscriptions.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.subscriptions.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error('Failed to create subscription');
      }

      return api.subscriptions.create.responses[201].parse(await res.json());
    },
  });
}
