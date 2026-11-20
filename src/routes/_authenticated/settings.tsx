import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Ajustes · Propia AI TurnOS" },
      { name: "description", content: "Ajustes de TurnOS" },
      { property: "og:title", content: "Ajustes · Propia AI" },
      { property: "og:description", content: "Ajustes de TurnOS" },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Ajustes" />
      <EmptyState
        title="Pantalla en construcción"
        description="La base de datos y las reglas ya funcionan; esta vista falta por terminar."
      />
    </div>
  ),
});
