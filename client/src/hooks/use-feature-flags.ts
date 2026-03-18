import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

interface FeatureFlagsResponse {
  flags: Record<string, boolean>;
}

export function useFeatureFlags() {
  const { data: user, isLoading: authLoading } = useAuth();

  const { data, isLoading } = useQuery<FeatureFlagsResponse>({
    queryKey: ["/api/feature-flags", user?.id ?? "anon"],
    queryFn: async () => {
      const res = await fetch("/api/feature-flags", { credentials: "include" });
      if (!res.ok) return { flags: {} };
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const flags = data?.flags ?? {};

  return {
    flags,
    isLoading: isLoading || authLoading,
    isEnabled: (key: string) => flags[key] === true,
  };
}
