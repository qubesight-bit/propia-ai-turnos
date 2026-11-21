import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/_authenticated/properties";

const backend = vi.hoisted(() => ({
  org: { orgId: "org-1", role: "owner" },
  requests: vi.fn(),
  error: null as { message: string } | null,
}));
vi.mock("@/lib/org", () => ({ useOrg: () => backend.org }));
vi.mock("@/integrations/supabase/client", () => {
  const data: Record<string, Record<string, unknown>[]> = {
    properties: [
      { id: "freses", organization_id: "org-1", name: "Freses", zone: "Montes de Oca" },
      { id: "colon", organization_id: "org-1", name: "Colón" },
      { id: "private", organization_id: "org-2", name: "Otra organización" },
    ],
    rooms: [
      {
        id: "r1",
        organization_id: "org-1",
        property_id: "freses",
        code: "204",
        status: "turnover",
        monthly_rent: 100.25,
      },
      {
        id: "r2",
        organization_id: "org-1",
        property_id: "freses",
        code: "205",
        status: "occupied",
      },
      {
        id: "r3",
        organization_id: "org-1",
        property_id: "colon",
        code: "301",
        status: "available",
      },
    ],
    turnovers: [
      {
        id: "t1",
        organization_id: "org-1",
        room_id: "r1",
        status: "closed",
        created_at: "2026-01-01T13:00:00Z",
      },
      {
        id: "t2",
        organization_id: "org-1",
        room_id: "r2",
        status: "reserved",
        created_at: "2026-01-02T13:00:00Z",
      },
    ],
  };
  return {
    supabase: {
      from(table: string) {
        const filters: Record<string, string> = {};
        const query = {
          select: () => query,
          order: () => query,
          range: () => query,
          eq: (column: string, value: string) => {
            filters[column] = value;
            return query;
          },
          abortSignal: () => {
            backend.requests("read", table, { ...filters });
            return Promise.resolve({
              data: data[table]?.filter((row) =>
                Object.entries(filters).every(([key, value]) => row[key] === value),
              ),
              error: null,
            });
          },
          insert: (fields: unknown) => write("insert", fields),
          update: (fields: unknown) => write("update", fields),
        };
        function write(action: string, fields: unknown) {
          const writeResult = {
            eq: (column: string, value: string) => {
              filters[column] = value;
              return writeResult;
            },
            select: () => writeResult,
            single: () => {
              backend.requests(action, table, { ...filters }, fields);
              return Promise.resolve({
                data: backend.error ? null : { id: "saved" },
                error: backend.error,
              });
            },
          };
          return writeResult;
        }
        return query;
      },
    },
  };
});

function renderProperties() {
  const Properties = Route.options.component!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Properties />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  backend.org = { orgId: "org-1", role: "owner" };
  backend.requests.mockClear();
  backend.error = null;
});
afterEach(cleanup);

describe("Propiedades y habitaciones", () => {
  it("combina búsqueda, propiedad y estado y consulta el historial por habitación", async () => {
    renderProperties();
    await screen.findByText("Habitación 204");
    expect(screen.queryByText("Otra organización")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar propiedad o habitación"), {
      target: { value: "colon" },
    });
    expect(screen.getByText("Habitación 301")).toBeInTheDocument();
    expect(screen.queryByText("Habitación 204")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar propiedad o habitación"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Propiedad"), { target: { value: "freses" } });
    fireEvent.change(screen.getByLabelText("Estado de habitación"), {
      target: { value: "turnover" },
    });
    expect(screen.queryByText("Habitación 205")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Historial de habitación 204" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("Cerrada")).toBeInTheDocument();
    expect(within(dialog).queryByText("Reservada")).not.toBeInTheDocument();
    expect(backend.requests).toHaveBeenCalledWith("read", "turnovers", {
      organization_id: "org-1",
      room_id: "r1",
    });
  });

  it.each(["staff", "viewer"])(
    "permite consultar y oculta las escrituras para %s",
    async (role) => {
      backend.org.role = role;
      renderProperties();
      expect(
        await screen.findByRole("button", { name: "Historial de habitación 204" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /nueva propiedad|editar|registrar/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("valida, crea y edita propiedades con la organización activa", async () => {
    renderProperties();
    await screen.findByText("Habitación 204");
    fireEvent.click(screen.getByRole("button", { name: "Nueva propiedad" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ingrese el nombre.");
    expect(backend.requests.mock.calls.some(([action]) => action === "insert")).toBe(false);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: " Nueva " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(backend.requests).toHaveBeenCalledWith(
      "insert",
      "properties",
      {},
      {
        name: "Nueva",
        zone: null,
        address: null,
        organization_id: "org-1",
      },
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Editar propiedad" })[0]!);
    expect(screen.getByLabelText("Nombre")).toHaveValue("Freses");
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Freses Norte" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(backend.requests).toHaveBeenCalledWith(
        "update",
        "properties",
        {
          organization_id: "org-1",
          id: "freses",
        },
        { name: "Freses Norte", zone: "Montes de Oca", address: null },
      ),
    );
  });

  it("registra y edita habitaciones sin enviar el estado y permite reintentar un error", async () => {
    backend.org.role = "manager";
    renderProperties();
    await screen.findByText("Habitación 204");
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar habitación" })[0]!);
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "206" } });
    fireEvent.change(screen.getByLabelText(/Alquiler mensual/), { target: { value: "-8" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ingrese un alquiler no negativo");
    fireEvent.change(screen.getByLabelText(/Alquiler mensual/), { target: { value: "125000,50" } });
    backend.error = { message: "duplicate key" };
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Ya existe un registro con esos datos.")).toBeInTheDocument();
    backend.error = null;
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(backend.requests).toHaveBeenCalledWith(
      "insert",
      "rooms",
      {},
      {
        organization_id: "org-1",
        property_id: "freses",
        code: "206",
        monthly_rent: 125000.5,
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar habitación 204" }));
    expect(screen.getByLabelText("Código")).toHaveValue("204");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(backend.requests).toHaveBeenCalledWith(
        "update",
        "rooms",
        {
          organization_id: "org-1",
          property_id: "freses",
          id: "r1",
        },
        { code: "204", monthly_rent: 100.25 },
      ),
    );
  });
});
