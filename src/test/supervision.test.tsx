import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route as AuditRoute } from "@/routes/_authenticated/audit";
import { Route as ApprovalsRoute } from "@/routes/_authenticated/approvals";
import { auditSnapshot } from "@/lib/audit";

const fixture = vi.hoisted(() => ({
  role: "owner",
  decision: "pending",
  requestOrg: "org",
  hold: null as string | null,
  rpc: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/org", () => ({ useOrg: () => ({ orgId: "org", role: fixture.role }) }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: fixture.rpc,
    from: (table: string) => {
      const params: unknown[][] = [];
      const add = (method: string, ...args: unknown[]) => {
        params.push([method, ...args]);
        return query;
      };
      const query = {
        select: (fields: string) => add("select", fields),
        eq: (key: string, value: string) => add("eq", key, value),
        is: (key: string, value: null) => add("is", key, value),
        gte: (key: string, value: string) => add("gte", key, value),
        lte: (key: string, value: string) => add("lte", key, value),
        order: (field: string) => add("order", field),
        range: (from: number, to: number) => add("range", from, to),
        abortSignal: () => fixture.audit(table, params),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/data", async (original) => ({
  ...(await original<typeof import("@/lib/data")>()),
  useMembers: () => ({
    data: [{ user_id: "actor", full_name: "Ana Mora", email: "ana@privado.test" }],
  }),
  useProperties: () => ({ data: [{ id: "p1", name: "Freses" }] }),
  useRooms: () => ({ data: [{ id: "r1", property_id: "p1", code: "204" }] }),
  useTurnovers: () => ({ data: [{ id: "t1", room_id: "r1" }] }),
  useApprovals: () =>
    useQuery({
      queryKey: ["approvals", "org"],
      queryFn: async () => [
        {
          id: "a1",
          organization_id: fixture.requestOrg,
          turnover_id: "t1",
          action: "publish_for_leasing",
          status: fixture.decision,
          requested_by: "actor",
          created_at: "2026-10-01T14:00:00Z",
          request_note: "Lista para publicar",
          turnovers: {
            status: "marketing_approval_pending",
            hold_kind: fixture.hold,
            rooms: { code: "204", properties: { name: "Freses" } },
          },
        },
        {
          id: "a2",
          organization_id: "org",
          turnover_id: "t2",
          status: "rejected",
          action: "publish_for_leasing",
          created_at: "2026-09-01T14:00:00Z",
        },
      ],
    }),
}));

function renderPage(route: typeof AuditRoute | typeof ApprovalsRoute) {
  const Page = route.options.component!;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fixture.role = "owner";
  fixture.decision = "pending";
  fixture.requestOrg = "org";
  fixture.hold = null;
  fixture.audit.mockReset();
  fixture.rpc.mockReset();
});
afterEach(cleanup);

describe("Aprobaciones", () => {
  it("filtra por estado y aplica la decisión confirmada con la RPC y sin recarga", async () => {
    fixture.rpc.mockImplementation(async () => {
      fixture.decision = "approved";
      return { data: null, error: null };
    });
    renderPage(ApprovalsRoute);
    await screen.findByText("Rechazada");
    fireEvent.change(screen.getByLabelText("Estado de la solicitud"), {
      target: { value: "pending" },
    });
    expect(screen.queryByText("Rechazada")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver solicitud" }));
    expect(screen.getByText("Lista para publicar")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("link", { name: "Ver rotación" }),
    ).toHaveAttribute("href", "/turnovers?turnover=t1");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(fixture.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith("decide_approval", {
        _approval: "a1",
        _approve: true,
        _note: "",
      }),
    );
    expect(await screen.findByText("Aprobada")).toBeInTheDocument();
  });

  it.each([
    { role: "viewer", org: "org", hold: null },
    { role: "staff", org: "org", hold: null },
    { role: "manager", org: "other", hold: null },
    { role: "manager", org: "org", hold: "blocked" },
  ])(
    "oculta decisiones para $role, organización $org y pausa $hold",
    async ({ role, org, hold }) => {
      fixture.role = role;
      fixture.requestOrg = org;
      fixture.hold = hold;
      renderPage(ApprovalsRoute);
      fireEvent.click((await screen.findAllByRole("button", { name: "Ver solicitud" }))[0]!);
      expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument();
      expect(fixture.rpc).not.toHaveBeenCalled();
    },
  );

  it("exige un motivo para el rechazo", async () => {
    renderPage(ApprovalsRoute);
    fireEvent.click((await screen.findAllByRole("button", { name: "Ver solicitud" }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const note = screen.getByLabelText("Motivo del rechazo");
    fireEvent.change(note, { target: { value: "   " } });
    fireEvent.submit(note.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Indique un motivo");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe("Auditoría", () => {
  it("pagina en el servidor, combina filtros y redacta snapshots", async () => {
    const event = {
      id: "ev",
      actor_id: "actor",
      entity_id: "t1",
      entity_type: "turnovers",
      action: "transition",
      created_at: "2026-10-01T14:00:00Z",
      before_json: {
        status: "exit_announced",
        note: "dato confidencial",
        email: "persona@privado.test",
      },
      after_json: { status: "exit_confirmed" },
    };
    fixture.audit.mockImplementation(async (_table, params: unknown[][]) => ({
      data: params.some(([method, start]) => method === "range" && start === 25)
        ? [{ ...event, id: "last" }]
        : Array.from({ length: 26 }, (_, i) => ({ ...event, id: `ev-${i}` })),
      error: null,
    }));
    const view = renderPage(AuditRoute);
    expect((await screen.findAllByText("Cambio de etapa · Rotación")).length).toBe(25);
    expect(screen.getAllByRole("link", { name: "Ver rotación" })[0]).toHaveAttribute(
      "href",
      "/turnovers?turnover=t1",
    );
    expect(screen.getAllByText("Freses · Habitación 204")).toHaveLength(25);
    expect(view.container).toHaveTextContent('"status": "exit_confirmed"');
    expect(view.container).not.toHaveTextContent(/dato confidencial|@privado.test/);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(fixture.audit).toHaveBeenLastCalledWith(
        "audit_events",
        expect.arrayContaining([
          ["eq", "organization_id", "org"],
          ["range", 25, 50],
        ]),
      ),
    );
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-02" } });
    fireEvent.change(screen.getByLabelText("Responsable"), { target: { value: "actor" } });
    fireEvent.change(screen.getByLabelText("Acción"), { target: { value: "transition" } });
    fireEvent.change(screen.getByLabelText("Entidad"), { target: { value: "turnovers" } });
    await waitFor(() =>
      expect(fixture.audit).toHaveBeenLastCalledWith(
        "audit_events",
        expect.arrayContaining([
          ["eq", "organization_id", "org"],
          ["gte", "created_at", "2026-10-01T00:00:00-06:00"],
          ["lte", "created_at", "2026-10-02T23:59:59.999999-06:00"],
          ["eq", "actor_id", "actor"],
          ["eq", "action", "transition"],
          ["eq", "entity_type", "turnovers"],
          ["range", 0, 25],
        ]),
      ),
    );
  });

  it("omite valores inesperados y objetos anidados, incluso bajo claves permitidas", () => {
    expect(
      auditSnapshot(
        { status: "secreto", hold_kind: { token: "abc" }, move_out_date: "2026-10-01" },
        "turnovers",
      ),
    ).toEqual({ safe: { move_out_date: "2026-10-01" }, redacted: true });
  });
});
