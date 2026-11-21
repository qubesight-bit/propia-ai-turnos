import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./org";
import { prepareAuditEvent } from "./audit";

const PAGE_SIZE = 500;

async function readAll<T>(
  page: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data) return rows;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

export function useProperties() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["properties", orgId],
    queryFn: ({ signal }) =>
      readAll((start, end) =>
        supabase
          .from("properties")
          .select("*")
          .eq("organization_id", orgId)
          .order("name")
          .order("id")
          .range(start, end)
          .abortSignal(signal),
      ),
  });
}

export function useRooms() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["rooms", orgId],
    queryFn: ({ signal }) =>
      readAll((start, end) =>
        supabase
          .from("rooms")
          .select("*, properties(name)")
          .eq("organization_id", orgId)
          .order("code")
          .order("id")
          .range(start, end)
          .abortSignal(signal),
      ),
  });
}

export function useTurnovers(roomId?: string) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: roomId ? ["turnovers", orgId, roomId] : ["turnovers", orgId],
    queryFn: ({ signal }) =>
      readAll((start, end) => {
        let query = supabase
          .from("turnovers")
          .select("*, rooms(code, properties(name))")
          .eq("organization_id", orgId);
        if (roomId) query = query.eq("room_id", roomId);
        return query
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, end)
          .abortSignal(signal);
      }),
  });
}

export function useTasks(turnoverId?: string) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: turnoverId ? ["tasks", orgId, turnoverId] : ["tasks", orgId],
    queryFn: ({ signal }) =>
      readAll((start, end) =>
        supabase
          .from("turnover_tasks")
          .select("*, turnovers(status, rooms(code, properties(name)))")
          .eq("organization_id", orgId)
          .match(turnoverId ? { turnover_id: turnoverId } : {})
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, end)
          .abortSignal(signal),
      ),
  });
}

export function useInspections(turnoverId?: string) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: turnoverId ? ["inspections", orgId, turnoverId] : ["inspections", orgId],
    queryFn: ({ signal }) =>
      readAll((start, end) =>
        supabase
          .from("inspections")
          .select("*, turnovers(status, rooms(code, properties(name)))")
          .eq("organization_id", orgId)
          .match(turnoverId ? { turnover_id: turnoverId } : {})
          .order("id")
          .range(start, end)
          .abortSignal(signal),
      ),
  });
}

export function useApprovals(turnoverId?: string) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: turnoverId ? ["approvals", orgId, turnoverId] : ["approvals", orgId],
    queryFn: ({ signal }) =>
      readAll((start, end) =>
        supabase
          .from("approvals")
          .select("*, turnovers(status, hold_kind, rooms(code, properties(name)))")
          .eq("organization_id", orgId)
          .match(turnoverId ? { turnover_id: turnoverId } : {})
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, end)
          .abortSignal(signal),
      ),
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

export function useAudit(entityId?: string, limit = 500) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["audit", orgId, entityId ?? "all", limit],
    queryFn: async ({ signal }) => {
      let q = supabase
        .from("audit_events")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(limit);
      if (entityId)
        q = q.or(
          `entity_id.eq.${entityId},after_json->>turnover_id.eq.${entityId},before_json->>turnover_id.eq.${entityId}`,
        );
      const { data, error } = await q.abortSignal(signal);
      if (error) throw error;
      return data;
    },
  });
}

export function useTurnoverTimeline(turnoverId: string) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["audit", orgId, "turnover", turnoverId],
    queryFn: ({ signal }) =>
      readAll((start, end) =>
        supabase
          .from("audit_events")
          .select("*")
          .eq("organization_id", orgId)
          .or(
            `entity_id.eq.${turnoverId},after_json->>turnover_id.eq.${turnoverId},before_json->>turnover_id.eq.${turnoverId}`,
          )
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, end)
          .abortSignal(signal),
      ),
  });
}

export type AuditFilters = {
  from: string;
  to: string;
  actor: string;
  action: string;
  entity: string;
};

const AUDIT_PAGE_SIZE = 25;

export function useAuditPage(filters: AuditFilters, page: number) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["audit", orgId, "page", filters, page],
    enabled: !filters.from || !filters.to || filters.from <= filters.to,
    queryFn: async ({ signal }) => {
      let query = supabase.from("audit_events").select("*").eq("organization_id", orgId);
      if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00-06:00`);
      if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999999-06:00`);
      if (filters.actor === "system") query = query.is("actor_id", null);
      else if (filters.actor) query = query.eq("actor_id", filters.actor);
      if (filters.action) query = query.eq("action", filters.action);
      if (filters.entity) query = query.eq("entity_type", filters.entity);
      const offset = page * AUDIT_PAGE_SIZE;
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + AUDIT_PAGE_SIZE)
        .abortSignal(signal);
      if (error) throw error;
      return {
        events: data.slice(0, AUDIT_PAGE_SIZE).map(prepareAuditEvent),
        hasNext: data.length > AUDIT_PAGE_SIZE,
      };
    },
  });
}

export function memberName(
  members: { user_id: string; email: string | null; full_name: string | null }[] | undefined,
  id?: string | null,
) {
  if (!id) return "—";
  const m = members?.find((x) => x.user_id === id);
  return m?.full_name || m?.email || "Usuario";
}
