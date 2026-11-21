import type { Json } from "@/integrations/supabase/types";
import type { SafeAuditRow } from "./audit-client";
import {
  ROLE_LABEL,
  ROOM_STATUS_LABEL,
  STAGE_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
} from "./turnover";

export const AUDIT_ACTIONS: Readonly<Record<string, string>> = {
  create: "Creación",
  insert: "Registro",
  update: "Actualización",
  delete: "Eliminación",
  open: "Apertura",
  transition: "Cambio de etapa",
  hold_set: "Pausa o bloqueo",
  hold_released: "Reanudación",
};

export const AUDIT_ENTITIES: Readonly<Record<string, string>> = {
  organizations: "Organización",
  memberships: "Membresía",
  properties: "Propiedad",
  rooms: "Habitación",
  turnovers: "Rotación",
  turnover_tasks: "Tarea",
  inspections: "Inspección",
  approvals: "Aprobación",
};

const fields: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  memberships: { role: Object.keys(ROLE_LABEL) },
  rooms: { status: Object.keys(ROOM_STATUS_LABEL) },
  turnovers: {
    status: Object.keys(STAGE_LABEL),
    hold_kind: ["paused", "blocked"],
    decision: ["approved", "rejected"],
  },
  turnover_tasks: { type: Object.keys(TASK_TYPE_LABEL), status: Object.keys(TASK_STATUS_LABEL) },
  inspections: { kind: ["exit", "review"], status: ["pending", "completed"] },
  approvals: { action: ["publish_for_leasing"], status: ["pending", "approved", "rejected"] },
};

const dates: Readonly<Record<string, readonly string[]>> = {
  turnovers: ["move_out_date", "target_ready_date", "move_in_date", "closed_at"],
  turnover_tasks: ["due_date", "completed_at"],
  inspections: ["completed_at"],
  approvals: ["decided_at"],
};

function objectSnapshot(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function auditReference(value: Json, field: string) {
  const candidate = objectSnapshot(value)[field];
  return typeof candidate === "string" ? candidate : undefined;
}

export function prepareAuditEvent({
  before_json,
  after_json,
  before_redacted,
  after_redacted,
  ...event
}: SafeAuditRow) {
  const reference = (key: string) =>
    auditReference(after_json, key) ?? auditReference(before_json, key);
  return {
    ...event,
    references: {
      turnover: reference("turnover_id"),
      room: reference("room_id"),
      property: reference("property_id"),
    },
    before:
      before_json == null && !before_redacted
        ? null
        : auditSnapshot(before_json, event.entity_type, before_redacted),
    after:
      after_json == null && !after_redacted
        ? null
        : auditSnapshot(after_json, event.entity_type, after_redacted),
  };
}

export function auditSnapshot(value: Json, entity: string, redactedOnServer = false) {
  const source = objectSnapshot(value);
  const safe: Record<string, Json> = {};
  for (const [key, allowed] of Object.entries(
    Object.hasOwn(fields, entity) ? (fields[entity] ?? {}) : {},
  )) {
    const field = source[key];
    if (field === null || (typeof field === "string" && allowed.includes(field))) safe[key] = field;
  }
  for (const key of Object.hasOwn(dates, entity) ? (dates[entity] ?? []) : []) {
    const date = source[key];
    if (
      date === null ||
      (typeof date === "string" &&
        /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(date))
    )
      safe[key] = date;
  }
  return {
    safe,
    redacted:
      redactedOnServer ||
      (value != null &&
        (value !== source || Object.keys(source).length > Object.keys(safe).length)),
  };
}
