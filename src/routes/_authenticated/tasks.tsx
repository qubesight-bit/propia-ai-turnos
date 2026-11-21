import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/app/app-shell";
import { InspectionEditor } from "@/components/app/inspection-editor";
import { StageBadge } from "@/components/app/status-badge";
import { TurnoverAction } from "@/components/app/turnover-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";
import {
  memberName,
  useInspections,
  useMembers,
  useProperties,
  useRooms,
  useTasks,
  useTurnovers,
} from "@/lib/data";
import { useOrg } from "@/lib/org";
import {
  canAddPendingTask,
  canChangeTasks,
  createTask,
  INSPECTION_LABEL,
  INSPECTION_STAGE,
  INSPECTION_TASK_PREFIX,
  updateTask,
} from "@/lib/task-operations";
import {
  canManage,
  canOperate,
  errorMessage,
  formatDate,
  ROLE_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
  todayCR,
} from "@/lib/turnover";
import { formText } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tareas e inspecciones · Propia AI TurnOS" },
      { name: "description", content: "Tareas e inspecciones de las rotaciones de TurnOS" },
    ],
  }),
  component: TasksRoute,
});

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const UNASSIGNED = "unassigned";
type Task = Tables<"turnover_tasks">;
type Inspection = Tables<"inspections">;
type Editor = { kind: "create" } | { kind: "assign"; task: Task } | { kind: "status"; task: Task };

function TasksRoute() {
  const { orgId } = useOrg();
  return <TasksPage key={orgId} />;
}

function taskType(task: Task) {
  return task.type === "other" && task.title.startsWith(INSPECTION_TASK_PREFIX)
    ? "inspection"
    : task.type;
}

function TasksPage() {
  const { orgId, role } = useOrg();
  const manage = canManage(role);
  const operate = canOperate(role);
  const tasks = useTasks();
  const inspections = useInspections();
  const properties = useProperties();
  const rooms = useRooms();
  const turnovers = useTurnovers();
  const members = useMembers();
  const [property, setProperty] = useState("");
  const [room, setRoom] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [assignee, setAssignee] = useState("");
  const [editor, setEditor] = useState<Editor>();
  const [inspection, setInspection] = useState<Inspection>();
  const turnoverById = new Map(turnovers.data?.map((entry) => [entry.id, entry]));
  const roomById = new Map(rooms.data?.map((entry) => [entry.id, entry]));
  const failure = [tasks, inspections, properties, rooms, turnovers, members].filter(
    (query) => query.isError,
  );
  const referencesReady = turnovers.isSuccess && rooms.isSuccess && properties.isSuccess;
  const today = todayCR();
  const upcoming = new Date(`${today}T00:00:00Z`);
  upcoming.setUTCDate(upcoming.getUTCDate() + 3);
  const upcomingDate = upcoming.toISOString().slice(0, 10);
  const visibleTasks = (tasks.data ?? []).filter((task) => {
    const location = roomById.get(turnoverById.get(task.turnover_id)?.room_id ?? "");
    return (
      (!property || location?.property_id === property) &&
      (!room || location?.id === room) &&
      (!status || task.status === status) &&
      (!type || taskType(task) === type) &&
      (!assignee || (task.assignee_id ?? UNASSIGNED) === assignee)
    );
  });
  const eligibleTurnovers = (turnovers.data ?? []).filter((entry) =>
    canAddPendingTask(entry.status),
  );
  const referencesPending = [properties, rooms, turnovers, members].some(
    (query) => query.isPending,
  );
  const selectedTask = editor && "task" in editor ? editor.task : undefined;
  const assignmentOptions = (
    <>
      <option value="">Sin asignar</option>
      {members.data?.map((member) => (
        <option key={member.user_id} value={member.user_id}>
          {memberName(members.data, member.user_id)} · {ROLE_LABEL[member.role]}
        </option>
      ))}
    </>
  );
  const locationLabel = (id: string) => {
    const entry = turnoverById.get(id);
    return entry?.rooms
      ? [entry.rooms.properties?.name, `Habitación ${entry.rooms.code}`].filter(Boolean).join(" · ")
      : "Rotación";
  };

  function assignedMember(form: FormData) {
    const id = formText(form, "assignee");
    if (id && !members.data?.some((member) => member.user_id === id))
      throw new Error("Seleccione un miembro de la organización.");
    return id || null;
  }

  return (
    <>
      <PageHeader
        title="Tareas e inspecciones"
        actions={
          manage && (
            <Button
              onClick={() => setEditor({ kind: "create" })}
              disabled={!referencesReady || eligibleTurnovers.length === 0}
            >
              Nueva tarea
            </Button>
          )
        }
      />
      {failure.length > 0 && (
        <div role="alert" className="mb-5">
          <EmptyState
            title="No se pudieron cargar todos los datos"
            description={errorMessage(failure[0]?.error)}
            action={
              <Button
                variant="outline"
                onClick={() => void Promise.all(failure.map((query) => query.refetch()))}
              >
                Reintentar
              </Button>
            }
          />
        </div>
      )}
      <section aria-labelledby="task-list" className="space-y-4">
        <h2 id="task-list" className="font-display text-xl font-semibold">
          Tareas operativas
        </h2>
        {manage && referencesReady && eligibleTurnovers.length === 0 && (
          <p className="text-sm text-muted-foreground">Abra una rotación para registrar tareas.</p>
        )}
        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5">
          <SelectField
            id="task-property"
            label="Propiedad"
            value={property}
            onChange={(value) => {
              setProperty(value);
              setRoom("");
            }}
          >
            <option value="">Todas</option>
            {properties.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField id="task-room" label="Habitación" value={room} onChange={setRoom}>
            <option value="">Todas</option>
            {rooms.data
              ?.filter((item) => !property || item.property_id === property)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code}
                  {!property && item.properties?.name ? ` · ${item.properties.name}` : ""}
                </option>
              ))}
          </SelectField>
          <SelectField id="task-status" label="Estado" value={status} onChange={setStatus}>
            <option value="">Todos</option>
            {Object.entries(TASK_STATUS_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField id="task-type" label="Tipo" value={type} onChange={setType}>
            <option value="">Todos</option>
            {Object.entries(TASK_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            <option value="inspection">Inspección</option>
          </SelectField>
          <SelectField
            id="task-assignee"
            label="Responsable"
            value={assignee}
            onChange={setAssignee}
          >
            <option value="">Todos</option>
            <option value={UNASSIGNED}>Sin asignar</option>
            {members.data?.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {memberName(members.data, member.user_id)}
              </option>
            ))}
          </SelectField>
        </div>
        {tasks.isPending || referencesPending ? (
          <div role="status" aria-label="Cargando tareas">
            <LoadingBlock />
          </div>
        ) : !tasks.isError && visibleTasks.length === 0 ? (
          <EmptyState
            title={
              tasks.data?.length ? "No hay tareas para estos filtros." : "Todavía no hay tareas."
            }
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {visibleTasks.map((task) => {
              const stage = turnoverById.get(task.turnover_id)?.status;
              const open = canChangeTasks(stage);
              const pending = task.status === "pending" || task.status === "in_progress";
              const deadline = pending && task.due_date;
              const category = taskType(task);
              return (
                <Card key={task.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted">
                        {category === "inspection" ? "Inspección" : TASK_TYPE_LABEL[category]}
                      </Badge>
                      <Badge variant={task.status === "done" ? "success" : "outline"}>
                        {TASK_STATUS_LABEL[task.status]}
                      </Badge>
                      {deadline && deadline < today && (
                        <Badge variant="destructive">Atrasada</Badge>
                      )}
                      {deadline && deadline >= today && deadline <= upcomingDate && (
                        <Badge variant="warning">
                          {deadline === today ? "Vence hoy" : "Próxima a vencer"}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <h3 className="break-words font-semibold">{task.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {locationLabel(task.turnover_id)}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Responsable</dt>
                        <dd>
                          {task.assignee_id
                            ? memberName(members.data, task.assignee_id)
                            : "Sin asignar"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Fecha límite</dt>
                        <dd>{formatDate(task.due_date)}</dd>
                      </div>
                      {task.completed_at && (
                        <div>
                          <dt className="text-muted-foreground">Completada</dt>
                          <dd>{formatDate(task.completed_at, true)}</dd>
                        </div>
                      )}
                    </dl>
                    {task.evidence_note && (
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {task.evidence_note}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <RotationLink id={task.turnover_id} />
                      {manage && open && members.isSuccess && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditor({ kind: "assign", task })}
                        >
                          {task.assignee_id ? "Reasignar" : "Asignar"}
                        </Button>
                      )}
                      {operate &&
                        open &&
                        (pending || (task.status === "done" && canAddPendingTask(stage))) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditor({ kind: "status", task })}
                          >
                            {pending ? "Completar tarea" : "Marcar pendiente"}
                          </Button>
                        )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="inspection-list" className="mt-8 space-y-4">
        <h2 id="inspection-list" className="font-display text-xl font-semibold">
          Inspecciones
        </h2>
        {inspections.isPending ? (
          <div role="status" aria-label="Cargando inspecciones">
            <LoadingBlock />
          </div>
        ) : inspections.isSuccess && inspections.data.length === 0 ? (
          <EmptyState title="Todavía no hay inspecciones." />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {inspections.data?.map((entry) => {
              const stage = turnoverById.get(entry.turnover_id)?.status;
              const points = Array.isArray(entry.checklist)
                ? entry.checklist.filter((point) => typeof point === "string")
                : [];
              return (
                <Card key={entry.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{INSPECTION_LABEL[entry.kind]}</h3>
                      <Badge variant={entry.status === "completed" ? "success" : "muted"}>
                        {entry.status === "completed" ? "Completada" : "Pendiente"}
                      </Badge>
                      {stage && <StageBadge status={stage} />}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {locationLabel(entry.turnover_id)}
                    </p>
                    {entry.completed_at && (
                      <p className="text-sm">
                        {memberName(members.data, entry.inspector_id)} ·{" "}
                        {formatDate(entry.completed_at, true)}
                      </p>
                    )}
                    {entry.notes && (
                      <p className="whitespace-pre-wrap break-words text-sm">{entry.notes}</p>
                    )}
                    {points.length > 0 && (
                      <ul
                        aria-label="Puntos verificados"
                        className="list-disc space-y-1 ps-5 text-sm"
                      >
                        {points.map((point, index) => (
                          <li key={index}>{point}</li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <RotationLink id={entry.turnover_id} />
                      {operate &&
                        entry.status === "pending" &&
                        stage === INSPECTION_STAGE[entry.kind] && (
                          <Button size="sm" onClick={() => setInspection(entry)}>
                            Registrar inspección
                          </Button>
                        )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {editor?.kind === "create" && manage && (
        <TurnoverAction
          title="Nueva tarea"
          description="Agregue una tarea a una rotación."
          onClose={() => setEditor(undefined)}
          command={(form) => {
            const turnover = eligibleTurnovers.find(({ id }) => id === formText(form, "turnover"));
            if (!turnover) throw new Error("Seleccione una rotación que admita cambios en tareas.");
            return createTask(orgId, turnover.id, {
              title: formText(form, "title"),
              type: formText(form, "type"),
              assignee_id: assignedMember(form),
              due_date: formText(form, "due_date") || null,
            });
          }}
        >
          <SelectField
            id="new-task-turnover"
            name="turnover"
            label="Rotación"
            required
            defaultValue=""
          >
            <option value="">Seleccione una rotación</option>
            {eligibleTurnovers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {locationLabel(entry.id)} · {formatDate(entry.move_out_date)}
              </option>
            ))}
          </SelectField>
          <div className="space-y-2">
            <Label htmlFor="new-task-title">Nombre</Label>
            <Input id="new-task-title" name="title" maxLength={200} required />
          </div>
          <SelectField id="new-task-type" name="type" label="Tipo de tarea" defaultValue="cleaning">
            {Object.entries(TASK_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            <option value="inspection">Inspección</option>
          </SelectField>
          <SelectField id="new-task-assignee" name="assignee" label="Responsable" defaultValue="">
            {assignmentOptions}
          </SelectField>
          <div className="space-y-2">
            <Label htmlFor="new-task-due">Fecha límite</Label>
            <Input id="new-task-due" name="due_date" type="date" />
          </div>
        </TurnoverAction>
      )}
      {editor?.kind === "assign" && manage && selectedTask && (
        <TurnoverAction
          title="Cambiar responsable"
          description={selectedTask.title}
          onClose={() => setEditor(undefined)}
          command={(form) => updateTask(orgId, selectedTask, { assignee_id: assignedMember(form) })}
        >
          <SelectField
            id="assign-task"
            name="assignee"
            label="Nuevo responsable"
            defaultValue={selectedTask.assignee_id ?? ""}
          >
            {assignmentOptions}
          </SelectField>
        </TurnoverAction>
      )}
      {editor?.kind === "status" && operate && selectedTask && (
        <TurnoverAction
          title={selectedTask.status === "done" ? "Marcar tarea pendiente" : "Completar tarea"}
          description={selectedTask.title}
          onClose={() => setEditor(undefined)}
          command={() =>
            updateTask(orgId, selectedTask, {
              status: selectedTask.status === "done" ? "pending" : "done",
            })
          }
        >
          {null}
        </TurnoverAction>
      )}
      {inspection && operate && (
        <InspectionEditor
          key={inspection.id}
          inspection={inspection}
          description={locationLabel(inspection.turnover_id)}
          onClose={() => setInspection(undefined)}
        />
      )}
    </>
  );
}

function SelectField({
  id,
  label,
  onChange,
  children,
  ...props
}: {
  id: string;
  label: string;
  onChange?: (value: string) => void;
  children: ReactNode;
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={SELECT}
        onChange={(event) => onChange?.(event.target.value)}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

function RotationLink({ id }: { id: string }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to="/turnovers" search={{ turnover: id }}>
        Ver rotación
      </Link>
    </Button>
  );
}
