import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { OrgProvider } from "@/lib/org";
import { AppShell } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error && !isAuthSessionMissingError(error) && error.status !== 401 && error.status !== 403)
      throw error;
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  return (
    <OrgProvider key={user.id} user={user}>
      <AppShell>
        <Outlet />
      </AppShell>
    </OrgProvider>
  );
}
