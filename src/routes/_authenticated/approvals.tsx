import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/app/app-shell";
import { TurnoverAction } from "@/components/app/turnover-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideApproval } from "@/lib/approval-operations";
import { memberName, useApprovals, useMembers } from "@/lib/data";
import { useOrg } from "@/lib/org";
import { canManage, errorMessage, formatDate } from "@/lib/turnover";
import { formText } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Aprobaciones · Propia AI TurnOS" },
      { name: "description", content: "Aprobaciones de TurnOS" },
      { property: "og:title", content: "Aprobaciones · Propia AI" },
      { property: "og:description", content: "Aprobaciones de TurnOS" },
    ],
  }),
  component: ApprovalsRoute,
});

const labels = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };
const variants = { pending: "warning", approved: "success", rejected: "destructive" } as const;
type Approval = NonNullable<ReturnType<typeof useApprovals>["data"]>[number];

function ApprovalsRoute() {
  const { orgId } = useOrg();
  return <ApprovalsPage key={orgId} />;
}

function approvalLocation(approval: Approval) {
  const room = approval.turnovers?.rooms;
  return (
    [room?.properties?.name, room?.code && `Habitación ${room.code}`].filter(Boolean).join(" · ") ||
    "Ubicación no disponible"
  );
}

function approvalType(approval: Approval) {
  return approval.action === "publish_for_leasing" ? "Comercialización" : "Autorización";
}

function ApprovalsPage() {
  const { orgId, role } = useOrg();
  const approvals = useApprovals();
  const members = useMembers();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string>();
  const [decision, setDecision] = useState<{ id: string; approve: boolean }>();
  const detail = approvals.data?.find((item) => item.id === selected);
  const items = approvals.data?.filter((item) => !status || item.status === status) ?? [];
  const canDecide = (item: Approval) =>
    canManage(role) &&
    item.organization_id === orgId &&
    item.status === "pending" &&
    item.turnovers?.status === "marketing_approval_pending" &&
    !item.turnovers.hold_kind;

  return (
    <>
      <PageHeader title="Aprobaciones" />
      <div className="mb-5 max-w-xs space-y-2">
        <Label htmlFor="approval-status">Estado de la solicitud</Label>
        <select
          id="approval-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todas</option>
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobadas</option>
          <option value="rejected">Rechazadas</option>
        </select>
      </div>
      {members.isError && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Los nombres de los responsables no están disponibles.
        </p>
      )}
      {approvals.isError ? (
        <div role="alert">
          <EmptyState
            title="No se pudieron cargar las aprobaciones"
            description={errorMessage(approvals.error)}
            action={
              <Button variant="outline" onClick={() => void approvals.refetch()}>
                Reintentar
              </Button>
            }
          />
        </div>
      ) : approvals.isPending ? (
        <div role="status" aria-label="Cargando aprobaciones">
          <LoadingBlock />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={
            approvals.data?.length
              ? "No hay solicitudes con este estado."
              : "Todavía no hay solicitudes."
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{approvalType(item)}</h2>
                  <Badge variant={variants[item.status]}>{labels[item.status]}</Badge>
                </div>
                <p className="break-words text-sm">{approvalLocation(item)}</p>
                <p className="text-sm text-muted-foreground">
                  {memberName(members.data, item.requested_by)} ·{" "}
                  <time dateTime={item.created_at}>{formatDate(item.created_at, true)}</time>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelected(item.id)}>
                    Ver solicitud
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/turnovers" search={{ turnover: item.turnover_id }}>
                      Ver rotación
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {detail && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
        >
          <DialogContent className="max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{approvalType(detail)}</DialogTitle>
              <DialogDescription>{approvalLocation(detail)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Badge variant={variants[detail.status]}>{labels[detail.status]}</Badge>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="font-medium">Solicitada por</dt>
                  <dd>
                    {memberName(members.data, detail.requested_by)} ·{" "}
                    {formatDate(detail.created_at, true)}
                  </dd>
                </div>
                {detail.request_note && (
                  <div>
                    <dt className="font-medium">Nota de solicitud</dt>
                    <dd className="whitespace-pre-wrap break-words">{detail.request_note}</dd>
                  </div>
                )}
                {detail.decided_at && (
                  <div>
                    <dt className="font-medium">Resuelta por</dt>
                    <dd>
                      {memberName(members.data, detail.decided_by)} ·{" "}
                      {formatDate(detail.decided_at, true)}
                    </dd>
                  </div>
                )}
                {detail.decision_note && (
                  <div>
                    <dt className="font-medium">Nota de decisión</dt>
                    <dd className="whitespace-pre-wrap break-words">{detail.decision_note}</dd>
                  </div>
                )}
              </dl>
              {detail.status === "pending" && detail.turnovers?.hold_kind && (
                <p className="text-sm text-muted-foreground">
                  Reanude la rotación antes de decidir.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/turnovers" search={{ turnover: detail.turnover_id }}>
                    Ver rotación
                  </Link>
                </Button>
                {canDecide(detail) && (
                  <>
                    <Button size="sm" onClick={() => setDecision({ id: detail.id, approve: true })}>
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDecision({ id: detail.id, approve: false })}
                    >
                      Rechazar
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {decision && detail?.id === decision.id && canManage(role) && (
        <TurnoverAction
          title={decision.approve ? "Confirmar aprobación" : "Confirmar rechazo"}
          description={approvalLocation(detail)}
          onClose={() => setDecision(undefined)}
          command={(form) => {
            if (!canDecide(detail)) throw new Error("La solicitud ya no admite una decisión.");
            return decideApproval(detail.id, decision.approve, formText(form, "note"));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="decision-note">
              {decision.approve ? "Nota (opcional)" : "Motivo del rechazo"}
            </Label>
            <Textarea
              id="decision-note"
              name="note"
              required={!decision.approve}
              minLength={decision.approve ? undefined : 3}
            />
          </div>
        </TurnoverAction>
      )}
    </>
  );
}
