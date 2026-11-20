import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Building2, RefreshCcw, ClipboardCheck, ShieldCheck, History, Settings, LogOut, Menu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { ROLE_LABEL } from "@/lib/turnover";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { to: "/properties", label: "Propiedades", icon: Building2 },
  { to: "/turnovers", label: "Rotaciones", icon: RefreshCcw },
  { to: "/tasks", label: "Tareas e inspecciones", icon: ClipboardCheck },
  { to: "/approvals", label: "Aprobaciones", icon: ShieldCheck },
  { to: "/audit", label: "Auditoría", icon: History },
  { to: "/settings", label: "Ajustes", icon: Settings },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="space-y-1">
      {NAV.map((n) => {
        const active = path === n.to || path.startsWith(n.to + "/");
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const org = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground">
      <div className="px-2 pt-2">
        <div className="font-display text-xl font-semibold text-sidebar-accent-foreground">Propia AI</div>
        <div className="text-xs uppercase tracking-widest text-sidebar-primary">TurnOS</div>
      </div>
      {org.memberships.length > 1 ? (
        <Select value={org.orgId} onValueChange={org.setOrgId}>
          <SelectTrigger className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {org.memberships.map((m) => (
              <SelectItem key={m.organization_id} value={m.organization_id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="rounded-md bg-sidebar-accent px-3 py-2 text-sm text-sidebar-accent-foreground">{org.orgName}</div>
      )}
      <NavList {...(onNavigate ? { onNavigate } : {})} />
      <div className="mt-auto space-y-2 border-t border-sidebar-border pt-4 px-2">
        <div className="truncate text-xs text-sidebar-foreground/70">{org.email}</div>
        <div className="text-xs text-sidebar-primary">{ROLE_LABEL[org.role]}</div>
        <button
          className="flex items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-accent-foreground"
          onClick={async () => {
            await qc.cancelQueries();
            qc.clear();
            await supabase.auth.signOut();
            navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
          }}
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 md:block">
        <SidebarBody />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <div className="font-display text-lg font-semibold text-primary">Propia AI · TurnOS</div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menú"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-none p-0">
              <SheetTitle className="sr-only">Menú</SheetTitle>
              <SidebarBody onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-10 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingBlock() {
  return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
}
