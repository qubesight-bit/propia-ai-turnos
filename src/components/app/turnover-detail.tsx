import { useState, type ReactNode } from "react";
import { EmptyState, LoadingBlock } from "@/components/app/app-shell";
import { StageBadge } from "@/components/app/status-badge";
import { TurnoverAction, type TurnoverCommand } from "@/components/app/turnover-action";
import { formText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import {
  memberName,
  useApprovals,
  useInspections,
  useMembers,
  useTasks,
  useTurnoverTimeline,
  type useTurnovers,
} from "@/lib/data";
import { useOrg } from "@/lib/org";
import {
  canDo,
  canManage,
  canOperate,
  errorMessage,
  formatDate,
  nextActions,
  progressPct,
  STAGES,
  STAGE_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
  type TurnoverStatus,
} from "@/lib/turnover";

type Turnover = NonNullable<ReturnType<typeof useTurnovers>["data"]>[number];
type Action = {
  title: string;
  command: TurnoverCommand;
  fields?: ReactNode;
  managerOnly?: boolean;
};
const inspectionLabels = { exit: "Inspección de salida", review: "Revisión final" };
// SQL accepts NULL to release a hold. Generated Args only contain the enum values.
const releaseHold = null as unknown as NonNullable<Tables<"turnovers">["hold_kind"]>;

function Notes({ label = "Nota (opcional)", minLength }: { label?: string; minLength?: number }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="action-notes">{label}</Label>
      <Textarea id="action-notes" name="notes" minLength={minLength} required={!!minLength} />
    </div>
  );
}

export function TurnoverDetail({ turnover, onClose }: { turnover: Turnover; onClose: () => void }) {
  const { role, orgId } = useOrg();
  const { id, status, hold_kind: hold } = turnover;
  const manage = canManage(role);
  const operate = canOperate(role);
  const tasks = useTasks(id);
  const inspections = useInspections(id);
  const approvals = useApprovals(id);
  const timeline = useTurnoverTimeline(id);
  const members = useMembers();
  const [action, setAction] = useState<Action>();
  const title = `Habitación ${turnover.rooms?.code ?? "—"}`;
  const taskRows = tasks.data ?? [];
  const inspectionRows = inspections.data ?? [];
  const activeTasks = taskRows.filter((task) => task.status !== "cancelled");
  const pendingTasks = activeTasks.some((task) => task.status !== "done");
  const completedInspection = (kind: "exit" | "review") =>
    !inspections.isError &&
    inspectionRows.some((item) => item.kind === kind && item.status === "completed");
  const pendingApproval = approvals.data?.find((approval) => approval.status === "pending");
  const editableTasks = status !== "closed" && status !== "move_in_completed";

  function requirement(to: TurnoverStatus) {
    if (to === "preparation_in_progress" && !completedInspection("exit"))
      return "Complete la inspección de salida.";
    if (to === "ready_for_review" && (!activeTasks.length || pendingTasks || tasks.isError))
      return "Registre y complete las tareas de preparación.";
    if (to === "closed" && !turnover.move_in_date) return "Confirme la fecha de ingreso.";
    return "";
  }

  const workflow = nextActions(status).flatMap<Action & { blocked: string }>((step) => {
    if (!canDo(role, step.roles) || hold || step.kind === "await_approval") return [];
    if (step.kind === "request_approval") {
      return [
        {
          title: step.label,
          blocked:
            !completedInspection("review") || pendingTasks || tasks.isPending || tasks.isError
              ? "Complete la revisión final y las tareas pendientes."
              : "",
          fields: <Notes />,
          command: (form: FormData) =>
            supabase.rpc("request_publish_approval", {
              _turnover: id,
              _note: formText(form, "notes"),
            }),
        },
      ];
    }
    const command: TurnoverCommand = (form, key) => {
      const moveIn = formText(form, "move_in");
      if (step.needsMoveIn && !moveIn) throw new Error("Indique la fecha real de ingreso.");
      return supabase.rpc("transition_turnover", {
        _turnover: id,
        _from: status,
        _to: step.to,
        _note: formText(form, "notes"),
        _idem: key(),
        ...(step.needsMoveIn ? { _move_in: moveIn } : {}),
      });
    };
    return [
      {
        title: step.label,
        blocked: requirement(step.to),
        managerOnly: !step.roles.includes("staff"),
        fields: (
          <>
            {step.needsMoveIn && (
              <div className="space-y-2">
                <Label htmlFor="move-in">Fecha real de ingreso</Label>
                <Input id="move-in" name="move_in" type="date" required />
              </div>
            )}
            <Notes />
          </>
        ),
        command,
      },
    ];
  });

  function changeHold(kind: "paused" | "blocked" | null) {
    setAction({
      title:
        kind === "paused"
          ? "Pausar rotación"
          : kind === "blocked"
            ? "Bloquear rotación"
            : "Reanudar rotación",
      managerOnly: true,
      fields: kind ? <Notes label="Motivo" minLength={3} /> : undefined,
      command: (form) => {
        const reason = formText(form, "notes");
        if (kind && reason.length < 3)
          throw new Error("Indique un motivo de al menos 3 caracteres.");
        return supabase.rpc("set_turnover_hold", {
          _turnover: id,
          _kind: kind ?? releaseHold,
          _reason: reason,
        });
      },
    });
  }

  function recordInspection(kind: "exit" | "review") {
    const previous = inspectionRows.find((item) => item.kind === kind);
    setAction({
      title: `Registrar ${inspectionLabels[kind].toLowerCase()}`,
      fields: (
        <>
          <Notes label="Hallazgos" minLength={5} />
          <div className="space-y-2">
            <Label htmlFor="inspection-evidence">URL de evidencia (opcional)</Label>
            <Input
              id="inspection-evidence"
              type="url"
              name="evidence"
              defaultValue={previous?.evidence_url ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inspection-checklist">Puntos verificados (uno por línea)</Label>
            <Textarea
              id="inspection-checklist"
              name="checklist"
              defaultValue={
                Array.isArray(previous?.checklist)
                  ? previous.checklist.filter((entry) => typeof entry === "string").join("\n")
                  : ""
              }
            />
          </div>
        </>
      ),
      command: (form) => {
        const notes = formText(form, "notes");
        const evidence = formText(form, "evidence");
        if (notes.length < 5) throw new Error("Ingrese al menos 5 caracteres de hallazgos.");
        if (evidence && !/^https?:\/\//i.test(evidence))
          throw new Error("Ingrese una URL HTTP o HTTPS.");
        const checklist = formText(form, "checklist")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        return supabase.rpc("record_inspection", {
          _turnover: id,
          _kind: kind,
          _notes: notes,
          _evidence_url: evidence,
          _checklist: checklist,
        });
      },
    });
  }

  function decide(approvalId: string, approve: boolean) {
    setAction({
      title: approve ? "Aprobar comercialización" : "Rechazar comercialización",
      managerOnly: true,
      fields: approve ? <Notes /> : <Notes label="Motivo del rechazo" minLength={3} />,
      command: (form) => {
        const note = formText(form, "notes");
        if (!approve && note.length < 3)
          throw new Error("Indique un motivo de al menos 3 caracteres.");
        return supabase.rpc("decide_approval", {
          _approval: approvalId,
          _approve: approve,
          _note: note,
        });
      },
    });
  }

  function addTask() {
    setAction({
      title: "Agregar tarea de preparación",
      managerOnly: true,
      fields: (
        <div className="space-y-2">
          <Label htmlFor="new-task">Nombre de la tarea</Label>
          <Input id="new-task" name="title" required maxLength={200} />
          <Label htmlFor="new-task-type">Tipo</Label>
          <select
            id="new-task-type"
            name="type"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue="cleaning"
          >
            {Object.entries(TASK_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ),
      command: (form) => {
        const title = formText(form, "title");
        const type = formText(form, "type") as Tables<"turnover_tasks">["type"];
        if (!title || title.length > 200 || !Object.hasOwn(TASK_TYPE_LABEL, type))
          throw new Error("Ingrese una tarea válida.");
        return supabase
          .from("turnover_tasks")
          .insert({ organization_id: orgId, turnover_id: id, title, type })
          .select("id")
          .single();
      },
    });
  }

  function finishTask(task: Tables<"turnover_tasks">) {
    setAction({
      title: `Completar tarea: ${task.title}`,
      command: () =>
        supabase
          .from("turnover_tasks")
          .update({ status: "done" })
          .eq("organization_id", orgId)
          .eq("turnover_id", id)
          .eq("id", task.id)
          .in("status", ["pending", "in_progress"])
          .select("id")
          .single(),
    });
  }

  const details = [tasks, inspections, approvals];
  const failures = details.filter((query) => query.isError);
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {turnover.rooms?.properties?.name ?? "Detalle de rotación"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <section className="space-y-3">
              <StageBadge status={status} hold={hold} />
              {hold && <p className="break-words text-sm">Motivo: {turnover.hold_reason}</p>}
              <Progress value={progressPct(status)} aria-label="Progreso de la rotación" />
              <ol
                aria-label="Etapas de la rotación"
                className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5"
              >
                {STAGES.map((stage, index) => (
                  <li
                    key={stage}
                    aria-current={stage === status ? "step" : undefined}
                    className={
                      stage === status ? "font-semibold text-primary" : "text-muted-foreground"
                    }
                  >
                    {index + 1}. {STAGE_LABEL[stage]}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span>Salida prevista {formatDate(turnover.move_out_date)}</span>
                <span>Fecha objetivo {formatDate(turnover.target_ready_date)}</span>
                {turnover.move_in_date && <span>Ingreso {formatDate(turnover.move_in_date)}</span>}
                {turnover.closed_at && <span>Cierre {formatDate(turnover.closed_at, true)}</span>}
              </div>
              {turnover.notes && (
                <p className="whitespace-pre-wrap break-words text-sm">{turnover.notes}</p>
              )}
            </section>
            <section className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <h3 className="font-semibold">Acciones</h3>
              <div className="flex flex-wrap gap-2">
                {workflow.map(({ blocked, ...step }) => (
                  <Button
                    key={step.title}
                    size="sm"
                    disabled={!!blocked}
                    onClick={() => setAction(step)}
                  >
                    {step.title}
                  </Button>
                ))}
                {manage &&
                  status !== "closed" &&
                  (hold ? (
                    <Button size="sm" variant="outline" onClick={() => changeHold(null)}>
                      Reanudar rotación
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => changeHold("paused")}>
                        Pausar rotación
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => changeHold("blocked")}>
                        Bloquear rotación
                      </Button>
                    </>
                  ))}
                {manage &&
                  !hold &&
                  status === "marketing_approval_pending" &&
                  !approvals.isError &&
                  pendingApproval && (
                    <>
                      <Button size="sm" onClick={() => decide(pendingApproval.id, true)}>
                        Aprobar comercialización
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(pendingApproval.id, false)}
                      >
                        Rechazar comercialización
                      </Button>
                    </>
                  )}
              </div>
              {workflow
                .filter(({ blocked }) => blocked)
                .map(({ title, blocked }) => (
                  <p key={title} className="text-sm text-muted-foreground">
                    {blocked}
                  </p>
                ))}
              {status === "marketing_approval_pending" && (
                <p className="text-sm">Pendiente de decisión de propietario o administrador.</p>
              )}
              {(!operate || status === "closed") && (
                <p className="text-sm text-muted-foreground">Sin acciones disponibles.</p>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold">Tareas e inspecciones</h3>
              {failures.length > 0 && (
                <div role="alert" className="space-y-2">
                  <p className="text-sm text-destructive">{errorMessage(failures[0]?.error)}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void Promise.all(failures.map((query) => query.refetch()))}
                  >
                    Reintentar requisitos
                  </Button>
                </div>
              )}
              {details.some((query) => query.isPending) && (
                <div role="status" aria-label="Cargando requisitos">
                  <LoadingBlock />
                </div>
              )}
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div className="space-y-2 rounded-lg border p-3">
                  <h4 className="text-sm font-semibold">Tareas de preparación</h4>
                  {tasks.isSuccess && !taskRows.length && (
                    <p className="text-sm text-muted-foreground">Sin tareas registradas.</p>
                  )}
                  <ul className="divide-y">
                    {taskRows.map((task) => (
                      <li key={task.id} className="space-y-1 py-2 text-sm">
                        <p className="break-words font-medium">{task.title}</p>
                        <p className="text-muted-foreground">
                          {TASK_STATUS_LABEL[task.status]} ·{" "}
                          {memberName(members.data, task.assignee_id)}
                        </p>
                        {operate &&
                          editableTasks &&
                          (task.status === "pending" || task.status === "in_progress") && (
                            <Button size="sm" variant="outline" onClick={() => finishTask(task)}>
                              Completar tarea
                            </Button>
                          )}
                      </li>
                    ))}
                  </ul>
                  {manage && status === "preparation_in_progress" && (
                    <Button size="sm" variant="outline" onClick={addTask}>
                      Agregar tarea
                    </Button>
                  )}
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  <h4 className="text-sm font-semibold">Inspecciones</h4>
                  {inspections.isSuccess && !inspectionRows.length && (
                    <p className="text-sm text-muted-foreground">Sin inspecciones registradas.</p>
                  )}
                  <ul className="divide-y">
                    {inspectionRows.map((item) => (
                      <li key={item.id} className="space-y-1 py-2 text-sm">
                        <p className="font-medium">{inspectionLabels[item.kind]}</p>
                        <p className="text-muted-foreground">
                          {item.status === "completed"
                            ? `Completada · ${memberName(members.data, item.inspector_id)}`
                            : "Pendiente"}
                        </p>
                        {item.notes && (
                          <p className="whitespace-pre-wrap break-words">{item.notes}</p>
                        )}
                        {item.evidence_url && /^https?:\/\//i.test(item.evidence_url) && (
                          <a
                            href={item.evidence_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            Ver evidencia
                          </a>
                        )}
                        {operate &&
                          status ===
                            (item.kind === "exit" ? "inspection_pending" : "ready_for_review") &&
                          item.status === "pending" && (
                            <div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => recordInspection(item.kind)}
                              >
                                Registrar {inspectionLabels[item.kind].toLowerCase()}
                              </Button>
                            </div>
                          )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {approvals.data?.length ? (
              <section className="space-y-2">
                <h3 className="font-semibold">Aprobaciones comerciales</h3>
                <ul className="divide-y rounded-lg border px-3">
                  {approvals.data.map((approval) => (
                    <li key={approval.id} className="space-y-1 py-2 text-sm">
                      <p className="font-medium">
                        {approval.status === "approved"
                          ? "Aprobada"
                          : approval.status === "rejected"
                            ? "Rechazada"
                            : "Pendiente"}
                      </p>
                      <p>
                        Solicitud de {memberName(members.data, approval.requested_by)} ·{" "}
                        {formatDate(approval.created_at, true)}
                      </p>
                      {approval.decided_at && (
                        <p>
                          Decisión de {memberName(members.data, approval.decided_by)} ·{" "}
                          {formatDate(approval.decided_at, true)}
                        </p>
                      )}
                      {approval.request_note && (
                        <p className="break-words">{approval.request_note}</p>
                      )}
                      {approval.decision_note && (
                        <p className="break-words">{approval.decision_note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="font-semibold">Línea de tiempo</h3>
              {members.isError && (
                <p role="status" className="text-sm text-muted-foreground">
                  Los nombres de los responsables no están disponibles.
                </p>
              )}
              {timeline.isError ? (
                <div role="alert">
                  <EmptyState
                    title="No se pudo cargar la línea de tiempo"
                    action={
                      <Button size="sm" variant="outline" onClick={() => void timeline.refetch()}>
                        Reintentar historial
                      </Button>
                    }
                  />
                </div>
              ) : timeline.isPending ? (
                <div role="status" aria-label="Cargando línea de tiempo">
                  <LoadingBlock />
                </div>
              ) : timeline.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin acciones registradas.</p>
              ) : (
                <ol className="space-y-3 border-s-2 border-primary/25 ps-4">
                  {timeline.data.map((event) => {
                    const details = auditDetails(event);
                    return (
                      <li key={event.id} className="text-sm">
                        <p className="font-medium">{details.title}</p>
                        {details.note && (
                          <p className="whitespace-pre-wrap break-words">{details.note}</p>
                        )}
                        <p className="text-muted-foreground">
                          {event.actor_id ? memberName(members.data, event.actor_id) : "Sistema"} ·{" "}
                          <time dateTime={event.created_at}>
                            {formatDate(event.created_at, true)}
                          </time>
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
      {action && (action.managerOnly ? manage : operate) && (
        <TurnoverAction
          title={action.title}
          description={title}
          onClose={() => setAction(undefined)}
          command={action.command}
        >
          {action.fields}
        </TurnoverAction>
      )}
    </>
  );
}

function jsonText(json: Json, key: string) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return "";
  const value = json[key];
  return typeof value === "string" ? value : "";
}

function auditDetails(event: Tables<"audit_events">) {
  const after = (key: string) => jsonText(event.after_json, key);
  const before = (key: string) => jsonText(event.before_json, key);
  if (event.action === "transition") {
    const stage = after("status") as TurnoverStatus;
    return { title: STAGE_LABEL[stage] ?? "Cambio de etapa", note: after("note") };
  }
  switch (event.action) {
    case "open":
      return { title: "Apertura de rotación" };
    case "hold_set":
      return {
        title: after("hold_kind") === "paused" ? "Rotación pausada" : "Rotación bloqueada",
        note: after("hold_reason"),
      };
    case "hold_released":
      return { title: "Rotación reanudada" };
  }
  switch (event.entity_type) {
    case "turnover_tasks":
      return {
        title:
          event.action === "delete"
            ? "Tarea eliminada"
            : after("status") === "done" && before("status") !== "done"
              ? "Tarea completada"
              : event.action === "insert"
                ? "Tarea creada"
                : "Tarea actualizada",
        note: after("title") || before("title"),
      };
    case "inspections":
      return {
        title:
          after("kind") === "review"
            ? "Revisión final actualizada"
            : "Inspección de salida actualizada",
        note: after("notes"),
      };
    case "approvals":
      return {
        title:
          after("status") === "approved"
            ? "Comercialización aprobada"
            : after("status") === "rejected"
              ? "Comercialización rechazada"
              : "Solicitud de aprobación",
        note: after("decision_note") || after("request_note"),
      };
    default:
      return { title: event.action };
  }
}
