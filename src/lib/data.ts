import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./org";

export function useProperties() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["properties", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").eq("organization_id", orgId).order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useRooms() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["rooms", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*, properties(name)")
        .eq("organization_id", orgId)
        .order("code");
      if (error) throw error;
      return data;
    },
  });
}

export function useTurnovers() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["turnovers", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("turnovers")
        .select("*, rooms(code, properties(name))")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useTasks() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["tasks", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("turnover_tasks")
        .select("*, turnovers(status, rooms(code, properties(name)))")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInspections() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["inspections", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*, turnovers(status, rooms(code, properties(name)))")
        .eq("organization_id", orgId);
      if (error) throw error;
      return data;
    },
  });
}

export function useApprovals() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["approvals", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvals")
        .select("*, turnovers(status, rooms(code, properties(name)))")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useMembers() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["members", orgId],
    queryFn: async () => {
      const { data: mems, error } = await supabase
        .from("memberships")
        .select("user_id, role, created_at")
        .eq("organization_id", orgId);
      if (error) throw error;
      const ids = (mems ?? []).map((m) => m.user_id);
      const { data: profs, error: e2 } = ids.length
        ? await supabase.from("profiles").select("id, email, full_name").in("id", ids)
        : { data: [], error: null };
      if (e2) throw e2;
      return (mems ?? []).map((m) => {
        const p = profs?.find((x) => x.id === m.user_id);
        return { ...m, email: p?.email ?? null, full_name: p?.full_name ?? null };
      });
    },
  });
}

export function useAudit(entityId?: string) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["audit", orgId, entityId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("audit_events")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (entityId) q = q.or(`entity_id.eq.${entityId},after_json->>turnover_id.eq.${entityId}`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function memberName(members: { user_id: string; email: string | null; full_name: string | null }[] | undefined, id?: string | null) {
  if (!id) return "—";
  const m = members?.find((x) => x.user_id === id);
  return m?.full_name || m?.email || "Usuario";
}
