import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Aprobaciones · Propia AI TurnOS" },
      { name: "description", content: "Aprobaciones de TurnOS" },
      { property: "og:title", content: "Aprobaciones · Propia AI" },
      { property: "og:description", content: "Aprobaciones de TurnOS" },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Aprobaciones" />
      <EmptyState
        title="Pantalla en construcción"
        description="La base de datos y las reglas ya funcionan; esta vista falta por terminar."
      />
    </div>
  ),
});
