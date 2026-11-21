import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useOrg } from "@/lib/org";
import { canManage, errorMessage } from "@/lib/turnover";

export type PropertyEditorTarget =
  | { kind: "property"; property?: Tables<"properties"> }
  | { kind: "room"; property: Tables<"properties">; room?: Tables<"rooms"> };

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null);
const propertySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ingrese el nombre.")
    .max(120, "El nombre admite hasta 120 caracteres."),
  zone: optionalText,
  address: optionalText,
});
const roomSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Ingrese el código.")
    .max(40, "El código admite hasta 40 caracteres."),
  monthly_rent: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{1,10}(?:[.,]\d{1,2})?$/.test(value),
      "Ingrese un alquiler no negativo, con hasta 10 dígitos enteros y 2 decimales.",
    )
    .transform((value) => (value === "" ? null : Number(value.replace(",", ".")))),
});

export function PropertyEditor({
  target,
  onClose,
}: {
  target: PropertyEditorTarget;
  onClose: () => void;
}) {
  const { orgId, role } = useOrg();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!canManage(role) || (target.property && target.property.organization_id !== orgId)) {
        throw new Error("No tiene permiso para realizar esta acción.");
      }
      const values = Object.fromEntries(form);
      if (target.kind === "property") {
        const fields = propertySchema.parse(values);
        const query = target.property
          ? supabase
              .from("properties")
              .update(fields)
              .eq("organization_id", orgId)
              .eq("id", target.property.id)
          : supabase.from("properties").insert({ ...fields, organization_id: orgId });
        const { error } = await query.select("id").single();
        if (error) throw error;
      } else {
        const fields = roomSchema.parse(values);
        const query = target.room
          ? supabase
              .from("rooms")
              .update(fields)
              .eq("organization_id", orgId)
              .eq("property_id", target.property.id)
              .eq("id", target.room.id)
          : supabase
              .from("rooms")
              .insert({ ...fields, organization_id: orgId, property_id: target.property.id });
        const { error } = await query.select("id").single();
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["properties", orgId] }),
        queryClient.invalidateQueries({ queryKey: ["rooms", orgId] }),
        queryClient.invalidateQueries({ queryKey: ["turnovers", orgId] }),
        queryClient.invalidateQueries({ queryKey: ["audit", orgId] }),
      ]);
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    try {
      await mutation.mutateAsync(new FormData(event.currentTarget));
      onClose();
    } catch {
      // The mutation exposes the error while the form stays open.
    }
  }

  const editing = target.kind === "property" ? !!target.property : !!target.room;
  const title =
    target.kind === "property"
      ? editing
        ? "Editar propiedad"
        : "Nueva propiedad"
      : editing
        ? "Editar habitación"
        : "Registrar habitación";
  const error =
    mutation.error instanceof z.ZodError
      ? mutation.error.issues.map((issue) => issue.message).join(" ")
      : mutation.error && errorMessage(mutation.error);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {target.kind === "room" ? target.property.name : "Datos de la propiedad"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate aria-busy={mutation.isPending} className="space-y-4">
          <fieldset disabled={mutation.isPending} className="space-y-4">
            {target.kind === "property" ? (
              <>
                <Field
                  name="name"
                  label="Nombre"
                  value={target.property?.name}
                  required
                  maxLength={120}
                />
                <Field name="zone" label="Zona (opcional)" value={target.property?.zone} />
                <Field
                  name="address"
                  label="Dirección (opcional)"
                  value={target.property?.address}
                />
              </>
            ) : (
              <>
                <Field
                  name="code"
                  label="Código"
                  value={target.room?.code}
                  required
                  maxLength={40}
                />
                <Field
                  name="monthly_rent"
                  label="Alquiler mensual (₡, opcional)"
                  value={target.room?.monthly_rent?.toString()}
                  inputMode="decimal"
                />
                {!editing && (
                  <p className="text-sm text-muted-foreground">Estado inicial: Ocupada.</p>
                )}
              </>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  name,
  label,
  value,
  ...props
}: {
  name: string;
  label: string;
  value: string | null | undefined;
  required?: boolean;
  maxLength?: number;
  inputMode?: "decimal";
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={value ?? ""} {...props} />
    </div>
  );
}
