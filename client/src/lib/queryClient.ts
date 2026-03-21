import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let parsed = text;
    try {
      const json = JSON.parse(text);
      parsed = json.message || text;
    } catch {}
    const supportNudge = "\n\nIf this keeps happening, contact us at /contact";
    throw new Error(`${res.status}: ${parsed}${supportNudge}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export function podcastRecapsQueryKey(slug: string, isLoggedIn: boolean) {
  return ["/api/podcasts", slug, "recaps", isLoggedIn ? "enriched" : "basic"] as const;
}

export function podcastRecapsQueryFn(slug: string, isLoggedIn: boolean) {
  return async () => {
    const limit = isLoggedIn ? "10" : "50";
    const mentionsParam = isLoggedIn ? "&mentions=true" : "";
    const res = await fetch(`/api/podcasts/${slug}/recaps?limit=${limit}${mentionsParam}`, {
      credentials: "include",
    });
    if (!res.ok) return [];
    return res.json();
  };
}

export function usePrefetchPodcast(slug: string | undefined | null, isLoggedIn?: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = useCallback(() => {
    if (!slug) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const loggedIn = !!isLoggedIn;
    timerRef.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["/api/podcasts/by-slug", slug],
        queryFn: getQueryFn({ on401: "throw" }),
        staleTime: Infinity,
      });
      queryClient.prefetchQuery({
        queryKey: podcastRecapsQueryKey(slug, loggedIn),
        queryFn: podcastRecapsQueryFn(slug, loggedIn),
        staleTime: Infinity,
      });
    }, 150);
  }, [slug, isLoggedIn]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { onMouseEnter, onMouseLeave };
}
