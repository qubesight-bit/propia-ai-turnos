import { useRef, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrg } from "@/lib/org";
import { errorMessage } from "@/lib/turnover";

export type TurnoverCommand = (
  form: FormData,
  idempotencyKey: () => string,
) => PromiseLike<{
  data: unknown;
  error: unknown;
}>;

export function TurnoverAction({
  title,
  description,
  children,
  command,
  onClose,
  onSaved,
}: {
  title: string;
  description: string;
  children: ReactNode;
  command: TurnoverCommand;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { orgId } = useOrg();
  const client = useQueryClient();
  const attempts = useRef(new Map<string, string>());
  const refresh = () =>
    Promise.all(
      ["turnovers", "rooms", "tasks", "inspections", "approvals", "audit"].map((key) =>
        client.invalidateQueries({ queryKey: [key, orgId] }),
      ),
    );
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const { data, error } = await command(form, () => {
        const fingerprint = JSON.stringify([...form]);
        let id = attempts.current.get(fingerprint);
        if (!id) {
          id = crypto.randomUUID();
          attempts.current.set(fingerprint, id);
        }
        return id;
      });
      if (error) throw error;
      return data;
    },
    onSuccess: refresh,
    onError: (error) => {
      if (typeof error === "object" && error && "code" in error && error.code === "40001") {
        void refresh();
      }
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    try {
      const result = await mutation.mutateAsync(new FormData(event.currentTarget));
      onClose();
      if (typeof result === "string") onSaved?.(result);
    } catch {
      // Keep the form and its retry key available.
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} aria-busy={mutation.isPending} className="space-y-4">
          <fieldset disabled={mutation.isPending} className="space-y-4">
            {children}
          </fieldset>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(mutation.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
