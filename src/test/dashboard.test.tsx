import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/_authenticated/dashboard";

const queries = vi.hoisted(() => ({
  rooms: vi.fn(),
  turnovers: vi.fn(),
  inspections: vi.fn(),
  approvals: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  useRooms: queries.rooms,
  useTurnovers: queries.turnovers,
  useInspections: queries.inspections,
  useApprovals: queries.approvals,
  useAudit: queries.audit,
}));
vi.mock("@/lib/org", () => ({ useOrg: () => ({ orgName: "Freses" }) }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

function renderDashboard() {
  const Dashboard = Route.options.component!;
  return render(<Dashboard />);
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("Panel de TurnOS", () => {
  it("resume las habitaciones, rotaciones abiertas e inspecciones de la etapa actual", () => {
    queries.rooms.mockReturnValue({ data: [{ status: "occupied" }, { status: "turnover" }] });
    queries.turnovers.mockReturnValue({
      data: [
        {
          id: "open",
          status: "inspection_pending",
          hold_kind: "blocked",
          created_at: "2026-01-01T00:00:00Z",
          rooms: { code: "204", properties: { name: "Freses" } },
        },
        { id: "closed", status: "closed", rooms: { code: "205" } },
      ],
    });
    queries.inspections.mockReturnValue({
      data: [
        { status: "pending", kind: "exit", turnovers: { status: "inspection_pending" } },
        { status: "pending", kind: "review", turnovers: { status: "inspection_pending" } },
        { status: "completed", kind: "review", turnovers: { status: "ready_for_review" } },
      ],
    });
    queries.approvals.mockReturnValue({ data: [{ status: "approved" }, { status: "pending" }] });
    queries.audit.mockReturnValue({
      data: [
        {
          id: "event",
          action: "open",
          entity_type: "turnovers",
          created_at: "2026-01-01T12:00:00Z",
        },
      ],
    });

    renderDashboard();

    expect(screen.getByText("Habitaciones").nextElementSibling).toHaveTextContent("2");
    expect(
      screen.getByText("Inspecciones pendientes en su etapa").nextElementSibling,
    ).toHaveTextContent("1");
    expect(screen.getByText("Aprobaciones pendientes").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Habitación 204 · Freses")).toBeInTheDocument();
    expect(screen.queryByText(/205/)).toBeNull();
    expect(screen.getByText("Bloqueada")).toBeInTheDocument();
    expect(screen.getByText("Apertura · Rotación")).toBeInTheDocument();
    expect(queries.audit).toHaveBeenCalledWith(undefined, 6);
  });

  it("muestra carga, errores recuperables y estados vacíos", () => {
    for (const query of Object.values(queries)) query.mockReturnValue({ data: [] });
    queries.rooms.mockReturnValue({ isPending: true });
    const view = renderDashboard();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando panel");

    const refetch = vi.fn();
    queries.rooms.mockReturnValue({ isError: true, refetch });
    const Dashboard = Route.options.component!;
    view.rerender(<Dashboard />);
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    queries.rooms.mockReturnValue({ data: [] });
    view.rerender(<Dashboard />);
    expect(screen.getByText("No hay habitaciones registradas.")).toBeInTheDocument();
    expect(screen.getByText("No hay rotaciones abiertas.")).toBeInTheDocument();
    expect(screen.getByText("No hay actividad registrada.")).toBeInTheDocument();
  });
});
