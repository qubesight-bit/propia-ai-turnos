import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, type prepareAuditEvent } from "@/lib/audit";
import {
  useAuditPage,
  useMembers,
  useProperties,
  useRooms,
  useTurnovers,
  type AuditFilters,
} from "@/lib/data";
import { useOrg } from "@/lib/org";
import { errorMessage, formatDate } from "@/lib/turnover";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Auditoría · Propia AI TurnOS" },
      { name: "description", content: "Auditoría de TurnOS" },
      { property: "og:title", content: "Auditoría · Propia AI" },
      { property: "og:description", content: "Auditoría de TurnOS" },
    ],
  }),
  component: AuditRoute,
});

const INITIAL_FILTERS: AuditFilters = { from: "", to: "", actor: "", action: "", entity: "" };
type AuditEvent = ReturnType<typeof prepareAuditEvent>;

function AuditRoute() {
  const { orgId } = useOrg();
  return <AuditPage key={orgId} />;
}

function AuditPage() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [page, setPage] = useState(0);
  const audit = useAuditPage(filters, page);
  const members = useMembers();
  const properties = useProperties();
  const rooms = useRooms();
  const turnovers = useTurnovers();
  const propertyById = new Map(properties.data?.map((value) => [value.id, value]));
  const roomById = new Map(rooms.data?.map((value) => [value.id, value]));
  const turnoverById = new Map(turnovers.data?.map((value) => [value.id, value]));
  const events = audit.data?.events ?? [];
  const memberById = new Map(members.data?.map((member) => [member.user_id, member]));
  const invalidDates = !!filters.from && !!filters.to && filters.from > filters.to;
  const unidentifiedActors = new Set(
    events.flatMap(({ actor_id }) => (actor_id && !memberById.has(actor_id) ? [actor_id] : [])),
  );
  if (filters.actor && filters.actor !== "system" && !memberById.has(filters.actor)) {
    unidentifiedActors.add(filters.actor);
  }

  function updateFilter(key: keyof AuditFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  }

  function related(event: AuditEvent) {
    const turnoverId =
      event.entity_type === "turnovers" ? event.entity_id : event.references.turnover;
    const turnover = turnoverId ? turnoverById.get(turnoverId) : undefined;
    const roomId =
      event.entity_type === "rooms"
        ? event.entity_id
        : (turnover?.room_id ?? event.references.room);
    const room = roomId ? roomById.get(roomId) : undefined;
    const propertyId =
      event.entity_type === "properties"
        ? event.entity_id
        : (room?.property_id ?? event.references.property);
    const propertyName = propertyId ? propertyById.get(propertyId)?.name : undefined;
    return {
      turnover: turnover?.id,
      label: [propertyName, room && `Habitación ${room.code}`].filter(Boolean).join(" · "),
    };
  }

  return (
    <>
      <PageHeader title="Auditoría" />
      <div className="mb-5 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-2">
          <Label htmlFor="audit-from">Desde</Label>
          <Input
            id="audit-from"
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter("from", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="audit-to">Hasta</Label>
          <Input
            id="audit-to"
            type="date"
            value={filters.to}
            onChange={(event) => updateFilter("to", event.target.value)}
          />
        </div>
        <AuditSelect
          id="audit-actor"
          label="Responsable"
          value={filters.actor}
          onChange={(value) => updateFilter("actor", value)}
        >
          <option value="system">Sistema</option>
          {members.data?.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.full_name || `Usuario sin nombre (${member.user_id.slice(0, 8)})`}
            </option>
          ))}
          {[...unidentifiedActors].map((id) => (
            <option key={id} value={id}>
              Usuario sin perfil ({id.slice(0, 8)})
            </option>
          ))}
        </AuditSelect>
        <AuditSelect
          id="audit-action"
          label="Acción"
          value={filters.action}
          onChange={(value) => updateFilter("action", value)}
        >
          {Object.entries(AUDIT_ACTIONS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </AuditSelect>
        <AuditSelect
          id="audit-entity"
          label="Entidad"
          value={filters.entity}
          onChange={(value) => updateFilter("entity", value)}
        >
          {Object.entries(AUDIT_ENTITIES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </AuditSelect>
      </div>
      {members.isError && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Los nombres de los responsables no están disponibles.
        </p>
      )}
      {invalidDates ? (
        <p role="alert" className="text-sm text-destructive">
          La fecha final debe ser igual o posterior a la inicial.
        </p>
      ) : audit.isError ? (
        <div role="alert">
          <EmptyState
            title="No se pudo cargar la auditoría"
            description={errorMessage(audit.error)}
            action={
              <Button variant="outline" onClick={() => void audit.refetch()}>
                Reintentar
              </Button>
            }
          />
        </div>
      ) : audit.isPending ? (
        <div role="status" aria-label="Cargando auditoría">
          <LoadingBlock />
        </div>
      ) : events.length === 0 ? (
        <EmptyState title="No hay eventos para estos filtros." />
      ) : (
        <ol className="space-y-3">
          {events.map((event) => {
            const location = related(event);
            return (
              <li key={event.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold">
                          {Object.hasOwn(AUDIT_ACTIONS, event.action)
                            ? AUDIT_ACTIONS[event.action]
                            : "Evento"}{" "}
                          ·{" "}
                          {Object.hasOwn(AUDIT_ENTITIES, event.entity_type)
                            ? AUDIT_ENTITIES[event.entity_type]
                            : "Otra entidad"}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          <time dateTime={event.created_at}>
                            {formatDate(event.created_at, true)}
                          </time>{" "}
                          ·{" "}
                          {event.actor_id
                            ? memberById.get(event.actor_id)?.full_name || "Usuario"
                            : "Sistema"}
                        </p>
                        {location.label && <p className="break-words text-sm">{location.label}</p>}
                      </div>
                      {location.turnover && (
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/turnovers" search={{ turnover: location.turnover }}>
                            Ver rotación
                          </Link>
                        </Button>
                      )}
                    </div>
                    {(event.before || event.after) && (
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium text-primary">
                          Ver cambios
                        </summary>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <Snapshot title="Antes" value={event.before} />
                          <Snapshot title="Después" value={event.after} />
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
      {!invalidDates && (page > 0 || audit.data?.hasNext) && (
        <nav
          aria-label="Paginación de auditoría"
          className="mt-5 flex flex-wrap items-center justify-between gap-3"
        >
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((value) => value - 1)}
          >
            Anterior
          </Button>
          <span aria-live="polite" className="text-sm">
            Página {page + 1}
          </span>
          <Button
            variant="outline"
            disabled={!audit.data?.hasNext}
            onClick={() => setPage((value) => value + 1)}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </>
  );
}

function AuditSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">Todos</option>
        {children}
      </select>
    </div>
  );
}

function Snapshot({ title, value }: { title: string; value: AuditEvent["before"] }) {
  return (
    <section className="min-w-0 space-y-1">
      <h3 className="font-semibold">{title}</h3>
      {value && Object.keys(value.safe).length > 0 ? (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(value.safe, null, 2)}
        </pre>
      ) : (
        <p className="text-muted-foreground">
          {value == null ? "Sin registro." : "Sin campos visibles."}
        </p>
      )}
      {value?.redacted && (
        <p className="text-xs text-muted-foreground">Se omitieron campos del registro.</p>
      )}
    </section>
  );
}
