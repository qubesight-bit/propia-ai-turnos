import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated/turnovers")({
  head: () => ({ meta: [{ title: "Rotaciones · Propia AI TurnOS" }, { name: "description", content: "Rotaciones de TurnOS" }, { property: "og:title", content: "Rotaciones · Propia AI" }, { property: "og:description", content: "Rotaciones de TurnOS" }] }),
  component: () => (
    <div>
      <PageHeader title="Rotaciones" />
      <EmptyState title="Pantalla en construcción" description="La base de datos y las reglas ya funcionan; esta vista falta por terminar." />
    </div>
  ),
});
