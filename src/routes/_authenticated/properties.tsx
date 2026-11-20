import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated/properties")({
  head: () => ({ meta: [{ title: "Propiedades · Propia AI TurnOS" }, { name: "description", content: "Propiedades de TurnOS" }, { property: "og:title", content: "Propiedades · Propia AI" }, { property: "og:description", content: "Propiedades de TurnOS" }] }),
  component: () => (
    <div>
      <PageHeader title="Propiedades" />
      <EmptyState title="Pantalla en construcción" description="La base de datos y las reglas ya funcionan; esta vista falta por terminar." />
    </div>
  ),
});
