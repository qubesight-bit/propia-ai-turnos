import { describe, expect, it } from "vitest";
import { canDo, nextActions, STAGES, daysBetween } from "./turnover";

describe("reglas de rotación (espejo de la UI)", () => {
  it("el flujo tiene 10 etapas desde aviso hasta cierre", () => {
    expect(STAGES[0]).toBe("exit_announced");
    expect(STAGES.at(-1)).toBe("closed");
    expect(STAGES).toHaveLength(10);
  });

  it("desde lista para revisión solo se solicita aprobación, nunca se publica directo", () => {
    const acts = nextActions("ready_for_review");
    expect(acts.map((a) => a.kind)).toEqual(["request_approval"]);
    expect(acts.some((a) => a.kind === "transition" && a.to === "available_for_leasing")).toBe(
      false,
    );
  });

  it("en aprobación pendiente no hay transición manual a disponible", () => {
    expect(nextActions("marketing_approval_pending").every((a) => a.kind !== "transition")).toBe(
      true,
    );
  });

  it("confirmar ingreso exige fecha y solo owner/manager", () => {
    const a = nextActions("reserved").find(
      (x) => x.kind === "transition" && x.to === "move_in_completed",
    );
    expect(a && a.kind === "transition" && a.needsMoveIn).toBe(true);
    expect(canDo("staff", a!.roles)).toBe(false);
    expect(canDo("manager", a!.roles)).toBe(true);
  });

  it("viewer no puede ejecutar ninguna acción", () => {
    for (const s of STAGES)
      for (const a of nextActions(s)) expect(canDo("viewer", a.roles)).toBe(false);
  });

  it("una rotación cerrada no tiene más acciones", () => {
    expect(nextActions("closed")).toEqual([]);
  });

  it("calcula días de rotación", () => {
    expect(daysBetween("2026-01-01T00:00:00Z", "2026-01-11T00:00:00Z")).toBe(10);
  });
});
