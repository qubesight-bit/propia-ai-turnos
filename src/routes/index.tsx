import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, History, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Propia AI · TurnOS — Rotación inteligente de habitaciones" },
      { name: "description", content: "Gestione la rotación de habitaciones desde el aviso de salida hasta el nuevo ingreso, con aprobaciones y auditoría." },
      { property: "og:title", content: "Propia AI · TurnOS" },
      { property: "og:description", content: "Operación autónoma de propiedades: rotaciones controladas, aprobación humana y auditoría." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="font-display text-xl font-semibold text-primary">Propia AI <span className="text-sm text-muted-foreground">TurnOS</span></div>
        <Button asChild variant="outline"><Link to="/auth" search={{ redirect: undefined }}>Ingresar</Link></Button>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Autonomous Property Operations</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight md:text-6xl">
          Cada habitación, del aviso de salida al nuevo ingreso.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Para administradores de habitaciones, residencias y apartahoteles. Etapas verificadas, checklist con evidencia y aprobación humana antes de publicar.
        </p>
        <Button asChild size="lg" className="mt-8"><Link to="/dashboard">Abrir el panel <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            { i: RefreshCcw, t: "Rotaciones con reglas", d: "No se saltan etapas: cada transición se valida en el servidor." },
            { i: ShieldCheck, t: "Aprobación humana", d: "Publicar para alquiler requiere decisión explícita de owner o manager." },
            { i: History, t: "Auditoría completa", d: "Quién hizo qué y cuándo, con estado antes y después." },
          ].map((f) => (
            <div key={f.t} className="rounded-lg border bg-card p-6 shadow-card">
              <f.i className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium">{f.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
