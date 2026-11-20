import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tareas · Propia AI TurnOS" },
      { name: "description", content: "Tareas de TurnOS" },
      { property: "og:title", content: "Tareas · Propia AI" },
      { property: "og:description", content: "Tareas de TurnOS" },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Tareas" />
      <EmptyState
        title="Pantalla en construcción"
        description="La base de datos y las reglas ya funcionan; esta vista falta por terminar."
      />
    </div>
  ),
});
