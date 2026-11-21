import { useState, type KeyboardEvent } from "react";
import { TurnoverAction } from "@/components/app/turnover-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";
import { useOrg } from "@/lib/org";
import { INSPECTION_LABEL, saveInspection } from "@/lib/task-operations";
import { canOperate } from "@/lib/turnover";
import { formText } from "@/lib/utils";

const suggestions = {
  exit: ["Llaves recibidas", "Inventario verificado", "Daños y hallazgos registrados"],
  review: ["Limpieza verificada", "Mantenimiento verificado", "Inventario listo para ingreso"],
};

export function InspectionEditor({
  inspection,
  description,
  onClose,
}: {
  inspection: Tables<"inspections">;
  description: string;
  onClose: () => void;
}) {
  const { orgId, role } = useOrg();
  const previous = Array.isArray(inspection.checklist)
    ? inspection.checklist.filter((entry): entry is string => typeof entry === "string")
    : [];
  const [points, setPoints] = useState(() => [
    ...new Set([...suggestions[inspection.kind], ...previous]),
  ]);
  const [draft, setDraft] = useState("");

  function addPoint() {
    const point = draft.trim();
    if (!point) return;
    setPoints((current) => (current.includes(point) ? current : [...current, point]));
    setDraft("");
  }

  function handlePointKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addPoint();
    }
  }

  return (
    <TurnoverAction
      title={INSPECTION_LABEL[inspection.kind]}
      description={description}
      onClose={onClose}
      command={(form) => {
        if (!canOperate(role) || inspection.organization_id !== orgId)
          throw new Error("No tiene permiso para registrar esta inspección.");
        if (draft.trim())
          throw new Error("Agregue el punto escrito o borre el campo antes de guardar.");
        return saveInspection(
          inspection,
          formText(form, "notes"),
          form.getAll("checked").map(String),
        );
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="inspection-notes">Hallazgos</Label>
        <Textarea
          id="inspection-notes"
          name="notes"
          defaultValue={inspection.notes ?? ""}
          minLength={5}
          required
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Marque los puntos verificados</p>
        {points.map((point) => (
          <label key={point} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="checked"
              value={point}
              defaultChecked={previous.includes(point)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="break-words">{point}</span>
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="inspection-point">Punto adicional</Label>
        <div className="flex gap-2">
          <Input
            id="inspection-point"
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handlePointKey}
          />
          <Button type="button" variant="outline" onClick={addPoint}>
            Agregar
          </Button>
        </div>
      </div>
    </TurnoverAction>
  );
}
