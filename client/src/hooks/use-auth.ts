import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserResponse } from "@shared/routes";

export function useAuth() {
  return useQuery<UserResponse | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.status === 401) return null;
        if (!res.ok) throw new Error("Failed to fetch user");
        return await res.json();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (data: { email: string; podcasts: string[]; signupContext?: string }) => {
      let detectedTimezone = "America/New_York";
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) detectedTimezone = tz;
      } catch {}
      const res = await apiRequest("POST", "/api/auth/register", {
        ...data,
        deliveryTimezone: detectedTimezone,
        signupSource: window.location.pathname,
      });
      return await res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
    },
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: async (data: { email: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
    },
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
    },
  });
}

export function useUpdateUser() {
  return useMutation({
    mutationFn: async (data: { email?: string; podcasts?: string[]; deliveryTime?: string; deliveryTimezone?: string; vacationUntil?: string | null; displayName?: string | null; birthday?: string | null; gender?: string | null; location?: string | null; language?: string | null }) => {
      const res = await apiRequest("POST", "/api/users/update", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}
