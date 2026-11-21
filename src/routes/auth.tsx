import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/turnover";
import { localAuthPath } from "@/lib/auth-session";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s["redirect"] === "string" ? (s["redirect"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Acceso · Propia AI TurnOS" },
      {
        name: "description",
        content: "Inicie sesión en Propia AI para gestionar la rotación de habitaciones.",
      },
      { property: "og:title", content: "Acceso · Propia AI TurnOS" },
      {
        property: "og:description",
        content: "Inicie sesión para gestionar rotaciones de habitaciones.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos"
          : errorMessage(error),
      );
      return;
    }
    navigate({ to: localAuthPath(redirect, window.location.origin) });
  }
  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/dashboard",
        data: { full_name: name },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    if (data.session) navigate({ to: "/dashboard" });
    else toast.success("Revise su correo para confirmar la cuenta y luego inicie sesión.");
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand p-10 text-primary-foreground md:flex">
        <div>
          <div className="font-display text-2xl font-semibold">Propia AI</div>
          <div className="text-xs uppercase tracking-widest opacity-80">
            TurnOS · Operación de propiedades
          </div>
        </div>
        <div className="max-w-md space-y-3">
          <p className="font-display text-3xl leading-tight">
            Del aviso de salida al nuevo ingreso, con cada paso verificado.
          </p>
          <p className="text-sm opacity-80">
            Transiciones controladas, aprobación humana para publicar y auditoría completa.
          </p>
        </div>
        <p className="text-xs opacity-70">Zona horaria: America/Costa_Rica</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 font-display text-2xl font-semibold md:hidden">Propia AI · TurnOS</h1>
          <Tabs defaultValue="in">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="in">Ingresar</TabsTrigger>
              <TabsTrigger value="up">Crear cuenta</TabsTrigger>
            </TabsList>
            <TabsContent value="in">
              <form onSubmit={signIn} className="mt-4 space-y-4">
                <Field id="e1" label="Correo" type="email" value={email} onChange={setEmail} />
                <Field
                  id="p1"
                  label="Contraseña"
                  type="password"
                  value={password}
                  onChange={setPassword}
                />
                <Button className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ingresar
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="up">
              <form onSubmit={signUp} className="mt-4 space-y-4">
                <Field id="n2" label="Nombre" value={name} onChange={setName} />
                <Field id="e2" label="Correo" type="email" value={email} onChange={setEmail} />
                <Field
                  id="p2"
                  label="Contraseña (mín. 8)"
                  type="password"
                  value={password}
                  onChange={setPassword}
                />
                <Button className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear cuenta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Field(p: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={p.id}>{p.label}</Label>
      <Input
        id={p.id}
        type={p.type ?? "text"}
        required
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
      />
    </div>
  );
}
