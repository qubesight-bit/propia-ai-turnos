import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/_authenticated/tasks";
import { todayCR } from "@/lib/turnover";

const fixture = vi.hoisted(() => ({
  role: "owner",
  insert: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/org", () => ({ useOrg: () => ({ orgId: "org", role: fixture.role }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: fixture.rpc,
    from: (table: string) => ({
      insert: (fields: unknown) => ({
        select: () => ({ single: () => fixture.insert(table, fields) }),
      }),
      update: (fields: unknown) => {
        const filters: Record<string, unknown> = {};
        const query = {
          eq: (key: string, value: unknown) => {
            filters[key] = value;
            return query;
          },
          is: (key: string, value: unknown) => {
            filters[key] = value;
            return query;
          },
          select: () => ({ single: () => fixture.update(table, fields, filters) }),
        };
        return query;
      },
    }),
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({
    children,
    to,
    search,
  }: {
    children: ReactNode;
    to: string;
    search: { turnover: string };
  }) => <a href={`${to}?turnover=${search.turnover}`}>{children}</a>,
}));
vi.mock("@/lib/data", async (importOriginal) => {
  const data = await importOriginal<typeof import("@/lib/data")>();
  return {
    ...data,
    useProperties: () => ({
      isSuccess: true,
      data: [
        { id: "p1", name: "Freses" },
        { id: "p2", name: "Colón" },
      ],
    }),
    useRooms: () => ({
      isSuccess: true,
      data: [
        { id: "r1", property_id: "p1", code: "204", properties: { name: "Freses" } },
        { id: "r2", property_id: "p2", code: "301", properties: { name: "Colón" } },
      ],
    }),
    useTurnovers: () => ({
      isSuccess: true,
      data: [
        {
          id: "t1",
          room_id: "r1",
          status: "inspection_pending",
          rooms: { code: "204", properties: { name: "Freses" } },
        },
        {
          id: "t2",
          room_id: "r2",
          status: "ready_for_review",
          rooms: { code: "301", properties: { name: "Colón" } },
        },
      ],
    }),
    useMembers: () => ({
      isSuccess: true,
      data: [
        { user_id: "u1", full_name: "Ana Solís", role: "staff" },
        { user_id: "u2", full_name: "Juan Mora", role: "manager" },
      ],
    }),
    useTasks: () => ({
      isSuccess: true,
      data: [
        {
          id: "k1",
          organization_id: "org",
          turnover_id: "t1",
          title: "Limpiar habitación",
          status: "pending",
          type: "cleaning",
          due_date: "2000-01-01",
          assignee_id: "u1",
        },
        {
          id: "k2",
          organization_id: "org",
          turnover_id: "t2",
          title: "Revisar grifo",
          status: "done",
          type: "maintenance",
          assignee_id: null,
        },
        {
          id: "k3",
          organization_id: "org",
          turnover_id: "t2",
          title: "Inspección: Verificar llaves",
          status: "pending",
          type: "other",
          due_date: todayCR(),
          assignee_id: null,
        },
      ],
    }),
    useInspections: () => ({
      isSuccess: true,
      data: [
        {
          id: "i1",
          organization_id: "org",
          turnover_id: "t1",
          kind: "exit",
          status: "pending",
          checklist: ["Hallazgo anterior"],
        },
        {
          id: "i2",
          organization_id: "org",
          turnover_id: "t1",
          kind: "review",
          status: "pending",
          checklist: [],
        },
      ],
    }),
  };
});

function renderTasks() {
  const Page = Route.options.component!;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
}

function open(button: string) {
  fireEvent.click(screen.getByRole("button", { name: button }));
  return within(screen.getByRole("dialog"));
}

function change(dialog: ReturnType<typeof within>, label: string, value: string) {
  fireEvent.change(dialog.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  fixture.role = "owner";
  for (const operation of [fixture.rpc, fixture.insert, fixture.update]) {
    operation.mockReset().mockResolvedValue({ data: "saved", error: null });
  }
});
afterEach(cleanup);

describe("Tareas e inspecciones", () => {
  it("filtra por ubicación, estado, tipo y responsable y muestra vencimientos y enlaces", () => {
    renderTasks();
    expect(screen.getByText("Atrasada")).toBeInTheDocument();
    expect(screen.getByText("Vence hoy")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Ver rotación" })[0]).toHaveAttribute(
      "href",
      "/turnovers?turnover=t1",
    );
    change(screen, "Propiedad", "p1");
    change(screen, "Habitación", "r1");
    change(screen, "Estado", "pending");
    change(screen, "Tipo", "cleaning");
    change(screen, "Responsable", "u1");
    expect(screen.getByText("Limpiar habitación")).toBeInTheDocument();
    expect(screen.queryByText("Revisar grifo")).not.toBeInTheDocument();
    change(screen, "Responsable", "unassigned");
    expect(screen.getByText("No hay tareas para estos filtros.")).toBeInTheDocument();
  });

  it("crea una tarea de inspección dentro de una rotación con el esquema actual", async () => {
    renderTasks();
    const dialog = open("Nueva tarea");
    change(dialog, "Rotación", "t1");
    change(dialog, "Nombre", "  Verificar equipo  ");
    change(dialog, "Tipo de tarea", "inspection");
    change(dialog, "Responsable", "u1");
    change(dialog, "Fecha límite", "2026-12-12");
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(fixture.insert).toHaveBeenCalledWith("turnover_tasks", {
        title: "Inspección: Verificar equipo",
        type: "other",
        organization_id: "org",
        turnover_id: "t1",
        assignee_id: "u1",
        due_date: "2026-12-12",
      }),
    );
  });

  it("reasigna con filtros de organización, rotación y responsable previo", async () => {
    renderTasks();
    const dialog = open("Reasignar");
    change(dialog, "Nuevo responsable", "u2");
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(fixture.update).toHaveBeenCalledWith(
        "turnover_tasks",
        { assignee_id: "u2" },
        {
          organization_id: "org",
          turnover_id: "t1",
          id: "k1",
          assignee_id: "u1",
        },
      ),
    );
  });

  it("permite a staff completar y reabrir tareas sin invocar transiciones", async () => {
    fixture.role = "staff";
    renderTasks();
    expect(screen.queryByRole("button", { name: "Nueva tarea" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reasignar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Completar tarea" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const dialog = open("Marcar pendiente");
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(fixture.update).toHaveBeenCalledTimes(2));
    expect(fixture.update).toHaveBeenNthCalledWith(
      1,
      "turnover_tasks",
      { status: "done" },
      { id: "k1", organization_id: "org", turnover_id: "t1", status: "pending" },
    );
    expect(fixture.update).toHaveBeenNthCalledWith(
      2,
      "turnover_tasks",
      { status: "pending" },
      { id: "k2", organization_id: "org", turnover_id: "t2", status: "done" },
    );
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it("registra solo los puntos marcados de la inspección en la etapa permitida", async () => {
    fixture.role = "staff";
    renderTasks();
    const dialog = open("Registrar inspección");
    change(dialog, "Hallazgos", "   ");
    fireEvent.submit(dialog.getByLabelText("Hallazgos").closest("form")!);
    expect(await dialog.findByRole("alert")).toHaveTextContent("Ingrese al menos 5 caracteres");
    change(dialog, "Hallazgos", "Se revisaron las llaves.");
    change(dialog, "Punto adicional", "Cerradura probada");
    fireEvent.click(dialog.getByRole("button", { name: "Agregar" }));
    fireEvent.click(dialog.getByLabelText("Cerradura probada"));
    expect(dialog.getByLabelText("Hallazgo anterior")).toBeChecked();
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith("record_inspection", {
        _turnover: "t1",
        _kind: "exit",
        _notes: "Se revisaron las llaves.",
        _evidence_url: "",
        _checklist: ["Hallazgo anterior", "Cerradura probada"],
      }),
    );
  });

  it("deja las tareas y las inspecciones en modo lectura para viewer", () => {
    fixture.role = "viewer";
    renderTasks();
    expect(screen.getByText("Limpiar habitación")).toBeInTheDocument();
    expect(screen.getByText("Inspección de salida")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Nueva tarea|Reasignar|Completar tarea|Registrar inspección/,
      }),
    ).not.toBeInTheDocument();
  });
});
