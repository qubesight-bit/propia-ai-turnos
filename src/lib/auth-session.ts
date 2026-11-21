import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAuthSessionSync(queryClient: QueryClient, invalidateRouter: () => unknown) {
  useEffect(() => {
    let userId: string | null | undefined;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null;
      if (event === "INITIAL_SESSION") {
        if (userId === undefined) userId = next;
        return;
      }
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      if (event === "SIGNED_OUT" || userId !== next) queryClient.clear();
      userId = next;
      clearTimeout(pending);
      // Route loaders may call Supabase Auth. Run them after its callback completes.
      pending = setTimeout(() => {
        void invalidateRouter();
        if (next) void queryClient.invalidateQueries();
      }, 0);
    });
    return () => {
      clearTimeout(pending);
      data.subscription.unsubscribe();
    };
  }, [queryClient, invalidateRouter]);
}
