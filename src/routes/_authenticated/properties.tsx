import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/app/app-shell";
import { PropertyEditor, type PropertyEditorTarget } from "@/components/app/property-editor";
import { RoomStatusBadge, StageBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";
import { useProperties, useRooms, useTurnovers } from "@/lib/data";
import { useOrg } from "@/lib/org";
import {
  canManage,
  errorMessage,
  formatDate,
  ROOM_STATUS_LABEL,
  type RoomStatus,
} from "@/lib/turnover";

export const Route = createFileRoute("/_authenticated/properties")({
  head: () => ({
    meta: [
      { title: "Propiedades · Propia AI TurnOS" },
      { name: "description", content: "Propiedades de TurnOS" },
      { property: "og:title", content: "Propiedades · Propia AI" },
      { property: "og:description", content: "Propiedades de TurnOS" },
    ],
  }),
  component: PropertiesRoute,
});

function PropertiesRoute() {
  const { orgId } = useOrg();
  return <PropertiesPage key={orgId} />;
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const rentFormat = new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC" });
const searchText = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es-CR");

function PropertiesPage() {
  const { role } = useOrg();
  const canEdit = canManage(role);
  const properties = useProperties();
  const rooms = useRooms();
  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<PropertyEditorTarget>();
  const [history, setHistory] = useState<Tables<"rooms">>();

  const term = searchText(search.trim());
  const roomsByProperty = new Map<string, Tables<"rooms">[]>();
  for (const room of rooms.data ?? []) {
    const group = roomsByProperty.get(room.property_id);
    if (group) group.push(room);
    else roomsByProperty.set(room.property_id, [room]);
  }
  const visibleProperties = (properties.data ?? [])
    .filter((property) => !propertyId || property.id === propertyId)
    .flatMap((property) => {
      const propertyMatches = [property.name, property.zone, property.address].some(
        (value) => value && searchText(value).includes(term),
      );
      const matches = (roomsByProperty.get(property.id) ?? []).filter(
        (room) =>
          (!status || room.status === status) &&
          (propertyMatches || searchText(room.code).includes(term)),
      );
      return matches.length || (propertyMatches && !status) ? [{ property, rooms: matches }] : [];
    });

  return (
    <>
      <PageHeader
        title="Propiedades"
        actions={
          canEdit && (
            <Button onClick={() => setEditor({ kind: "property" })}>Nueva propiedad</Button>
          )
        }
      />
      {properties.isError || rooms.isError ? (
        <div role="alert">
          <EmptyState
            title="No se pudieron cargar las propiedades y habitaciones"
            description={errorMessage(properties.error ?? rooms.error)}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  if (properties.isError) void properties.refetch();
                  if (rooms.isError) void rooms.refetch();
                }}
              >
                Reintentar
              </Button>
            }
          />
        </div>
      ) : properties.isPending || rooms.isPending ? (
        <div role="status" aria-label="Cargando propiedades y habitaciones">
          <LoadingBlock />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="inventory-search">Buscar propiedad o habitación</Label>
              <Input
                id="inventory-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-property">Propiedad</Label>
              <select
                id="inventory-property"
                className={selectClass}
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              >
                <option value="">Todas las propiedades</option>
                {properties.data.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-status">Estado de habitación</Label>
              <select
                id="inventory-status"
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos los estados</option>
                {Object.entries(ROOM_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {visibleProperties.length === 0 && (
            <EmptyState
              title={
                properties.data.length
                  ? "No hay resultados para estos filtros."
                  : "Todavía no hay propiedades."
              }
            />
          )}
          {visibleProperties.map(({ property, rooms }) => (
            <Card key={property.id} className="shadow-card">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="break-words font-display text-lg">
                    {property.name} {property.is_demo && <Badge variant="muted">Demo</Badge>}
                  </CardTitle>
                  {(property.zone || property.address) && (
                    <p className="break-words text-sm text-muted-foreground">
                      {[property.zone, property.address].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditor({ kind: "property", property })}
                    >
                      Editar propiedad
                    </Button>
                    <Button size="sm" onClick={() => setEditor({ kind: "room", property })}>
                      Registrar habitación
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {rooms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no hay habitaciones.</p>
                ) : (
                  <ul className="divide-y">
                    {rooms.map((room) => (
                      <li
                        key={room.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all font-medium">Habitación {room.code}</span>
                            <RoomStatusBadge status={room.status} />
                            {room.is_demo && <Badge variant="muted">Demo</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {room.monthly_rent == null
                              ? "Alquiler sin registrar"
                              : `${rentFormat.format(room.monthly_rent)} al mes`}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Historial de habitación ${room.code}`}
                            onClick={() => setHistory(room)}
                          >
                            Historial
                          </Button>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Editar habitación ${room.code}`}
                              onClick={() => setEditor({ kind: "room", property, room })}
                            >
                              Editar
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {editor && canEdit && <PropertyEditor target={editor} onClose={() => setEditor(undefined)} />}
      {history && <RoomHistory room={history} onClose={() => setHistory(undefined)} />}
    </>
  );
}

function RoomHistory({ room, onClose }: { room: Tables<"rooms">; onClose: () => void }) {
  const history = useTurnovers(room.id);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de habitación {room.code}</DialogTitle>
          <DialogDescription>Rotaciones desde la más reciente.</DialogDescription>
        </DialogHeader>
        {history.isError ? (
          <div role="alert">
            <EmptyState
              title="No se pudo cargar el historial"
              description={errorMessage(history.error)}
              action={
                <Button variant="outline" onClick={() => void history.refetch()}>
                  Reintentar
                </Button>
              }
            />
          </div>
        ) : history.isPending ? (
          <div role="status" aria-label="Cargando historial">
            <LoadingBlock />
          </div>
        ) : history.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Esta habitación todavía no tiene rotaciones.
          </p>
        ) : (
          <ul className="divide-y">
            {history.data.map((entry) => (
              <li key={entry.id} className="space-y-2 py-3">
                <StageBadge status={entry.status} hold={entry.hold_kind} />
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt>Apertura</dt>
                    <dd>{formatDate(entry.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Salida prevista</dt>
                    <dd>{formatDate(entry.move_out_date)}</dd>
                  </div>
                  <div>
                    <dt>Ingreso</dt>
                    <dd>{formatDate(entry.move_in_date)}</dd>
                  </div>
                  <div>
                    <dt>Cierre</dt>
                    <dd>{formatDate(entry.closed_at)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
