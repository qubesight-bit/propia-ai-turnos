import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/app/app-shell";
import { StageBadge } from "@/components/app/status-badge";
import { TurnoverAction } from "@/components/app/turnover-action";
import { formText } from "@/lib/utils";
import { TurnoverDetail } from "@/components/app/turnover-detail";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useProperties, useRooms, useTurnovers } from "@/lib/data";
import { useOrg } from "@/lib/org";
import {
  canManage,
  errorMessage,
  formatDate,
  progressPct,
  STAGES,
  STAGE_LABEL,
} from "@/lib/turnover";

export const Route = createFileRoute("/_authenticated/turnovers")({
  head: () => ({
    meta: [
      { title: "Rotaciones · Propia AI TurnOS" },
      { name: "description", content: "Rotaciones de TurnOS" },
      { property: "og:title", content: "Rotaciones · Propia AI" },
      { property: "og:description", content: "Rotaciones de TurnOS" },
    ],
  }),
  component: TurnoversRoute,
});

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
// The SQL date argument is nullable. Supabase's generated Args omit null for RPC arguments.
const sqlNullDate = null as unknown as string;

function TurnoversRoute() {
  const { orgId } = useOrg();
  return <TurnoversPage key={orgId} />;
}

function TurnoversPage() {
  const { role } = useOrg();
  const properties = useProperties();
  const rooms = useRooms();
  const turnovers = useTurnovers();
  const [property, setProperty] = useState("");
  const [stage, setStage] = useState("");
  const [state, setState] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [createProperty, setCreateProperty] = useState("");
  const detail = turnovers.data?.find(({ id }) => id === selected);
  const roomProperties = new Map(rooms.data?.map(({ id, property_id }) => [id, property_id]));
  const activeRooms = new Set(
    turnovers.data?.filter(({ status }) => status !== "closed").map(({ room_id }) => room_id),
  );
  const availableRooms =
    rooms.data?.filter(
      (room) =>
        room.property_id === createProperty &&
        room.status !== "out_of_service" &&
        !activeRooms.has(room.id),
    ) ?? [];
  const queries = [turnovers, properties, rooms];
  const failures = queries.filter((query) => query.isError);
  const loading = queries.some((query) => query.isPending);
  const invalidRange = !!from && !!to && from > to;
  const filtered =
    turnovers.data?.filter(
      (item) =>
        (!property || roomProperties.get(item.room_id) === property) &&
        (!stage || item.status === stage) &&
        (!state ||
          state === (item.status === "closed" ? "closed" : (item.hold_kind ?? "active"))) &&
        (!from || item.move_out_date >= from) &&
        (!to || item.move_out_date <= to),
    ) ?? [];

  return (
    <>
      <PageHeader
        title="Rotaciones"
        actions={
          canManage(role) && (
            <Button
              disabled={loading || failures.length > 0}
              onClick={() => {
                setCreateProperty("");
                setCreating(true);
              }}
            >
              Nueva rotación
            </Button>
          )
        }
      />
      {failures.length ? (
        <div role="alert">
          <EmptyState
            title="No se pudieron cargar las rotaciones"
            description={errorMessage(failures[0]?.error)}
            action={
              <Button
                variant="outline"
                onClick={() => void Promise.all(failures.map((query) => query.refetch()))}
              >
                Reintentar
              </Button>
            }
          />
        </div>
      ) : loading ? (
        <div role="status" aria-label="Cargando rotaciones">
          <LoadingBlock />
        </div>
      ) : (
        <>
          <div className="mb-5 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="turnover-property">Propiedad</Label>
              <select
                className={selectClass}
                id="turnover-property"
                value={property}
                onChange={(e) => setProperty(e.target.value)}
              >
                <option value="">Todas</option>
                {properties.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="turnover-stage">Etapa</Label>
              <select
                className={selectClass}
                id="turnover-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                <option value="">Todas</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="turnover-state">Estado</Label>
              <select
                className={selectClass}
                id="turnover-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="active">Activa</option>
                <option value="paused">Pausada</option>
                <option value="blocked">Bloqueada</option>
                <option value="closed">Cerrada</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="turnover-from">Salida desde</Label>
              <Input
                id="turnover-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="turnover-to">Salida hasta</Label>
              <Input
                id="turnover-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          {invalidRange ? (
            <p role="alert" className="text-sm text-destructive">
              La fecha final debe ser igual o posterior a la inicial.
            </p>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={
                turnovers.data?.length
                  ? "No hay rotaciones para estos filtros."
                  : "Todavía no hay rotaciones."
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((item) => (
                <Card key={item.id} className="shadow-card">
                  <CardHeader>
                    <CardTitle className="font-display text-lg">
                      Habitación {item.rooms?.code ?? "—"}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{item.rooms?.properties?.name}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <StageBadge status={item.status} hold={item.hold_kind} />
                    <Progress
                      value={progressPct(item.status)}
                      aria-label="Progreso de la rotación"
                    />
                    <p className="text-sm text-muted-foreground">
                      Salida prevista {formatDate(item.move_out_date)}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Ver rotación de habitación ${item.rooms?.code ?? "sin código"}`}
                      onClick={() => setSelected(item.id)}
                    >
                      Ver detalle
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {detail && (
        <TurnoverDetail key={detail.id} turnover={detail} onClose={() => setSelected(undefined)} />
      )}
      {creating && canManage(role) && (
        <TurnoverAction
          title="Nueva rotación"
          description="Registre el aviso de salida de una habitación."
          onClose={() => setCreating(false)}
          onSaved={setSelected}
          command={(form, key) => {
            const room = availableRooms.find(({ id }) => id === formText(form, "room"));
            const moveOut = formText(form, "move_out");
            const target = formText(form, "target");
            if (!room || !moveOut)
              throw new Error("Seleccione una habitación e indique la fecha prevista de salida.");
            if (target && target < moveOut)
              throw new Error("La fecha objetivo debe ser igual o posterior a la salida.");
            return supabase.rpc("open_turnover", {
              _room: room.id,
              _move_out: moveOut,
              _target: target || sqlNullDate,
              _notes: formText(form, "notes"),
              _idem: key(),
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="new-property">Propiedad</Label>
            <select
              id="new-property"
              className={selectClass}
              value={createProperty}
              required
              onChange={(e) => setCreateProperty(e.target.value)}
            >
              <option value="">Seleccione una propiedad</option>
              {properties.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-room">Habitación</Label>
            <select
              key={createProperty}
              id="new-room"
              name="room"
              className={selectClass}
              defaultValue=""
              required
            >
              <option value="">
                {createProperty && !availableRooms.length
                  ? "Sin habitaciones elegibles"
                  : "Seleccione una habitación"}
              </option>
              {availableRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-exit">Fecha prevista de salida</Label>
            <Input id="new-exit" name="move_out" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-target">Fecha objetivo (opcional)</Label>
            <Input id="new-target" name="target" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-notes">Notas (opcional)</Label>
            <Textarea id="new-notes" name="notes" />
          </div>
        </TurnoverAction>
      )}
    </>
  );
}
