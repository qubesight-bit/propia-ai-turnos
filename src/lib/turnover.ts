import type { Database } from "@/integrations/supabase/types";

export type TurnoverStatus = Database["public"]["Enums"]["turnover_status"];
export type OrgRole = Database["public"]["Enums"]["org_role"];
export type RoomStatus = Database["public"]["Enums"]["room_status"];
export type TaskType = Database["public"]["Enums"]["task_type"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];

export const TIMEZONE = "America/Costa_Rica";

export const STAGES: TurnoverStatus[] = [
  "exit_announced",
  "exit_confirmed",
  "inspection_pending",
  "preparation_in_progress",
  "ready_for_review",
  "marketing_approval_pending",
  "available_for_leasing",
  "reserved",
  "move_in_completed",
  "closed",
];

export const STAGE_LABEL: Record<TurnoverStatus, string> = {
  exit_announced: "Aviso de salida",
  exit_confirmed: "Salida confirmada",
  inspection_pending: "Inspección pendiente",
  preparation_in_progress: "En preparación",
  ready_for_review: "Lista para revisión",
  marketing_approval_pending: "Aprobación comercial",
  available_for_leasing: "Disponible para alquiler",
  reserved: "Reservada",
  move_in_completed: "Ingreso completado",
  closed: "Cerrada",
};

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  occupied: "Ocupada",
  notice: "Con aviso de salida",
  turnover: "En rotación",
  available: "Disponible",
  reserved: "Reservada",
  out_of_service: "Fuera de servicio",
};

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Propietario",
  manager: "Administrador",
  staff: "Operativo",
  viewer: "Solo lectura",
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  cleaning: "Limpieza",
  maintenance: "Mantenimiento",
  painting: "Pintura",
  inventory: "Inventario",
  photos: "Fotografías",
  other: "Otra",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  done: "Completada",
  cancelled: "Cancelada",
};

export type NextAction =
  | {
      kind: "transition";
      to: TurnoverStatus;
      label: string;
      roles: OrgRole[];
      needsMoveIn?: boolean;
    }
  | { kind: "request_approval"; label: string; roles: OrgRole[] }
  | { kind: "await_approval"; label: string; roles: OrgRole[] };

const MGR: OrgRole[] = ["owner", "manager"];
const OPS: OrgRole[] = ["owner", "manager", "staff"];

/**
 * UI mirror of the server-side transition table (public.transition_turnover).
 * The database is the source of truth; this only decides which buttons to show.
 */
export function nextActions(status: TurnoverStatus): NextAction[] {
  switch (status) {
    case "exit_announced":
      return [{ kind: "transition", to: "exit_confirmed", label: "Confirmar salida", roles: MGR }];
    case "exit_confirmed":
      return [
        { kind: "transition", to: "inspection_pending", label: "Programar inspección", roles: MGR },
      ];
    case "inspection_pending":
      return [
        {
          kind: "transition",
          to: "preparation_in_progress",
          label: "Iniciar preparación",
          roles: OPS,
        },
      ];
    case "preparation_in_progress":
      return [
        { kind: "transition", to: "ready_for_review", label: "Enviar a revisión", roles: OPS },
      ];
    case "ready_for_review":
      return [{ kind: "request_approval", label: "Solicitar aprobación comercial", roles: OPS }];
    case "marketing_approval_pending":
      return [{ kind: "await_approval", label: "Esperando decisión de owner/manager", roles: MGR }];
    case "available_for_leasing":
      return [{ kind: "transition", to: "reserved", label: "Marcar reservada", roles: MGR }];
    case "reserved":
      return [
        {
          kind: "transition",
          to: "move_in_completed",
          label: "Confirmar ingreso",
          roles: MGR,
          needsMoveIn: true,
        },
        { kind: "transition", to: "available_for_leasing", label: "Liberar reserva", roles: MGR },
      ];
    case "move_in_completed":
      return [{ kind: "transition", to: "closed", label: "Cerrar rotación", roles: MGR }];
    case "closed":
      return [];
  }
}

export function canDo(role: OrgRole | null | undefined, roles: OrgRole[]) {
  return !!role && roles.includes(role);
}

export const canManage = (role?: OrgRole | null) => canDo(role, MGR);
export const canOperate = (role?: OrgRole | null) => canDo(role, OPS);

export function stageIndex(s: TurnoverStatus) {
  return STAGES.indexOf(s);
}

export function progressPct(s: TurnoverStatus) {
  return Math.round((stageIndex(s) / (STAGES.length - 1)) * 100);
}

/** Whole days between two instants (rounded down, never negative). */
export function daysBetween(from: string | Date, to: string | Date = new Date()) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function formatDate(d?: string | null, withTime = false) {
  if (!d) return "—";
  // date-only strings are calendar dates; avoid shifting by timezone
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
  return new Intl.DateTimeFormat("es-CR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function todayCR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export function formatCRC(n?: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(n);
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = String((e as { message: unknown }).message);
    if (m.includes("row-level security")) return "No tiene permiso para realizar esta acción.";
    if (m.includes("duplicate key")) return "Ya existe un registro con esos datos.";
    return m;
  }
  return "Ocurrió un error inesperado.";
}
