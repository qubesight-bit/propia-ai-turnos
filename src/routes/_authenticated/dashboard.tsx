import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, DoorOpen, RefreshCcw, ShieldCheck } from "lucide-react";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/app/app-shell";
import { RoomStatusBadge, StageBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApprovals, useAudit, useInspections, useRooms, useTurnovers } from "@/lib/data";
import { useOrg } from "@/lib/org";
import { ROOM_STATUS_LABEL, daysBetween, formatDate, type RoomStatus } from "@/lib/turnover";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Panel · Propia AI TurnOS" },
      { name: "description", content: "Panel de TurnOS" },
      { property: "og:title", content: "Panel · Propia AI" },
      { property: "og:description", content: "Panel de TurnOS" },
    ],
  }),
  component: DashboardPage,
});

const AUDIT_ACTIONS: Record<string, string> = {
  create: "Creación",
  insert: "Creación",
  update: "Actualización",
  delete: "Eliminación",
  open: "Apertura",
  transition: "Cambio de etapa",
  hold_set: "Pausa o bloqueo",
  hold_released: "Reanudación",
};

const AUDIT_ENTITIES: Record<string, string> = {
  organizations: "Organización",
  memberships: "Membresía",
  properties: "Propiedad",
  rooms: "Habitación",
  turnovers: "Rotación",
  turnover_tasks: "Tarea",
  inspections: "Inspección",
  approvals: "Aprobación",
};

function DashboardPage() {
  const { orgName } = useOrg();
  const rooms = useRooms();
  const turnovers = useTurnovers();
  const inspections = useInspections();
  const approvals = useApprovals();
  const audit = useAudit(undefined, 6);
  const queries = [rooms, turnovers, inspections, approvals, audit];
  const failedQueries = queries.filter((query) => query.isError);
  const openTurnovers = turnovers.data?.filter((turnover) => turnover.status !== "closed") ?? [];
  const pendingInspections =
    inspections.data?.filter(
      ({ status, kind, turnovers }) =>
        status === "pending" &&
        turnovers?.status === (kind === "exit" ? "inspection_pending" : "ready_for_review"),
    ).length ?? 0;
  const pendingApprovals = approvals.data?.filter(({ status }) => status === "pending").length ?? 0;
  const roomCounts = new Map<RoomStatus, number>();
  for (const { status } of rooms.data ?? []) {
    roomCounts.set(status, (roomCounts.get(status) ?? 0) + 1);
  }

  const metrics = [
    { label: "Habitaciones", value: rooms.data?.length ?? 0, icon: DoorOpen },
    { label: "Rotaciones abiertas", value: openTurnovers.length, icon: RefreshCcw },
    {
      label: "Inspecciones pendientes en su etapa",
      value: pendingInspections,
      icon: ClipboardCheck,
    },
    { label: "Aprobaciones pendientes", value: pendingApprovals, icon: ShieldCheck },
  ];

  return (
    <>
      <PageHeader title="Panel" description={orgName} />
      {failedQueries.length > 0 ? (
        <div role="alert">
          <EmptyState
            title="No se pudo cargar el panel"
            action={
              <Button
                variant="outline"
                onClick={() => void Promise.all(failedQueries.map((query) => query.refetch()))}
              >
                Reintentar
              </Button>
            }
          />
        </div>
      ) : queries.some((query) => query.isPending) ? (
        <div role="status">
          <span className="sr-only">Cargando panel</span>
          <LoadingBlock />
        </div>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
              >
                <Icon aria-hidden="true" className="size-5 text-primary" />
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-auto font-display text-3xl font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="grid items-start gap-5 lg:grid-cols-3">
            <Card className="shadow-card lg:col-span-2">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="font-display text-lg">Rotaciones abiertas</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/turnovers">Ver rotaciones</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {openTurnovers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay rotaciones abiertas.</p>
                ) : (
                  <>
                    {openTurnovers.length > 6 && (
                      <p className="mb-2 text-sm text-muted-foreground">
                        Últimas 6 de {openTurnovers.length}
                      </p>
                    )}
                    <ul className="divide-y">
                      {openTurnovers.slice(0, 6).map((turnover) => (
                        <li
                          key={turnover.id}
                          className="flex flex-wrap items-start justify-between gap-2 py-3"
                        >
                          <div className="min-w-0">
                            <p className="break-words font-medium">
                              {turnover.rooms ? `Habitación ${turnover.rooms.code}` : "Habitación"}
                              {turnover.rooms?.properties && ` · ${turnover.rooms.properties.name}`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Fecha objetivo {formatDate(turnover.target_ready_date)} ·{" "}
                              {daysBetween(turnover.created_at)} d desde la apertura
                            </p>
                          </div>
                          <StageBadge status={turnover.status} hold={turnover.hold_kind} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="font-display text-lg">Habitaciones por estado</CardTitle>
              </CardHeader>
              <CardContent>
                {roomCounts.size === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay habitaciones registradas.</p>
                ) : (
                  <dl className="space-y-3">
                    {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((status) => (
                      <div key={status} className="flex items-center justify-between gap-2">
                        <dt>
                          <RoomStatusBadge status={status} />
                        </dt>
                        <dd className="text-sm font-medium tabular-nums">
                          {roomCounts.get(status) ?? 0}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="font-display text-lg">Actividad reciente</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/audit">Ver auditoría</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {audit.data?.length ? (
                <ul className="divide-y">
                  {audit.data.map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                    >
                      <span className="font-medium">
                        {AUDIT_ACTIONS[event.action] ?? event.action} ·{" "}
                        {AUDIT_ENTITIES[event.entity_type] ?? event.entity_type}
                      </span>
                      <time className="text-muted-foreground" dateTime={event.created_at}>
                        {formatDate(event.created_at, true)}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No hay actividad registrada.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
