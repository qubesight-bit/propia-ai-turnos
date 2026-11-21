import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { TASK_TYPE_LABEL, type TaskType, type TurnoverStatus } from "./turnover";

export const INSPECTION_LABEL = { exit: "Inspección de salida", review: "Revisión final" };
export type InspectionKind = keyof typeof INSPECTION_LABEL;
export const INSPECTION_TASK_PREFIX = "Inspección: ";
export const INSPECTION_STAGE: Record<InspectionKind, TurnoverStatus> = {
  exit: "inspection_pending",
  review: "ready_for_review",
};

export function canChangeTasks(stage?: TurnoverStatus) {
  return !!stage && stage !== "move_in_completed" && stage !== "closed";
}

export function canAddPendingTask(stage?: TurnoverStatus) {
  return canChangeTasks(stage) && stage !== "available_for_leasing" && stage !== "reserved";
}

export function createTask(
  orgId: string,
  turnoverId: string,
  fields: {
    title: string;
    type: string;
    assignee_id?: string | null;
    due_date?: string | null;
  },
) {
  const title = fields.type === "inspection" ? INSPECTION_TASK_PREFIX + fields.title : fields.title;
  const type = (fields.type === "inspection" ? "other" : fields.type) as TaskType;
  if (!fields.title || title.length > 200 || !Object.hasOwn(TASK_TYPE_LABEL, type)) {
    throw new Error(
      "Ingrese un nombre válido de hasta 200 caracteres, incluido el prefijo si corresponde.",
    );
  }
  return supabase
    .from("turnover_tasks")
    .insert({ ...fields, title, type, organization_id: orgId, turnover_id: turnoverId })
    .select("id")
    .single();
}

export async function updateTask(
  orgId: string,
  task: Tables<"turnover_tasks">,
  change: { status: "done" | "pending" } | { assignee_id: string | null },
) {
  if (task.organization_id !== orgId)
    throw new Error("La tarea no pertenece a la organización activa.");
  let query = supabase
    .from("turnover_tasks")
    .update(change)
    .eq("organization_id", orgId)
    .eq("turnover_id", task.turnover_id)
    .eq("id", task.id);
  if ("status" in change) query = query.eq("status", task.status);
  else
    query = task.assignee_id
      ? query.eq("assignee_id", task.assignee_id)
      : query.is("assignee_id", null);
  const result = await query.select("id").single();
  if (result.error?.code === "PGRST116") {
    return {
      data: null,
      error: {
        code: "40001",
        message:
          "La tarea cambió o ya no está disponible. Cierre el formulario y vuelva a abrirla.",
      },
    };
  }
  return result;
}

export function saveInspection(
  inspection: Tables<"inspections">,
  notes: string,
  checklist: string[],
) {
  if (notes.length < 5) throw new Error("Ingrese al menos 5 caracteres de hallazgos.");
  const verified = checklist.map((point) => point.trim()).filter(Boolean);
  if (inspection.kind === "review" && !verified.length) {
    throw new Error("La revisión final requiere al menos un punto verificado.");
  }
  const previous = inspection.checklist;
  const entries: Json[] = Array.isArray(previous)
    ? previous.filter((entry) => typeof entry !== "string")
    : previous == null
      ? []
      : [previous];
  return supabase.rpc("record_inspection", {
    _turnover: inspection.turnover_id,
    _kind: inspection.kind,
    _notes: notes,
    _evidence_url: inspection.evidence_url ?? "",
    _checklist: [...entries, ...verified],
  });
}
