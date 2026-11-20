import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Auditoría · Propia AI TurnOS" }, { name: "description", content: "Auditoría de TurnOS" }, { property: "og:title", content: "Auditoría · Propia AI" }, { property: "og:description", content: "Auditoría de TurnOS" }] }),
  component: () => (
    <div>
      <PageHeader title="Auditoría" />
      <EmptyState title="Pantalla en construcción" description="La base de datos y las reglas ya funcionan; esta vista falta por terminar." />
    </div>
  ),
});
