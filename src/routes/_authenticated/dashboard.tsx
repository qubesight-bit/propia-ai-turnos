import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Panel · Propia AI TurnOS" }, { name: "description", content: "Panel de TurnOS" }, { property: "og:title", content: "Panel · Propia AI" }, { property: "og:description", content: "Panel de TurnOS" }] }),
  component: () => (
    <div>
      <PageHeader title="Panel" />
      <EmptyState title="Pantalla en construcción" description="La base de datos y las reglas ya funcionan; esta vista falta por terminar." />
    </div>
  ),
});
