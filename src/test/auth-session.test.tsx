import { QueryClient } from "@tanstack/react-query";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthSessionSync } from "@/lib/auth-session";

const auth = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: auth.subscribe } },
}));

type Callback = (event: AuthChangeEvent, session: Session | null) => void;
const session = (id: string) => ({ user: { id } }) as Session;

function setup() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["audit", "org"], ["registro anterior"]);
  const invalidateRouter = vi.fn();
  const hook = renderHook(() => useAuthSessionSync(queryClient, invalidateRouter));
  const notify = auth.subscribe.mock.calls[0]?.[0] as Callback;
  return { queryClient, invalidateRouter, notify, ...hook };
}

beforeEach(() => {
  vi.useFakeTimers();
  auth.subscribe
    .mockReset()
    .mockReturnValue({ data: { subscription: { unsubscribe: auth.unsubscribe } } });
  auth.unsubscribe.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Caché y cambios de sesión", () => {
  it("borra los datos al cambiar de cuenta y recarga la ruta después de la notificación", async () => {
    const { queryClient, notify, invalidateRouter } = setup();
    notify("INITIAL_SESSION", session("a"));
    notify("SIGNED_IN", session("b"));
    expect(queryClient.getQueryData(["audit", "org"])).toBeUndefined();
    expect(invalidateRouter).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(invalidateRouter).toHaveBeenCalledOnce();
  });

  it("conserva la caché al reanunciar la misma cuenta y la borra al salir desde otra pestaña", async () => {
    const { queryClient, notify, invalidateRouter } = setup();
    notify("INITIAL_SESSION", session("a"));
    notify("SIGNED_IN", session("a"));
    expect(queryClient.getQueryData(["audit", "org"])).toEqual(["registro anterior"]);
    notify("SIGNED_OUT", null);
    expect(queryClient.getQueryData(["audit", "org"])).toBeUndefined();
    await vi.runAllTimersAsync();
    expect(invalidateRouter).toHaveBeenCalledOnce();
  });

  it("cancela la recarga pendiente y la suscripción al desmontar", async () => {
    const { notify, invalidateRouter, unmount } = setup();
    notify("SIGNED_OUT", null);
    unmount();
    await vi.runAllTimersAsync();
    expect(auth.unsubscribe).toHaveBeenCalledOnce();
    expect(invalidateRouter).not.toHaveBeenCalled();
  });
});
