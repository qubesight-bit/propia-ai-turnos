import { supabase } from "@/integrations/supabase/client";

export async function decideApproval(id: string, approve: boolean, note: string) {
  if (!approve && note.length < 3) throw new Error("Indique un motivo de al menos 3 caracteres.");
  const result = await supabase.rpc("decide_approval", {
    _approval: id,
    _approve: approve,
    _note: note,
  });
  if (result.error && /ya fue resuelta|no está esperando aprobación/i.test(result.error.message)) {
    return { ...result, error: { ...result.error, code: "40001" } };
  }
  return result;
}
