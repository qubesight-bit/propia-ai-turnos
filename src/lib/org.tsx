import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { OrgRole } from "./turnover";
import { errorMessage } from "./turnover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export type OrgMembership = { organization_id: string; role: OrgRole; name: string };

type OrgCtx = {
  userId: string;
  email: string | null;
  orgId: string;
  orgName: string;
  role: OrgRole;
  memberships: OrgMembership[];
  setOrgId: (id: string) => void;
};

const Ctx = createContext<OrgCtx | null>(null);
const KEY = "propia.currentOrg";

export function useOrg() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrg fuera de OrgProvider");
  return c;
}

export function OrgProvider({ children, user }: { children: ReactNode; user: User }) {
  const qc = useQueryClient();
  const memQ = useQuery({
    queryKey: ["memberships", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("organization_id, role, organizations(name)")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map((m) => ({
        organization_id: m.organization_id,
        role: m.role,
        name: (m.organizations as { name: string } | null)?.name ?? "Organización",
      })) as OrgMembership[];
    },
  });
  const [orgId, setOrgIdState] = useState<string | null>(null);
  useEffect(() => {
    setOrgIdState(localStorage.getItem(KEY));
  }, []);

  const value = useMemo<OrgCtx | null>(() => {
    const memberships = memQ.data ?? [];
    const current = memberships.find((m) => m.organization_id === orgId) ?? memberships[0];
    if (!current) return null;
    return {
      userId: user.id,
      email: user.email ?? null,
      orgId: current.organization_id,
      orgName: current.name,
      role: current.role,
      memberships,
      setOrgId: (id) => {
        localStorage.setItem(KEY, id);
        setOrgIdState(id);
        qc.invalidateQueries();
      },
    };
  }, [memQ.data, orgId, user.id, user.email, qc]);

  if (memQ.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando organización…
      </div>
    );
  }
  const error = memQ.error;
  if (error) {
    return <div className="p-8 text-destructive">{errorMessage(error)}</div>;
  }
  if (!value) return <CreateOrg onCreated={() => memQ.refetch()} />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function CreateOrg({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Cree su organización</CardTitle>
          <CardDescription>
            Será el propietario (owner). Todos los datos quedan aislados por organización.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (name.trim().length < 2) {
                toast.error("Escriba un nombre de al menos 2 caracteres");
                return;
              }
              setBusy(true);
              const { data, error } = await supabase.rpc("create_organization", { _name: name });
              setBusy(false);
              if (error) {
                toast.error(errorMessage(error));
                return;
              }
              localStorage.setItem(KEY, data as string);
              toast.success("Organización creada");
              onCreated();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="org">Nombre de la organización</Label>
              <Input
                id="org"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Residencias Ejemplo S.A."
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Crear organización
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
