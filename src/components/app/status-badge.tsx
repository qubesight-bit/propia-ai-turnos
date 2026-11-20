import { Badge } from "@/components/ui/badge";
import { ROOM_STATUS_LABEL, STAGE_LABEL, type RoomStatus, type TurnoverStatus } from "@/lib/turnover";

const ROOM_VARIANT: Record<RoomStatus, "success" | "warning" | "info" | "muted" | "accent" | "destructive"> = {
  occupied: "muted",
  notice: "warning",
  turnover: "info",
  available: "success",
  reserved: "accent",
  out_of_service: "destructive",
};

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  return <Badge variant={ROOM_VARIANT[status]}>{ROOM_STATUS_LABEL[status]}</Badge>;
}

export function StageBadge({ status, hold }: { status: TurnoverStatus; hold?: string | null }) {
  const v =
    status === "closed" ? "muted" : status === "marketing_approval_pending" ? "warning" : status === "available_for_leasing" ? "success" : "info";
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={v}>{STAGE_LABEL[status]}</Badge>
      {hold && <Badge variant="destructive">{hold === "blocked" ? "Bloqueada" : "Pausada"}</Badge>}
    </span>
  );
}
