import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/_authenticated/turnovers";
import type { TurnoverStatus } from "@/lib/turnover";

const fixture = vi.hoisted(() => ({
  role: "owner",
  status: "reserved",
  rpc: vi.fn(),
  inspections: vi.fn(),
  approvals: vi.fn(),
  tasks: vi.fn(),
}));

vi.mock("@/lib/org", () => ({ useOrg: () => ({ orgId: "org", role: fixture.role }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: fixture.rpc } }));
vi.mock("@/lib/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data")>()),
  useProperties: () => ({
    data: [
      { id: "p1", name: "Freses" },
      { id: "p2", name: "Colón" },
    ],
  }),
  useRooms: () => ({
    data: [
      { id: "r1", property_id: "p1", code: "204", status: "reserved" },
      { id: "r2", property_id: "p2", code: "305", status: "occupied" },
      { id: "r3", property_id: "p1", code: "206", status: "occupied" },
      { id: "r4", property_id: "p1", code: "208", status: "out_of_service" },
    ],
  }),
  useTurnovers: () => ({
    data: [
      {
        id: "t1",
        room_id: "r1",
        status: fixture.status,
        move_out_date: "2026-12-01",
        rooms: { code: "204", properties: { name: "Freses" } },
      },
      {
        id: "t2",
        room_id: "r2",
        status: "closed",
        move_out_date: "2026-10-01",
        rooms: { code: "305", properties: { name: "Colón" } },
      },
    ],
  }),
  useTasks: fixture.tasks,
  useInspections: fixture.inspections,
  useApprovals: fixture.approvals,
  useMembers: () => ({ data: [{ user_id: "actor", full_name: "Ana Solís" }] }),
  useTurnoverTimeline: () => ({
    data: [
      {
        id: "audit",
        action: "open",
        entity_type: "turnovers",
        actor_id: "actor",
        created_at: "2026-10-01T15:00:00Z",
      },
    ],
  }),
}));

function renderTurnovers(status: TurnoverStatus = "reserved") {
  fixture.status = status;
  const Page = Route.options.component!;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
}

function openDetail() {
  fireEvent.click(screen.getByRole("button", { name: "Ver rotación de habitación 204" }));
}

function confirm() {
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
}

beforeEach(() => {
  vi.spyOn(Route, "useSearch").mockReturnValue({});
  vi.spyOn(Route, "useNavigate").mockReturnValue(vi.fn().mockResolvedValue(undefined));
  fixture.role = "owner";
  fixture.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  fixture.tasks.mockReset().mockReturnValue({ data: [], isSuccess: true });
  fixture.inspections.mockReset().mockReturnValue({ data: [], isSuccess: true });
  fixture.approvals.mockReset().mockReturnValue({ data: [], isSuccess: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Rotaciones", () => {
  it("abre el detalle de una rotación de la organización desde un enlace", () => {
    vi.mocked(Route.useSearch).mockReturnValue({ turnover: "t1" });
    renderTurnovers();
    expect(screen.getByRole("dialog", { name: "Habitación 204" })).toBeInTheDocument();
  });
  it("renderiza etapas y filtra por propiedad, etapa, estado y fecha", () => {
    renderTurnovers();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Propiedad"), { target: { value: "p1" } });
    expect(screen.queryByText("Habitación 305")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Etapa"), { target: { value: "reserved" } });
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "active" } });
    fireEvent.change(screen.getByLabelText("Salida desde"), { target: { value: "2026-11-01" } });
    expect(screen.getByText("Habitación 204")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Salida hasta"), { target: { value: "2026-11-30" } });
    expect(screen.getByText("No hay rotaciones para estos filtros.")).toBeInTheDocument();
  });

  it("consulta el historial con responsables y limita acciones según el rol", () => {
    fixture.role = "staff";
    fixture.approvals.mockReturnValue({
      data: [{ id: "a1", status: "pending", requested_by: "actor" }],
    });
    renderTurnovers("marketing_approval_pending");
    openDetail();
    const detail = within(screen.getByRole("dialog"));
    expect(detail.getByText("Apertura de rotación")).toBeInTheDocument();
    expect(detail.getAllByText(/Ana Solís/)).not.toHaveLength(0);
    expect(
      detail.queryByRole("button", { name: "Aprobar comercialización" }),
    ).not.toBeInTheDocument();
    expect(detail.queryByRole("button", { name: "Pausar rotación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva rotación" })).not.toBeInTheDocument();
  });

  it("abre una rotación válida y conserva la clave al reintentar el mismo formulario", async () => {
    fixture.rpc.mockResolvedValueOnce({ error: { message: "Error temporal" } });
    renderTurnovers();
    fireEvent.click(screen.getByRole("button", { name: "Nueva rotación" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Propiedad"), { target: { value: "p1" } });
    expect(dialog.queryByRole("option", { name: "204" })).not.toBeInTheDocument();
    expect(dialog.queryByRole("option", { name: "208" })).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("Habitación"), { target: { value: "r3" } });
    fireEvent.change(dialog.getByLabelText("Fecha prevista de salida"), {
      target: { value: "2026-12-01" },
    });
    fireEvent.change(dialog.getByLabelText("Fecha objetivo (opcional)"), {
      target: { value: "2026-11-30" },
    });
    confirm();
    expect(await dialog.findByRole("alert")).toHaveTextContent("La fecha objetivo");
    expect(fixture.rpc).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Fecha objetivo (opcional)"), { target: { value: "" } });
    confirm();
    expect(await dialog.findByText("Error temporal")).toBeInTheDocument();
    confirm();
    await waitFor(() => expect(fixture.rpc).toHaveBeenCalledTimes(2));
    expect(fixture.rpc.mock.calls[0]).toEqual(fixture.rpc.mock.calls[1]);
    expect(fixture.rpc).toHaveBeenCalledWith("open_turnover", {
      _room: "r3",
      _move_out: "2026-12-01",
      _target: null,
      _notes: "",
      _idem: expect.any(String),
    });
  });

  it("exige la fecha de ingreso y llama únicamente la transición autorizada", async () => {
    renderTurnovers();
    openDetail();
    expect(screen.queryByRole("button", { name: "Cerrar rotación" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ingreso" }));
    const form = screen.getByLabelText("Fecha real de ingreso").closest("form")!;
    fireEvent.submit(form);
    expect(await screen.findByText("Indique la fecha real de ingreso.")).toBeInTheDocument();
    expect(fixture.rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Fecha real de ingreso"), {
      target: { value: "2026-12-20" },
    });
    confirm();
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith("transition_turnover", {
        _turnover: "t1",
        _from: "reserved",
        _to: "move_in_completed",
        _move_in: "2026-12-20",
        _note: "",
        _idem: expect.any(String),
      }),
    );
  });

  it("bloquea el avance sin inspección y registra un bloqueo con motivo", async () => {
    fixture.inspections.mockReturnValue({ data: [{ id: "i1", kind: "exit", status: "pending" }] });
    renderTurnovers("inspection_pending");
    openDetail();
    expect(screen.getByRole("button", { name: "Iniciar preparación" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Registrar inspección de salida" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Bloquear rotación" }));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "   " } });
    fireEvent.submit(screen.getByLabelText("Motivo").closest("form")!);
    expect(
      await screen.findByText("Indique un motivo de al menos 3 caracteres."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Reparación urgente" } });
    confirm();
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith("set_turnover_hold", {
        _turnover: "t1",
        _kind: "blocked",
        _reason: "Reparación urgente",
      }),
    );
  });

  it("usa la RPC de decisión comercial para administradores", async () => {
    fixture.role = "manager";
    fixture.approvals.mockReturnValue({ data: [{ id: "a1", status: "pending" }] });
    renderTurnovers("marketing_approval_pending");
    openDetail();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar comercialización" }));
    confirm();
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith("decide_approval", {
        _approval: "a1",
        _approve: true,
        _note: "",
      }),
    );
  });

  it("permite que staff solicite aprobación solo después de la revisión y las tareas", async () => {
    fixture.role = "staff";
    fixture.tasks.mockReturnValue({ data: [{ id: "task", title: "Limpieza", status: "pending" }] });
    fixture.inspections.mockReturnValue({
      data: [{ id: "review", kind: "review", status: "completed" }],
    });
    const view = renderTurnovers("ready_for_review");
    openDetail();
    const label = "Solicitar aprobación comercial";
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    fixture.tasks.mockReturnValue({ data: [{ id: "task", title: "Limpieza", status: "done" }] });
    const Page = Route.options.component!;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: label }));
    confirm();
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith("request_publish_approval", {
        _turnover: "t1",
        _note: "",
      }),
    );
  });
});
